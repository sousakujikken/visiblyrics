/**
 * TempFileManager - システムテンポラリファイル管理
 * 
 * エレクトロンアプリでのシステムテンポラリフォルダを活用した
 * 効率的な一時ファイル管理とセッション管理
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import sharp from 'sharp';

export interface TempSession {
  sessionId: string;
  sessionDir: string;
  framesDir: string;
  batchesDir: string;
  outputDir: string;
  createdAt: Date;
  lastAccessed: Date;
}

export interface StorageStats {
  totalSpace: number;
  freeSpace: number;
  usedBySession: number;
  usagePercent: number;
}

export interface FrameValidationResult {
  isValid: boolean;
  errorMessage?: string;
  detectedFormat?: string;
  detectedDimensions?: { width: number; height: number };
}

export interface PNGConversionOptions {
  compressionLevel?: number;
  adaptiveFiltering?: boolean;
  fallbackOnError?: boolean;
  maxRetries?: number;
  progressiveDegradation?: boolean;
}

/**
 * TempFileManager
 * 
 * セッションベースの一時ファイル管理とストレージ効率化
 */
export class TempFileManager {
  private readonly baseDir: string;
  private activeSessions: Map<string, TempSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // PNG変換設定（確実性重視）
  private readonly DEFAULT_PNG_OPTIONS: Required<PNGConversionOptions> = {
    compressionLevel: 6,        // 中程度の圧縮を維持（互換性のため）
    adaptiveFiltering: true,    // 適応的フィルタリングを常に有効
    fallbackOnError: false,     // フォールバック無効（確実なPNG形式を保証）
    maxRetries: 5,              // リトライ回数を増やす
    progressiveDegradation: false  // 品質劣化無効（一貫性を保持）
  };
  
  // プレビュー機能活用方式では精密な同期精度レベルは不要
  // Engine.seek()による統一シーク処理で十分な精度を確保
  
  constructor() {
    // システムテンポラリディレクトリにアプリ専用フォルダを作成
    this.baseDir = path.join(os.tmpdir(), 'visiblyrics-export-sessions');
    this.initializeBaseDirAndCleanup();
  }
  
