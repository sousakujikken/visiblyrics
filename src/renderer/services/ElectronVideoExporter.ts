// Electron-integrated video export service

import { useElectronAPI } from '../../shared/electronAPI';
import type { ExportOptions, ExportProgress, ExportError } from '../../shared/types';
import type { Engine } from '../engine/Engine';

export class ElectronVideoExporter {
  private electronAPI;
  private engine: Engine | null = null;
  private isExporting = false;
  
  // Event handlers
  private onProgressHandler: ((progress: ExportProgress) => void) | null = null;
  private onCompletedHandler: ((outputPath: string) => void) | null = null;
  private onErrorHandler: ((error: ExportError) => void) | null = null;
  
  // Cleanup functions for event listeners
  private cleanupHandlers: (() => void)[] = [];
  
  constructor() {
    const { electronAPI } = useElectronAPI();
    this.electronAPI = electronAPI;
    
    if (this.electronAPI) {
      this.setupEventListeners();
    }
  }
  
  get isAvailable(): boolean {
    return this.electronAPI !== null;
  }
  
  setEngine(engine: Engine) {
    this.engine = engine;
  }
  
  private setupEventListeners() {
    if (!this.electronAPI) return;
    
    // Export progress
    const progressCleanup = this.electronAPI.onExportProgress((progress) => {
      if (this.onProgressHandler) {
        this.onProgressHandler(progress);
      }
    });
    this.cleanupHandlers.push(progressCleanup);
    
    // Export completed
    const completedCleanup = this.electronAPI.onExportCompleted((outputPath) => {
      this.isExporting = false;
      if (this.onCompletedHandler) {
        this.onCompletedHandler(outputPath);
      }
    });
    this.cleanupHandlers.push(completedCleanup);
    
    // Export error
    const errorCleanup = this.electronAPI.onExportError((error) => {
      this.isExporting = false;
      if (this.onErrorHandler) {
        this.onErrorHandler(error);
      }
    });
    this.cleanupHandlers.push(errorCleanup);
    
    // Frame generation request from main process
    const frameRequestCleanup = this.electronAPI.onExportRequest('generate-frame', async (options) => {
      await this.handleFrameRequest(options);
    });
    this.cleanupHandlers.push(frameRequestCleanup);
  }
  
  private async handleFrameRequest(options: { timeMs: number; width: number; height: number }) {
    if (!this.engine || !this.electronAPI) {
      this.electronAPI?.sendExportReply('frame-error', 'Engine not available');
      return;
    }
    
    try {
      const { timeMs, width, height } = options;
      
      // Set engine to specific time
      this.engine.pause();
      this.engine.seek(timeMs);
      
      // Allow some time for the engine to update
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Capture frame
      const frameData = this.engine.captureFrame(width, height);
      
      // Convert Uint8Array to base64
      const base64Data = this.uint8ArrayToBase64(frameData);
      
      // Send frame data back to main process
      this.electronAPI.sendExportReply('frame-ready', base64Data);
      
    } catch (error) {
      console.error('Frame generation failed:', error);
      this.electronAPI?.sendExportReply('frame-error', 
        error instanceof Error ? error.message : 'Unknown frame generation error'
      );
    }
  }
  
  private uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }
  
  async startExport(options: ExportOptions): Promise<void> {
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }
    
    if (this.isExporting) {
      throw new Error('Export already in progress');
    }
    
    if (!this.engine) {
      throw new Error('Engine not set');
    }
    
    try {
      this.isExporting = true;
      await this.electronAPI.startExport(options);
    } catch (error) {
      this.isExporting = false;
      throw error;
    }
  }
  
  async cancelExport(): Promise<void> {
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }
    
    try {
      await this.electronAPI.cancelExport();
      this.isExporting = false;
    } catch (error) {
      console.error('Failed to cancel export:', error);
      throw error;
    }
  }
  
  // Event handler setters
  onProgress(handler: (progress: ExportProgress) => void) {
    this.onProgressHandler = handler;
  }
  
  onCompleted(handler: (outputPath: string) => void) {
    this.onCompletedHandler = handler;
  }
  
  onError(handler: (error: ExportError) => void) {
    this.onErrorHandler = handler;
  }
  
  // Cleanup
  dispose() {
    this.cleanupHandlers.forEach(cleanup => cleanup());
    this.cleanupHandlers = [];
    this.onProgressHandler = null;
    this.onCompletedHandler = null;
    this.onErrorHandler = null;
  }
}

// Global instance
export const electronVideoExporter = new ElectronVideoExporter();