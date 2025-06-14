/**
 * BatchVideoProcessor - 統合バッチ動画処理システム
 * 
 * SystemFFmpegWrapperとTempFileManagerを統合し、
 * シークアンドスナップ方式での高効率動画処理を提供
 */

import { SystemFFmpegWrapper, BatchVideoOptions, ComposeFinalVideoOptions, FFmpegProgress } from './SystemFFmpegWrapper';
import { TempFileManager, TempSession, StorageStats } from './TempFileManager';
import { BrowserWindow } from 'electron';
import * as path from 'path';

export interface VideoExportRequest {
  sessionId: string;
  options: {
    aspectRatio: string;
    orientation: string;
    quality: string;
    videoQuality?: string;
    fps: number;
    fileName: string;
    startTime: number;
    endTime: number;
    includeDebugVisuals?: boolean;
    includeMusicTrack?: boolean;
    audioPath?: string;
  };
}

export interface ProcessingProgress {
  phase: 'preparing' | 'capturing' | 'batch_creation' | 'composition' | 'finalizing';
  overallProgress: number;
  currentFrame?: number;
  totalFrames?: number;
  currentBatch?: number;
  totalBatches?: number;
  timeRemaining?: number;
  memoryUsage?: number;
  tempStorageUsed?: number;
  message?: string;
  ffmpegProgress?: FFmpegProgress;
}

/**
 * BatchVideoProcessor
 * 
 * 動画エクスポート処理の中央制御クラス
 * メインプロセスでの高性能バッチ処理を管理
 */
export class BatchVideoProcessor {
  private ffmpegWrapper: SystemFFmpegWrapper;
  private tempFileManager: TempFileManager;
  private processingQueue: Map<string, VideoExportRequest> = new Map();
  private isProcessing = false;
  
  constructor() {
    this.ffmpegWrapper = new SystemFFmpegWrapper();
    this.tempFileManager = new TempFileManager();
  }
  
  /**
   * 初期化とシステムチェック
   */
  async initialize(): Promise<boolean> {
    try {
      const ffmpegAvailable = await this.ffmpegWrapper.checkFFmpegAvailability();
      
      if (!ffmpegAvailable) {
        console.error('FFmpeg is not available on this system');
        return false;
      }
      
      console.log('BatchVideoProcessor initialized successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to initialize BatchVideoProcessor:', error);
      return false;
    }
  }
  