  /**
   * ベースディレクトリ初期化と自動クリーンアップ開始
   */
  private async initializeBaseDirAndCleanup(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      
      // 起動時に古いセッションをクリーンアップ
      await this.cleanupOrphanedSessions();
      
      // 定期的なクリーンアップを開始（30分間隔）
      this.startPeriodicCleanup();
      
    } catch (error) {
      console.error('Failed to initialize temp file manager:', error);
      throw error;
    }
  }
  
  /**
   * 新しいテンポラリセッションを作成
   */
  async createTempSession(sessionId: string): Promise<TempSession> {
    const sessionDir = path.join(this.baseDir, `session_${sessionId}`);
    const framesDir = path.join(sessionDir, 'frames');
    const batchesDir = path.join(sessionDir, 'batches');
    const outputDir = path.join(sessionDir, 'output');
    
    // セッションディレクトリ構造を作成
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(framesDir, { recursive: true });
    await fs.mkdir(batchesDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    
    const session: TempSession = {
      sessionId,
      sessionDir,
      framesDir,
      batchesDir,
      outputDir,
      createdAt: new Date(),
      lastAccessed: new Date()
    };
    
    this.activeSessions.set(sessionId, session);
    
    console.log(`Created temp session: ${sessionId} at ${sessionDir}`);
    return session;
  }
  
  /**
   * セッション情報を取得
   */
  getTempSession(sessionId: string): TempSession | null {
    const session = this.activeSessions.get(sessionId);
    
    if (session) {
      // アクセス時刻を更新
      session.lastAccessed = new Date();
      return session;
    }
    
    return null;
  }
  
  /**
   * フレーム画像を保存（堅牢なPNG出力とアトミック書き込み）
   */
  async saveFrameImage(sessionId: string, frameName: string, frameData: Uint8Array, width?: number, height?: number): Promise<string> {
    const session = this.getTempSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    if (!width || !height) {
      throw new Error(`Width and height are required for frame image: ${frameName}`);
    }
    
    // フレームデータ事前検証
    const validationResult = this.validateFrameData(frameData, width, height);
    if (!validationResult.isValid) {
      throw new Error(`Invalid frame data for ${frameName}: ${validationResult.errorMessage}`);
    }
    
    const framePath = path.join(session.framesDir, frameName);
    
    try {
      // 堅牢なPNG変換（リトライ機構付き）
      const pngData = await this.convertToPNGWithRetry(frameData, width, height, this.DEFAULT_PNG_OPTIONS);
      
      // アトミックファイル書き込み
      await this.atomicWriteFile(framePath, pngData);
      
      // PNG出力後検証
      await this.verifyPNGOutput(framePath, width, height);
      
      // アクセス時刻更新
      session.lastAccessed = new Date();
      
      console.log(`Successfully saved frame: ${frameName} (${pngData.length} bytes)`);
      return framePath;
      
    } catch (error) {
      console.error(`Failed to save frame image ${frameName}:`, error);
      
      // 失敗したフレームファイルが残っている場合は削除
      try {
        await fs.unlink(framePath);
      } catch (unlinkError) {
        // 削除失敗は無視
      }
      
      throw new Error(`Frame image save failed for ${frameName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * フレーム画像のクリーンアップ（バッチ処理後）
   */
  async cleanupFrameImages(sessionId: string, frameFiles: string[]): Promise<void> {
    const session = this.getTempSession(sessionId);
    if (!session) {
      console.warn(`Session not found for cleanup: ${sessionId}`);
      return;
    }
    
    // 使用済みフレーム画像を削除
    const cleanupPromises = frameFiles.map(async (framePath) => {
      try {
        await fs.unlink(framePath);
      } catch (error) {
        console.warn(`Failed to delete frame file: ${framePath}`, error);
      }
    });
    
    await Promise.all(cleanupPromises);
    console.log(`Cleaned up ${frameFiles.length} frame files for session ${sessionId}`);
  }
  
  /**
   * セッション全体のクリーンアップ
   */
  async cleanupTempSession(sessionId: string): Promise<void> {
    const session = this.getTempSession(sessionId);
    if (!session) {
      console.warn(`Session not found for cleanup: ${sessionId}`);
      return;
    }
    
    try {
      // セッションディレクトリを再帰的に削除
      await fs.rm(session.sessionDir, { recursive: true, force: true });
      
      // アクティブセッションから削除
      this.activeSessions.delete(sessionId);
      
      console.log(`Cleaned up temp session: ${sessionId}`);
    } catch (error) {
      console.error(`Failed to cleanup session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * ストレージ使用量統計を取得
   */
  async getStorageStats(sessionId?: string): Promise<StorageStats> {
    try {
      // システムストレージ情報取得
      const stats = await fs.stat(this.baseDir);
      
      // セッション使用量計算
      let usedBySession = 0;
      if (sessionId) {
        const session = this.getTempSession(sessionId);
        if (session) {
          usedBySession = await this.calculateDirectorySize(session.sessionDir);
        }
      } else {
        // 全セッションの使用量
        usedBySession = await this.calculateDirectorySize(this.baseDir);
      }
      
      // TODO: 実際のディスク容量取得（statvfs相当）
      // 現在は概算値を返す
      const totalSpace = 100 * 1024 * 1024 * 1024; // 100GB仮想
      const freeSpace = totalSpace - usedBySession;
      
      return {
        totalSpace,
        freeSpace,
        usedBySession,
        usagePercent: (usedBySession / totalSpace) * 100
      };
      
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw error;
    }
  }
  
  /**
   * 孤立したセッションのクリーンアップ
   */
  private async cleanupOrphanedSessions(): Promise<void> {
    try {
      const entries = await fs.readdir(this.baseDir);
      const now = new Date();
      
      const cleanupPromises = entries.map(async (entry) => {
        const entryPath = path.join(this.baseDir, entry);
        
        try {
          const stats = await fs.stat(entryPath);
          
          // 24時間以上古いセッションを削除
          const ageHours = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60);
          
          if (ageHours > 24 && entry.startsWith('session_')) {
            console.log(`Cleaning up orphaned session: ${entry} (age: ${ageHours.toFixed(1)} hours)`);
            await fs.rm(entryPath, { recursive: true, force: true });
          }
          
        } catch (error) {
          console.warn(`Failed to check orphaned session: ${entry}`, error);
        }
      });
      
      await Promise.all(cleanupPromises);
      
    } catch (error) {
      console.error('Failed to cleanup orphaned sessions:', error);
    }
  }
  
  /**
   * 定期的なクリーンアップ開始
   */
  private startPeriodicCleanup(): void {
    // 30分間隔でクリーンアップ実行
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOrphanedSessions();
    }, 30 * 60 * 1000);
  }
  
  /**
   * クリーンアップ停止
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * ディレクトリサイズ計算（再帰的）
   */
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      const sizePromises = entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          return this.calculateDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          return stats.size;
        }
      });
      
      const sizes = await Promise.all(sizePromises);
      totalSize = sizes.reduce((sum, size) => sum + size, 0);
      
      return totalSize;
      
    } catch (error) {
      console.warn(`Failed to calculate directory size: ${dirPath}`, error);
      return 0;
    }
  }
  
  /**
   * フレームデータの厳密な検証
   */
  private validateFrameData(frameData: Uint8Array, width: number, height: number): FrameValidationResult {
    // 基本パラメータ検証
    if (!frameData || frameData.length === 0) {
      return { isValid: false, errorMessage: 'Frame data is empty or null' };
    }
    
    if (width <= 0 || height <= 0) {
      return { isValid: false, errorMessage: `Invalid dimensions: ${width}x${height}` };
    }
    
    if (width > 8192 || height > 8192) {
      return { isValid: false, errorMessage: `Dimensions too large: ${width}x${height} (max: 8192x8192)` };
    }
    
    // RGBA形式でのデータサイズ検証
    const expectedSize = width * height * 4;
    if (frameData.length !== expectedSize) {
      return {
        isValid: false,
        errorMessage: `Frame data size mismatch: expected ${expectedSize} bytes (${width}x${height}x4), got ${frameData.length} bytes`
      };
    }
    
    // ピクセルデータの基本的な妥当性チェック
    let hasValidPixels = false;
    for (let i = 0; i < Math.min(frameData.length, 1000); i += 4) {
      const alpha = frameData[i + 3];
      if (alpha > 0) {
        hasValidPixels = true;
        break;
      }
    }
    
    return {
      isValid: true,
      detectedFormat: 'RGBA',
      detectedDimensions: { width, height }
    };
  }
  
  /**
   * リトライ機構付きPNG変換
   */
  private async convertToPNGWithRetry(
    frameData: Uint8Array, 
    width: number, 
    height: number, 
    options: Required<PNGConversionOptions>
  ): Promise<Buffer> {
    let lastError: Error | null = null;
    // 圧縮レベルは一定を保持（確実性重視）
    const currentCompressionLevel = options.compressionLevel;
    
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        console.log(`PNG conversion attempt ${attempt}/${options.maxRetries} for ${width}x${height}`);
        
        const pngBuffer = await sharp(Buffer.from(frameData), {
          raw: {
            width,
            height,
            channels: 4 // RGBA
          }
        })
        .png({
          compressionLevel: currentCompressionLevel,
          adaptiveFiltering: options.adaptiveFiltering, // 常に有効
          palette: false,  // パレットモード無効（フルカラー保証）
          effort: 10,      // 最大エンコード努力（品質優先）
          force: true
        })
        .toBuffer();
        
        // 変換結果検証
        if (!pngBuffer || pngBuffer.length === 0) {
          throw new Error('PNG conversion produced empty buffer');
        }
        
        // PNG形式の基本検証（マジックバイト確認）
        if (!this.isPNGBuffer(pngBuffer)) {
          throw new Error('PNG conversion produced invalid PNG format');
        }
        
        // 圧縮率を計算して表示
        const originalSize = width * height * 4;
        const compressionRatio = ((originalSize - pngBuffer.length) / originalSize * 100).toFixed(1);
        console.log(`PNG conversion successful: ${pngBuffer.length} bytes (${compressionRatio}% compressed, attempt ${attempt})`);
        return pngBuffer;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`PNG conversion attempt ${attempt}/${options.maxRetries} failed:`, {
          error: lastError.message,
          width,
          height,
          dataSize: frameData.length,
          expectedSize: width * height * 4,
          compressionLevel: currentCompressionLevel
        });
        
        if (attempt < options.maxRetries) {
          // 次の試行前に短時間待機
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
      }
    }
    
    // 全ての試行が失敗した場合はエラー（フォールバック無効）
    throw new Error(`PNG conversion failed after ${options.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }
  
  // フォールバックPNG生成は削除（確実性重視のため）
  
  /**
   * PNGバッファの妥当性確認（マジックバイト検証）
   */
  private isPNGBuffer(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;
    
    // PNG署名: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    
    for (let i = 0; i < 8; i++) {
      if (buffer[i] !== pngSignature[i]) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * アトミックファイル書き込み（一時ファイル経由）
   */
  private async atomicWriteFile(targetPath: string, data: Buffer): Promise<void> {
    const tempPath = targetPath + '.tmp.' + Date.now() + '.' + Math.random().toString(36).substr(2, 9);
    
    try {
      // 一時ファイルに書き込み
      await fs.writeFile(tempPath, data, { flag: 'wx' }); // 新規作成専用フラグ
      
      // アトミックリネーム
      await fs.rename(tempPath, targetPath);
      
    } catch (error) {
      // 一時ファイルのクリーンアップ
      try {
        await fs.unlink(tempPath);
      } catch (unlinkError) {
        // 削除失敗は無視
      }
      
      throw error;
    }
  }
  
  /**
   * PNG出力後の検証（厳密版）
   */
  private async verifyPNGOutput(filePath: string, expectedWidth: number, expectedHeight: number): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size === 0) {
        throw new Error('PNG file is empty');
      }
      
      // ファイルサイズの妥当性チェック（異常に小さい場合は不正）
      // PNG圧縮を考慮して、より現実的な最小サイズを設定
      // PNGヘッダー + 最小限のIDAT チャンクを考慮
      const absoluteMinSize = 1000; // 1KB未満は明らかに異常
      if (stats.size < absoluteMinSize) {
        throw new Error(`PNG file size critically small: ${stats.size} bytes (absolute minimum: ${absoluteMinSize})`);
      }
      
      // 警告レベルのサイズチェック（10%未満は警告）
      const warnMinSize = Math.floor(expectedWidth * expectedHeight * 0.1);
      if (stats.size < warnMinSize) {
        console.warn(`PNG file size is very small: ${stats.size} bytes (expected at least: ${warnMinSize})`);
      }
      
      // 最大サイズチェック（非圧縮RGBAサイズを超える場合は異常）
      const maxExpectedSize = expectedWidth * expectedHeight * 4; // RGBA非圧縮サイズ
      if (stats.size > maxExpectedSize) {
        console.warn(`PNG file size unusually large: ${stats.size} bytes (max expected: ${maxExpectedSize})`);
      }
      
      // Sharp を使用して PNG メタデータ検証
      const metadata = await sharp(filePath).metadata();
      
      if (!metadata) {
        throw new Error('Failed to read PNG metadata');
      }
      
      // デバッグ用：メタデータの詳細を出力
      console.log(`PNG metadata for ${path.basename(filePath)}:`, {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        depth: metadata.depth,
        depthType: typeof metadata.depth,
        space: metadata.space,
        density: metadata.density
      });
      
      if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
        throw new Error(`PNG dimensions mismatch: expected ${expectedWidth}x${expectedHeight}, got ${metadata.width}x${metadata.height}`);
      }
      
      if (metadata.format !== 'png') {
        throw new Error(`File format is not PNG: ${metadata.format}`);
      }
      
      if (metadata.channels !== 3 && metadata.channels !== 4) {
        throw new Error(`Invalid PNG channels: ${metadata.channels} (expected 3 or 4)`);
      }
      
      // depthの型チェックと変換（Sharpが文字列を返す場合がある）
      let bitDepth: number;
      const depthValue = metadata.depth as any; // 型の問題を回避
      
      if (typeof depthValue === 'string') {
        // 'uchar' = 8bit, 'ushort' = 16bit などの変換
        if (depthValue === 'uchar' || depthValue === 'char') {
          bitDepth = 8;
        } else if (depthValue === 'ushort' || depthValue === 'short') {
          bitDepth = 16;
        } else {
          // 数値文字列の場合
          const parsed = parseInt(depthValue, 10);
          if (!isNaN(parsed)) {
            bitDepth = parsed;
          } else {
            bitDepth = 8; // デフォルト値
          }
        }
      } else if (typeof depthValue === 'number') {
        bitDepth = depthValue;
      } else {
        bitDepth = 8; // デフォルト値
      }
      
      if (bitDepth !== 8 && bitDepth !== 16) {
        throw new Error(`Invalid PNG bit depth: ${depthValue} (parsed as ${bitDepth}, expected 8 or 16)`);
      }
      
      // 圧縮率を計算
      const uncompressedSize = expectedWidth * expectedHeight * 4;
      const compressionRatio = ((uncompressedSize - stats.size) / uncompressedSize * 100).toFixed(1);
      
      console.log(`PNG verification passed: ${expectedWidth}x${expectedHeight}, ${stats.size} bytes (${compressionRatio}% compressed), ${metadata.channels} channels, ${bitDepth}-bit`);
      
    } catch (error) {
      throw new Error(`PNG verification failed for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * 全アクティブセッション情報を取得
   */
  getActiveSessions(): TempSession[] {
    return Array.from(this.activeSessions.values());
  }
  
  /**
   * リソースクリーンアップ（アプリ終了時）
   */
  async dispose(): Promise<void> {
    this.stopPeriodicCleanup();
    
    // 全アクティブセッションをクリーンアップ
    const cleanupPromises = Array.from(this.activeSessions.keys()).map(sessionId =>
      this.cleanupTempSession(sessionId)
    );
    
    await Promise.allSettled(cleanupPromises);
  }
}