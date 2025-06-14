import * as electron from 'electron';
const { ipcMain, BrowserWindow, dialog } = electron;
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ExportOptions, ExportProgress, ExportError } from '../shared/types';
import { BatchVideoProcessor } from './BatchVideoProcessor';

export class ExportManager {
  private ffmpegPath: string;
  private tempDir: string;
  private currentProcess: ChildProcess | null = null;
  private isExporting = false;
  
  // New: Seek and Snap Video Processor
  public batchVideoProcessor: BatchVideoProcessor;
  
  constructor() {
    this.ffmpegPath = this.getFFmpegPath();
    this.tempDir = path.join(os.tmpdir(), 'visiblyrics-export');
    
    // Initialize new Seek and Snap Video Processor
    this.batchVideoProcessor = new BatchVideoProcessor();
    this.initializeBatchProcessor();
  }
  
  /**
   * BatchVideoProcessorを初期化
   */
  private async initializeBatchProcessor(): Promise<void> {
    try {
      const initialized = await this.batchVideoProcessor.initialize();
      if (initialized) {
        console.log('BatchVideoProcessor initialized successfully');
      } else {
        console.error('Failed to initialize BatchVideoProcessor');
      }
    } catch (error) {
      console.error('Error initializing BatchVideoProcessor:', error);
    }
  }
  
  private getFFmpegPath(): string {
    // For development, use system ffmpeg
    // In production, this would be bundled with the app
    const platform = process.platform;
    
    if (platform === 'win32') {
      return 'ffmpeg.exe';
    } else {
      return 'ffmpeg';
    }
  }
  
  async startExport(options: ExportOptions): Promise<void> {
    if (this.isExporting) {
      throw new Error('Export already in progress');
    }
    
    this.isExporting = true;
    
    try {
      // Create temporary directory
      await fs.mkdir(this.tempDir, { recursive: true });
      
      this.sendProgress({
        phase: 'preparing',
        progress: 0,
        message: 'Preparing export...'
      });
      
      // Generate frames phase
      await this.generateFrames(options);
      
      // Encode video phase  
      await this.encodeVideo(options);
      
      // Cleanup
      await this.cleanup();
      
      this.sendCompleted(path.join(options.outputDir, options.fileName));
      
    } catch (error) {
      console.error('Export failed:', error);
      this.sendError({
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown export error',
        details: error
      });
    } finally {
      this.isExporting = false;
    }
  }
  
  async cancelExport(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
    
    this.isExporting = false;
    
    // Cleanup temp files
    try {
      await this.cleanup();
    } catch (error) {
      console.error('Failed to cleanup after cancel:', error);
    }
  }
  
  private async generateFrames(options: ExportOptions): Promise<void> {
    const { startTime, endTime, fps, width, height } = options;
    const duration = endTime - startTime;
    const totalFrames = Math.ceil(duration / 1000 * fps);
    
    this.sendProgress({
      phase: 'generating',
      progress: 5,
      message: `Generating ${totalFrames} frames...`,
      totalFrames
    });
    
    for (let frame = 0; frame < totalFrames; frame++) {
      if (!this.isExporting) {
        throw new Error('Export cancelled');
      }
      
      const timeMs = startTime + (frame / fps) * 1000;
      
      // Request frame from renderer process
      const frameData = await this.requestFrame(timeMs, width, height);
      
      // Save frame as PNG
      const framePath = path.join(this.tempDir, `frame_${frame.toString().padStart(6, '0')}.png`);
      await fs.writeFile(framePath, frameData);
      
      // Progress reporting (5% to 60% for frame generation)
      const progress = 5 + (frame / totalFrames) * 55;
      this.sendProgress({
        phase: 'generating',
        progress,
        message: `Generated frame ${frame + 1}/${totalFrames}`,
        currentFrame: frame + 1,
        totalFrames
      });
    }
  }
  
