/**
 * SystemFFmpegWrapper - システムFFmpeg活用ラッパー
 * 
 * エレクトロンアプリでシステムにインストールされたFFmpegを活用し、
 * 高性能な動画エンコーディングとバッチ結合を実行
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';

export interface BatchVideoOptions {
  sessionId: string;
  batchIndex: number;
  startFrame: number;
  endFrame: number;
  fps: number;
  width: number;
  height: number;
  videoQuality: 'low' | 'medium' | 'high' | 'highest';
}

export interface ComposeFinalVideoOptions {
  sessionId: string;
  batchVideos: string[];
  fileName: string;
  includeMusicTrack?: boolean;
  audioPath?: string;
  outputPath?: string; // フルパス（オプション）
}

export interface FFmpegProgress {
  frame: number;
  fps: number;
  bitrate: string;
  totalSize: number;
  outTimeMs: number;
  dupFrames: number;
  dropFrames: number;
  speed: number;
  progress: number;
}

/**
 * SystemFFmpegWrapper
 * 
 * 高性能なシステムFFmpegを活用した動画処理クラス
 */
export class SystemFFmpegWrapper {
  private ffmpegPath: string;
  private currentProcess: ChildProcess | null = null;
  
  constructor() {
    this.ffmpegPath = this.getFFmpegPath();
  }
  
  /**
   * システムFFmpegパスの取得
   */
  private getFFmpegPath(): string {
    const platform = process.platform;
    
    // 開発環境ではシステムFFmpegを使用
    // プロダクション環境では同梱FFmpegを使用予定
    if (platform === 'win32') {
      return 'ffmpeg.exe';
    } else if (platform === 'darwin') {
      // macOS: Homebrewまたはシステムインストール
      return '/opt/homebrew/bin/ffmpeg'; // M1/M2 Mac
    } else {
      return 'ffmpeg';
    }
  }
  
  /**
   * FFmpegの利用可能性をチェック
   */
  async checkFFmpegAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn(this.ffmpegPath, ['-version']);
      
      process.on('close', (code) => {
        resolve(code === 0);
      });
      