  /**
   * テンポラリセッション作成
   */
  async createTempSession(sessionId: string): Promise<string> {
    try {
      const session = await this.tempFileManager.createTempSession(sessionId);
      return session.sessionDir;
    } catch (error) {
      console.error(`Failed to create temp session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * フレーム画像保存
   */
  async saveFrameImage(sessionId: string, frameName: string, frameData: Uint8Array, width?: number, height?: number): Promise<string> {
    try {
      return await this.tempFileManager.saveFrameImage(sessionId, frameName, frameData, width, height);
    } catch (error) {
      console.error(`Failed to save frame image ${frameName} for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * スモールバッチ動画作成
   */
  async createBatchVideo(batchOptions: BatchVideoOptions): Promise<string> {
    try {
      const session = this.tempFileManager.getTempSession(batchOptions.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${batchOptions.sessionId}`);
      }
      
      // FFmpegでバッチ動画作成
      const batchVideoPath = await this.ffmpegWrapper.createBatchVideo(
        batchOptions,
        session.sessionDir,
        (progress) => {
          this.sendProgressToRenderer({
            phase: 'batch_creation',
            overallProgress: 60, // ベース進捗
            currentBatch: batchOptions.batchIndex + 1,
            message: `バッチ ${batchOptions.batchIndex + 1} を処理中...`,
            ffmpegProgress: progress
          });
        }
      );
      
      // 使用済みフレーム画像をクリーンアップ
      const frameFiles: string[] = [];
      for (let frame = batchOptions.startFrame; frame < batchOptions.endFrame; frame++) {
        frameFiles.push(path.join(session.framesDir, `frame_${frame.toString().padStart(6, '0')}.png`));
      }
      
      await this.tempFileManager.cleanupFrameImages(batchOptions.sessionId, frameFiles);
      
      return batchVideoPath;
      
    } catch (error) {
      console.error(`Failed to create batch video for session ${batchOptions.sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * 最終動画結合
   */
  async composeFinalVideo(composeOptions: ComposeFinalVideoOptions): Promise<string> {
    try {
      const session = this.tempFileManager.getTempSession(composeOptions.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${composeOptions.sessionId}`);
      }
      
      // 出力ディレクトリを使用者のデスクトップまたは指定ディレクトリに設定
      const outputDir = process.env.HOME ? path.join(process.env.HOME, 'Desktop') : session.outputDir;
      
      // outputPathが指定されていれば、それを使用するためoutputDirは無視される
      const finalVideoPath = await this.ffmpegWrapper.composeFinalVideo(
        composeOptions,
        session.sessionDir,
        outputDir,
        (progress) => {
          this.sendProgressToRenderer({
            phase: 'composition',
            overallProgress: 85, // ベース進捗
            message: '最終動画を結合中...',
            ffmpegProgress: progress
          });
        }
      );
      
      return finalVideoPath;
      
    } catch (error) {
      console.error(`Failed to compose final video for session ${composeOptions.sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * テンポラリセッションクリーンアップ
   */
  async cleanupTempSession(sessionId: string): Promise<void> {
    try {
      await this.tempFileManager.cleanupTempSession(sessionId);
      this.processingQueue.delete(sessionId);
    } catch (error) {
      console.error(`Failed to cleanup temp session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * ストレージ使用量統計取得
   */
  async getStorageStats(sessionId?: string): Promise<StorageStats> {
    try {
      return await this.tempFileManager.getStorageStats(sessionId);
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw error;
    }
  }
  
  /**
   * 動画エクスポート要求の追加
   */
  async queueVideoExport(request: VideoExportRequest): Promise<void> {
    this.processingQueue.set(request.sessionId, request);
    
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }
  
  /**
   * エクスポートキュー処理
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.size === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      for (const [sessionId, request] of this.processingQueue) {
        await this.processVideoExport(request);
        this.processingQueue.delete(sessionId);
      }
    } catch (error) {
      console.error('Error processing export queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * 個別動画エクスポート処理
   */
  private async processVideoExport(request: VideoExportRequest): Promise<void> {
    const { sessionId, options } = request;
    
    try {
      this.sendProgressToRenderer({
        phase: 'preparing',
        overallProgress: 0,
        message: 'エクスポートを準備中...'
      });
      
      // セッション作成
      await this.createTempSession(sessionId);
      
      // この時点でレンダラープロセスがフレームキャプチャを開始
      // BatchVideoProcessorは主にFFmpeg処理を担当
      
      this.sendProgressToRenderer({
        phase: 'capturing',
        overallProgress: 5,
        message: 'フレームキャプチャ準備完了'
      });
      
    } catch (error) {
      console.error(`Failed to process video export for session ${sessionId}:`, error);
      
      this.sendErrorToRenderer({
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown export error',
        sessionId
      });
      
      // エラー時のクリーンアップ
      await this.cleanupTempSession(sessionId);
    }
  }
  
  /**
   * 進捗をレンダラープロセスに送信
   */
  private sendProgressToRenderer(progress: ProcessingProgress): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('export:progress', progress);
    });
  }
  
  /**
   * エラーをレンダラープロセスに送信
   */
  private sendErrorToRenderer(error: { code: string; message: string; sessionId?: string }): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('export:error', error);
    });
  }
  
  /**
   * 完了通知をレンダラープロセスに送信
   */
  sendCompletedToRenderer(outputPath: string): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('export:completed', outputPath);
    });
  }
  
  /**
   * 現在の処理をキャンセル
   */
  async cancelCurrentProcessing(): Promise<void> {
    if (this.ffmpegWrapper.isProcessing()) {
      this.ffmpegWrapper.cancel();
    }
    
    // 処理中のセッションをクリーンアップ
    const cleanupPromises = Array.from(this.processingQueue.keys()).map(sessionId =>
      this.cleanupTempSession(sessionId)
    );
    
    await Promise.allSettled(cleanupPromises);
    
    this.isProcessing = false;
    this.processingQueue.clear();
  }
  
  /**
   * リソースクリーンアップ（アプリ終了時）
   */
  async dispose(): Promise<void> {
    await this.cancelCurrentProcessing();
    await this.tempFileManager.dispose();
  }
  
  /**
   * 処理中かどうかの確認
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
  
  /**
   * キュー内のセッション数取得
   */
  getQueueSize(): number {
    return this.processingQueue.size;
  }
}