  private async requestFrame(timeMs: number, width: number, height: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Frame generation timeout'));
      }, 10000); // 10 second timeout
      
      // Set up one-time listeners for this frame
      const handleFrameReady = (event: any, frameData: string) => {
        clearTimeout(timeout);
        ipcMain.removeListener('export:frame-ready', handleFrameReady);
        ipcMain.removeListener('export:frame-error', handleFrameError);
        
        try {
          const buffer = Buffer.from(frameData, 'base64');
          resolve(buffer);
        } catch (error) {
          reject(new Error('Failed to decode frame data'));
        }
      };
      
      const handleFrameError = (event: any, error: string) => {
        clearTimeout(timeout);
        ipcMain.removeListener('export:frame-ready', handleFrameReady);
        ipcMain.removeListener('export:frame-error', handleFrameError);
        reject(new Error(error));
      };
      
      ipcMain.once('export:frame-ready', handleFrameReady);
      ipcMain.once('export:frame-error', handleFrameError);
      
      // Send frame generation request to renderer
      this.sendToRenderer('export:generate-frame', { timeMs, width, height });
    });
  }
  
  private async encodeVideo(options: ExportOptions): Promise<void> {
    const outputPath = path.join(options.outputDir, options.fileName);
    
    this.sendProgress({
      phase: 'encoding',
      progress: 60,
      message: 'Encoding video...'
    });
    
    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-framerate', options.fps.toString(),
        '-i', path.join(this.tempDir, 'frame_%06d.png'),
        '-c:v', 'libx264',
        '-preset', this.getPresetForQuality(options.quality),
        '-crf', this.getCRFForQuality(options.videoQuality),
        '-pix_fmt', 'yuv420p',
        '-y', // Overwrite output
        outputPath
      ];
      
      // Add audio if specified
      if (options.audioPath) {
        ffmpegArgs.splice(-2, 0, 
          '-i', options.audioPath,
          '-c:a', 'aac',
          '-shortest' // Match shortest stream duration
        );
      }
      
      this.currentProcess = spawn(this.ffmpegPath, ffmpegArgs);
      
      let stderr = '';
      
      this.currentProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
        
        // Parse FFmpeg progress
        const progress = this.parseFFmpegProgress(data.toString());
        if (progress !== null) {
          this.sendProgress({
            phase: 'encoding',
            progress: 60 + (progress * 35), // 60% to 95%
            message: `Encoding: ${Math.round(progress * 100)}%`
          });
        }
      });
      
      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        
        if (code === 0) {
          this.sendProgress({
            phase: 'finalizing',
            progress: 95,
            message: 'Finalizing...'
          });
          resolve();
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}. Error: ${stderr}`));
        }
      });
      
      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;
        reject(error);
      });
    });
  }
  
  private getPresetForQuality(quality: string): string {
    switch (quality) {
      case 'high': return 'slower';
      case 'medium': return 'medium';
      case 'low': return 'fast';
      default: return 'medium';
    }
  }
  
  private getCRFForQuality(quality: string): string {
    switch (quality) {
      case 'high': return '18';
      case 'medium': return '23';
      case 'low': return '28';
      default: return '23';
    }
  }
  
  private parseFFmpegProgress(stderr: string): number | null {
    // Parse FFmpeg progress from stderr
    // This is a simplified implementation
    const timeMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
    if (timeMatch) {
      const [, hours, minutes, seconds] = timeMatch;
      const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
      // This would need the total duration to calculate proper progress
      // For now, return a rough estimate
      return Math.min(currentTime / 60, 1); // Assume 1 minute max for demo
    }
    return null;
  }
  
  private async cleanup(): Promise<void> {
    try {
      // Remove temporary directory and all files
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to cleanup temp files:', error);
      // Don't throw - cleanup failure shouldn't fail the export
    }
  }
  
  private sendProgress(progress: ExportProgress) {
    this.sendToRenderer('export:progress', progress);
  }
  
  private sendCompleted(outputPath: string) {
    this.sendToRenderer('export:completed', outputPath);
  }
  
  private sendError(error: ExportError) {
    this.sendToRenderer('export:error', error);
  }
  
  private sendToRenderer(channel: string, data: any) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(channel, data);
    });
  }
}

export function setupExportHandlers() {
  const exportManager = new ExportManager();
  
  // Legacy export handlers
  ipcMain.handle('export:start', async (event, options: ExportOptions) => {
    try {
      await exportManager.startExport(options);
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  });
  
  ipcMain.handle('export:cancel', async () => {
    try {
      await exportManager.cancelExport();
    } catch (error) {
      console.error('Cancel export failed:', error);
      throw error;
    }
  });
  
  // New Seek and Snap export handlers
  ipcMain.handle('export:createTempSession', async (event, sessionId: string) => {
    try {
      return await exportManager.batchVideoProcessor.createTempSession(sessionId);
    } catch (error) {
      console.error('Failed to create temp session:', error);
      throw error;
    }
  });
  
  ipcMain.handle('export:saveFrameImage', async (event, sessionId: string, frameName: string, frameData: Uint8Array, width?: number, height?: number) => {
    try {
      return await exportManager.batchVideoProcessor.saveFrameImage(sessionId, frameName, frameData, width, height);
    } catch (error) {
      console.error('Failed to save frame image:', error);
      throw error;
    }
  });
  
  ipcMain.handle('export:createBatchVideo', async (event, options: {
    sessionId: string;
    batchIndex: number;
    startFrame: number;
    endFrame: number;
    fps: number;
    width: number;
    height: number;
    videoQuality: 'low' | 'medium' | 'high' | 'highest';
  }) => {
    try {
      return await exportManager.batchVideoProcessor.createBatchVideo(options);
    } catch (error) {
      console.error('Failed to create batch video:', error);
      throw error;
    }
  });
  
  ipcMain.handle('export:composeFinalVideo', async (event, options: {
    sessionId: string;
    batchVideos: string[];
    fileName: string;
    includeMusicTrack?: boolean;
    audioPath?: string;
    outputPath?: string;
  }) => {
    try {
      const outputPath = await exportManager.batchVideoProcessor.composeFinalVideo(options);
      
      // 完了通知をレンダラーに送信
      exportManager.batchVideoProcessor.sendCompletedToRenderer(outputPath);
      
      return outputPath;
    } catch (error) {
      console.error('Failed to compose final video:', error);
      throw error;
    }
  });
  
  ipcMain.handle('export:cleanupTempSession', async (event, sessionId: string) => {
    try {
      return await exportManager.batchVideoProcessor.cleanupTempSession(sessionId);
    } catch (error) {
      console.error('Failed to cleanup temp session:', error);
      throw error;
    }
  });
  
  ipcMain.handle('export:getStorageStats', async (event, sessionId?: string) => {
    try {
      return await exportManager.batchVideoProcessor.getStorageStats(sessionId);
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw error;
    }
  });
  
  // Video export save dialog handler
  ipcMain.handle('export:showSaveDialogForVideo', async (event, defaultFileName: string) => {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '動画を保存',
        defaultPath: defaultFileName,
        filters: [
          { name: 'MP4 Video', extensions: ['mp4'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      return filePath || null;
    } catch (error) {
      console.error('Failed to show save dialog:', error);
      throw error;
    }
  });
}