      process.on('error', () => {
        resolve(false);
      });
    });
  }
  
  /**
   * スモールバッチ動画作成
   */
  async createBatchVideo(
    options: BatchVideoOptions,
    tempDir: string,
    progressCallback?: (progress: FFmpegProgress) => void
  ): Promise<string> {
    const { sessionId, batchIndex, startFrame, endFrame, fps, width, height, videoQuality } = options;
    
    // 入力フレーム画像パターン（framesサブディレクトリ内）
    const inputPattern = path.join(tempDir, 'frames', `frame_%06d.png`);
    
    // 出力バッチ動画パス
    const outputPath = path.join(tempDir, 'batches', `batch_${batchIndex.toString().padStart(4, '0')}.mp4`);
    
    // バッチディレクトリ作成
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // フレーム存在確認とバッチ情報の詳細ログ
    const frameCount = endFrame - startFrame;
    console.log(`\n=== Batch ${batchIndex} Video Creation ===`);
    console.log(`Frame range: ${startFrame} to ${endFrame-1} (${frameCount} frames)`);
    console.log(`Expected duration: ${(frameCount / fps).toFixed(2)} seconds at ${fps}fps`);
    
    // フレーム連続性の検証（重要: 前のバッチとの境界確認）
    if (batchIndex > 0) {
      const prevBatchEndFrame = startFrame - 1;
      console.log(`Batch continuity check: Previous batch ended at frame ${prevBatchEndFrame}, this batch starts at frame ${startFrame}`);
      if (startFrame !== prevBatchEndFrame + 1) {
        console.warn(`WARNING: Frame discontinuity detected! Gap between batches.`);
      } else {
        console.log(`✓ Frame continuity verified: No gaps between batches`);
      }
    }
    
    // 実際のフレームファイル存在確認
    const missingFrames = [];
    for (let frame = startFrame; frame < endFrame; frame++) {
      const framePath = path.join(tempDir, 'frames', `frame_${frame.toString().padStart(6, '0')}.png`);
      try {
        await fs.access(framePath);
      } catch (error) {
        missingFrames.push(frame);
      }
    }
    
    if (missingFrames.length > 0) {
      console.error(`WARNING: Missing frames for batch ${batchIndex}:`, missingFrames.slice(0, 10), missingFrames.length > 10 ? `... and ${missingFrames.length - 10} more` : '');
    } else {
      console.log(`✓ All ${frameCount} frames exist for batch ${batchIndex}`);
    }
    
    // FFmpegコマンド引数構築
    const ffmpegArgs = [
      '-framerate', fps.toString(), // 入力フレームレートを明示的に指定
      '-start_number', startFrame.toString(),
      '-i', inputPattern,
      '-frames:v', (endFrame - startFrame).toString(),
      '-vsync', 'cfr',              // 固定フレームレート（Constant Frame Rate）を強制
      '-r', fps.toString(),
      '-c:v', 'libx264',
      '-preset', this.getPresetForQuality(videoQuality),
      '-crf', this.getCRFForQuality(videoQuality),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', // Web最適化
      '-y', // 出力ファイル上書き
      outputPath
    ];
    
    console.log(`FFmpeg command: ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);
    
    await this.executeFFmpeg(ffmpegArgs, progressCallback);
    
    // 出力動画の検証
    try {
      const stats = await fs.stat(outputPath);
      console.log(`✓ Batch video created: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // フレーム数を推定（ファイルサイズベース）
      const expectedSizeMB = frameCount * 0.1; // 大まかな推定（100KB/frame）
      if (stats.size < expectedSizeMB * 1024 * 1024 * 0.5) {
        console.warn(`WARNING: Batch video file size is unusually small. Expected ~${expectedSizeMB.toFixed(1)}MB, got ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      }
    } catch (error) {
      console.error(`ERROR: Failed to verify batch video:`, error);
      throw error;
    }
    
    console.log(`=== Batch ${batchIndex} Completed ===\n`);
    return outputPath;
  }
  
  /**
   * 最終動画結合
   */
  async composeFinalVideo(
    options: ComposeFinalVideoOptions,
    tempDir: string,
    outputDir: string,
    progressCallback?: (progress: FFmpegProgress) => void
  ): Promise<string> {
    const { sessionId, batchVideos, fileName, includeMusicTrack, audioPath } = options;
    
    // concat用リストファイル作成
    const concatListPath = path.join(tempDir, 'concat_list.txt');
    const concatContent = batchVideos
      .map(videoPath => `file '${videoPath.replace(/'/g, "'\"'\"'")}'`) // パス内の単一引用符をエスケープ
      .join('\n');
    
    await fs.writeFile(concatListPath, concatContent, 'utf8');
    
    // concat詳細ログ
    console.log(`\n=== Final Video Composition ===`);
    console.log(`Concatenating ${batchVideos.length} batch videos:`);
    for (let i = 0; i < batchVideos.length; i++) {
      try {
        const stats = await fs.stat(batchVideos[i]);
        console.log(`  ${i}: ${path.basename(batchVideos[i])} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } catch (error) {
        console.error(`  ${i}: ${path.basename(batchVideos[i])} - FILE MISSING!`);
      }
    }
    
    // 最終出力パス（outputPathが指定されていればそれを使用、なければデフォルト）
    const finalOutputPath = options.outputPath || path.join(outputDir, fileName);
    
    console.log(`Composing final video: ${batchVideos.length} batches -> ${finalOutputPath}`);
    
    // FFmpegコマンド引数構築
    const ffmpegArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath
    ];
    
    // 音声結合オプション
    if (includeMusicTrack && audioPath) {
      ffmpegArgs.push(
        '-i', audioPath,
        '-c:v', 'copy', // 動画ストリームはコピー（高速）
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest' // 短い方のストリームに合わせる
      );
    } else {
      ffmpegArgs.push(
        '-c', 'copy' // 全ストリームコピー（高速）
      );
    }
    
    ffmpegArgs.push(
      '-movflags', '+faststart', // Web最適化
      '-y', // 出力ファイル上書き
      finalOutputPath
    );
    
    await this.executeFFmpeg(ffmpegArgs, progressCallback);
    
    console.log(`Final video composed: ${finalOutputPath}`);
    return finalOutputPath;
  }
  
  /**
   * FFmpeg実行（共通処理）
   */
  private async executeFFmpeg(
    args: string[],
    progressCallback?: (progress: FFmpegProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Executing FFmpeg: ${this.ffmpegPath} ${args.join(' ')}`);
      
      this.currentProcess = spawn(this.ffmpegPath, args);
      
      let stderr = '';
      
      // FFmpegの進捗解析
      this.currentProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        if (progressCallback) {
          const progress = this.parseFFmpegProgress(chunk);
          if (progress) {
            progressCallback(progress);
          }
        }
      });
      
      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        
        if (code === 0) {
          // 成功時もフレーム数をログ出力
          const finalFrameMatch = stderr.match(/frame=\s*(\d+)/g);
          if (finalFrameMatch) {
            const lastFrameMatch = finalFrameMatch[finalFrameMatch.length - 1];
            const frameCount = lastFrameMatch.match(/\d+/)?.[0];
            console.log(`✓ FFmpeg completed successfully. Final frame count: ${frameCount}`);
          }
          resolve();
        } else {
          console.error(`✗ FFmpeg process exited with code ${code}`);
          console.error(`FFmpeg stderr:`, stderr);
          reject(new Error(`FFmpeg process exited with code ${code}. Error: ${stderr}`));
        }
      });
      
      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });
    });
  }
  
  /**
   * FFmpeg進捗解析
   */
  private parseFFmpegProgress(stderr: string): FFmpegProgress | null {
    try {
      const lines = stderr.split('\n');
      let latestProgress: Partial<FFmpegProgress> = {};
      
      for (const line of lines) {
        // frame=  123 fps= 30 q=28.0 size=    1024kB time=00:00:04.10 bitrate=2048.0kbits/s speed=1.0x
        const frameMatch = line.match(/frame=\s*(\d+)/);
        const fpsMatch = line.match(/fps=\s*([\d.]+)/);
        const bitrateMatch = line.match(/bitrate=\s*([\d.]+\w*)/);
        const sizeMatch = line.match(/size=\s*(\d+)/);
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        const speedMatch = line.match(/speed=\s*([\d.]+)x/);
        
        if (frameMatch) latestProgress.frame = parseInt(frameMatch[1]);
        if (fpsMatch) latestProgress.fps = parseFloat(fpsMatch[1]);
        if (bitrateMatch) latestProgress.bitrate = bitrateMatch[1];
        if (sizeMatch) latestProgress.totalSize = parseInt(sizeMatch[1]);
        if (speedMatch) latestProgress.speed = parseFloat(speedMatch[1]);
        
        if (timeMatch) {
          const [, hours, minutes, seconds] = timeMatch;
          latestProgress.outTimeMs = (
            parseInt(hours) * 3600 + 
            parseInt(minutes) * 60 + 
            parseFloat(seconds)
          ) * 1000;
        }
      }
      
      // 進捗率計算（フレーム数ベース、概算）
      if (latestProgress.frame && latestProgress.fps) {
        latestProgress.progress = latestProgress.frame / (latestProgress.fps * 10); // 仮想的な進捗
      }
      
      return Object.keys(latestProgress).length > 0 ? latestProgress as FFmpegProgress : null;
      
    } catch (error) {
      console.warn('Failed to parse FFmpeg progress:', error);
      return null;
    }
  }
  
  /**
   * 動画品質に応じたプリセット取得
   */
  private getPresetForQuality(quality: string): string {
    switch (quality) {
      case 'highest': return 'slower';  // 最高品質・低速
      case 'high': return 'slow';       // 高品質・やや低速
      case 'medium': return 'medium';   // 標準品質・標準速度
      case 'low': return 'fast';        // 低品質・高速
      default: return 'medium';
    }
  }
  
  /**
   * 動画品質に応じたCRF値取得
   */
  private getCRFForQuality(quality: string): string {
    switch (quality) {
      case 'highest': return '15';  // 最高品質（大容量）
      case 'high': return '18';     // 高品質
      case 'medium': return '23';   // 標準品質
      case 'low': return '28';      // 低品質（小容量）
      default: return '23';
    }
  }
  
  /**
   * 現在の処理をキャンセル
   */
  cancel(): void {
    if (this.currentProcess) {
      console.log('Cancelling FFmpeg process');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }
  
  /**
   * 処理中かどうかの確認
   */
  isProcessing(): boolean {
    return this.currentProcess !== null;
  }
}