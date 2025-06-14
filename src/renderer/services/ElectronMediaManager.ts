// エレクトロン専用メディアファイル管理

import { unifiedFileManager } from './UnifiedFileManager';

export class ElectronMediaManager {
  private backgroundVideo: HTMLVideoElement | null = null;
  private backgroundAudio: HTMLAudioElement | null = null;
  private currentAudioFileURL: string | null = null;
  private currentVideoFileURL: string | null = null;
  
  // エレクトロン環境前提のため、可用性チェックは不要
  
  async loadBackgroundVideo(): Promise<{ video: HTMLVideoElement; fileName: string } | null> {
    return this.loadMediaFile('video');
  }
  
  async loadBackgroundAudio(): Promise<{ audio: HTMLAudioElement; fileName: string } | null> {
    return this.loadMediaFile('audio');
  }
  
  getBackgroundVideo(): HTMLVideoElement | null {
    return this.backgroundVideo;
  }
  
  getBackgroundAudio(): HTMLAudioElement | null {
    return this.backgroundAudio;
  }
  
  getCurrentAudioFileURL(): string | null {
    return this.currentAudioFileURL;
  }
  
  getCurrentVideoFileURL(): string | null {
    return this.currentVideoFileURL;
  }

  // 音楽ファイルの復元機能
  async restoreAudioFile(originalFileName: string): Promise<{ audio: HTMLAudioElement; fileName: string } | null> {
    try {
      console.log(`ElectronMediaManager: 音楽ファイル復元を試行: ${originalFileName}`);
      
      // 注意: 現在の実装では、ユーザーが同じファイルを再選択する必要があります
      // 将来的には、最近使用したファイルパスのキャッシュや
      // 「前回と同じファイルを使用しますか？」といった確認機能を実装できます
      
      const mediaInfo = await unifiedFileManager.selectAudioFile();
      
      // HTMLAudioElementを作成
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      
      // file:// プロトコルでローカルファイルにアクセス
      const fileURL = unifiedFileManager.getFileURL(mediaInfo.path);
      console.log(`ElectronMediaManager: 復元用音楽ファイルを読み込み: ${fileURL}`);
      
      // ファイル名を取得（パスから最後の部分を抽出）
      const fileName = mediaInfo.path.split('/').pop() || mediaInfo.path.split('\\').pop() || originalFileName;
      
      // オーディオを読み込み
      return new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => {
          console.log(`ElectronMediaManager: 音楽ファイル復元完了:`, {
            duration: audio.duration,
            fileName: fileName,
            originalFileName
          });
          this.backgroundAudio = audio;
          this.currentAudioFileURL = fileURL;
          resolve({ audio, fileName });
        };
        
        audio.onerror = (error) => {
          console.error(`ElectronMediaManager: 音楽ファイル復元エラー:`, error);
          reject(new Error(`Failed to restore audio file: ${originalFileName}`));
        };
        
        audio.src = fileURL;
      });
      
    } catch (error) {
      console.error(`ElectronMediaManager: 音楽ファイル復元に失敗:`, error);
      throw error;
    }
  }
  
  // 背景動画ファイルの復元機能
  async restoreBackgroundVideo(originalFileName: string): Promise<{ video: HTMLVideoElement; fileName: string } | null> {
    try {
      console.log(`ElectronMediaManager: 背景動画復元を試行: ${originalFileName}`);
      
      // 注意: 現在の実装では、ユーザーが同じファイルを再選択する必要があります
      // 将来的には、最近使用したファイルパスのキャッシュや
      // 「前回と同じファイルを使用しますか？」といった確認機能を実装できます
      
      const mediaInfo = await unifiedFileManager.selectVideoFile();
      
      // HTMLVideoElementを作成
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true; // 背景動画は常にミュート
      
      // file:// プロトコルでローカルファイルにアクセス
      const fileURL = unifiedFileManager.getFileURL(mediaInfo.path);
      console.log(`ElectronMediaManager: 復元用背景動画を読み込み: ${fileURL}`);
      
      // ファイル名を取得（パスから最後の部分を抽出）
      const fileName = mediaInfo.path.split('/').pop() || mediaInfo.path.split('\\').pop() || originalFileName;
      
      // ビデオを読み込み
      return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          console.log(`ElectronMediaManager: 背景動画復元完了:`, {
            duration: video.duration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            fileName: fileName,
            originalFileName
          });
          this.backgroundVideo = video;
          this.currentVideoFileURL = fileURL;
          resolve({ video, fileName });
        };
        
        video.onerror = (error) => {
          console.error(`ElectronMediaManager: 背景動画復元エラー:`, error);
          reject(new Error(`Failed to restore background video: ${originalFileName}`));
        };
        
        video.src = fileURL;
      });
      
    } catch (error) {
      console.error(`ElectronMediaManager: 背景動画復元に失敗:`, error);
      throw error;
    }
  }
  
  // PixiJS VideoTextureとの統合
  createPixiVideoTexture(): any | null {
    if (!this.backgroundVideo) {
      return null;
    }
    
    try {
      // PixiJS VideoTextureを作成（型を緩くしてエラーを回避）
      const PIXI = (window as any).PIXI;
      if (PIXI && PIXI.Texture) {
        const videoTexture = PIXI.Texture.from(this.backgroundVideo);
        console.log('PIXI VideoTexture created');
        return videoTexture;
      } else {
        console.warn('PIXI not available');
        return null;
      }
    } catch (error) {
      console.error('Failed to create PIXI VideoTexture:', error);
      return null;
    }
  }
  
  // メディア再生制御
  playMedia() {
    if (this.backgroundVideo) {
      this.backgroundVideo.play().catch(console.error);
    }
    if (this.backgroundAudio) {
      this.backgroundAudio.play().catch(console.error);
    }
  }
  
  pauseMedia() {
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
    }
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
    }
  }
  
  seekMedia(timeSeconds: number) {
    if (this.backgroundVideo) {
      this.backgroundVideo.currentTime = timeSeconds;
    }
    if (this.backgroundAudio) {
      this.backgroundAudio.currentTime = timeSeconds;
    }
  }
  
  // クリーンアップ
  cleanup() {
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
      this.backgroundVideo.src = '';
      this.backgroundVideo = null;
    }
    
    if (this.backgroundAudio) {
      this.backgroundAudio.pause();
      this.backgroundAudio.src = '';
      this.backgroundAudio = null;
    }
    
    this.currentAudioFileURL = null;
    this.currentVideoFileURL = null;
  }

  // 統一されたメディアファイル読み込みメソッド
  private async loadMediaFile(type: 'video' | 'audio'): Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string } | null> {
    try {
      console.log(`ElectronMediaManager: loadMediaFile called for type: ${type}`);
      
      // ファイル選択
      const mediaInfo = type === 'video' 
        ? await unifiedFileManager.selectVideoFile()
        : await unifiedFileManager.selectAudioFile();
      
      console.log(`ElectronMediaManager: Selected ${type} file:`, mediaInfo);
      
      // ファイル名を取得
      const fileName = mediaInfo.path.split('/').pop() || mediaInfo.path.split('\\').pop() || 'unknown';
      const fileURL = unifiedFileManager.getFileURL(mediaInfo.path);
      
      console.log(`ElectronMediaManager: Processing ${type} file - fileName: ${fileName}, fileURL: ${fileURL}`);
      
      // メディア要素を作成
      const mediaElement = type === 'video' 
        ? document.createElement('video') as HTMLVideoElement
        : document.createElement('audio') as HTMLAudioElement;
      
      mediaElement.preload = 'metadata';
      if (type === 'video') {
        (mediaElement as HTMLVideoElement).muted = true; // 動画は常にミュート
      }
      
      // メディアファイル読み込み（Promise化）
      const loadResult = await new Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string }>((resolve, reject) => {
        mediaElement.onloadedmetadata = async () => {
          try {
            console.log(`ElectronMediaManager: ${type} loaded successfully:`, {
              duration: mediaElement.duration,
              fileName: fileName,
              ...(type === 'video' ? {
                videoWidth: (mediaElement as HTMLVideoElement).videoWidth,
                videoHeight: (mediaElement as HTMLVideoElement).videoHeight
              } : {})
            });
            
            // メディア要素をインスタンス変数に保存
            if (type === 'video') {
              this.backgroundVideo = mediaElement as HTMLVideoElement;
              this.currentVideoFileURL = fileURL;
            } else {
              this.backgroundAudio = mediaElement as HTMLAudioElement;
              this.currentAudioFileURL = fileURL;
            }
            
            // 最近使用したファイルに追加（読み込み成功後）
            console.log(`ElectronMediaManager: Adding ${fileName} to recent files...`);
            const recentFileType = type === 'video' ? 'backgroundVideo' : 'audio';
            await this.addToRecentFiles(recentFileType, fileName, mediaInfo.path);
            console.log(`ElectronMediaManager: Successfully added ${fileName} to recent files`);
            
            // 結果を返す
            const result = type === 'video' 
              ? { video: mediaElement as HTMLVideoElement, fileName }
              : { audio: mediaElement as HTMLAudioElement, fileName };
            
            resolve(result);
          } catch (error) {
            console.error(`ElectronMediaManager: Error during ${type} processing:`, error);
            reject(error);
          }
        };
        
        mediaElement.onerror = (error) => {
          console.error(`ElectronMediaManager: ${type} load error:`, error);
          reject(new Error(`Failed to load ${type} file: ${fileName}`));
        };
        
        console.log(`ElectronMediaManager: Setting ${type} src to:`, fileURL);
        mediaElement.src = fileURL;
      });
      
      console.log(`ElectronMediaManager: ${type} file loading completed successfully`);
      return loadResult;
      
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to load ${type} file:`, error);
      throw error;
    }
  }

  // 最近使用したファイルに追加
  private async addToRecentFiles(type: 'audio' | 'backgroundVideo', fileName: string, filePath: string): Promise<void> {
    try {
      console.log(`ElectronMediaManager: addToRecentFiles called - type: ${type}, fileName: ${fileName}, filePath: ${filePath}`);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.error('ElectronMediaManager: electronAPI not available in addToRecentFiles');
        return;
      }

      console.log(`ElectronMediaManager: Calling persistence API for ${type}`);
      let result;
      if (type === 'audio') {
        result = await electronAPI.persistence.addRecentAudio(fileName, filePath);
      } else {
        result = await electronAPI.persistence.addRecentBackgroundVideo(fileName, filePath);
      }
      console.log(`ElectronMediaManager: addToRecentFiles result:`, result);
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to add recent file (${type}):`, error);
    }
  }

  // 最近使用したファイルを取得
  async getRecentFiles(type: 'audio' | 'backgroundVideo'): Promise<Array<{fileName: string, filePath: string, timestamp: number}>> {
    try {
      console.log(`ElectronMediaManager: getRecentFiles called for type: ${type}`);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.error('ElectronMediaManager: electronAPI not available');
        return [];
      }

      console.log(`ElectronMediaManager: electronAPI.persistence available:`, !!electronAPI.persistence);
      console.log(`ElectronMediaManager: getRecentAudio method available:`, !!electronAPI.persistence?.getRecentAudio);
      console.log(`ElectronMediaManager: getRecentBackgroundVideo method available:`, !!electronAPI.persistence?.getRecentBackgroundVideo);

      const result = type === 'audio' 
        ? await electronAPI.persistence.getRecentAudio()
        : await electronAPI.persistence.getRecentBackgroundVideo();

      console.log(`ElectronMediaManager: Raw persistence result for ${type}:`, result);
      console.log(`ElectronMediaManager: Result success:`, result?.success);
      console.log(`ElectronMediaManager: Result files:`, result?.files);
      console.log(`ElectronMediaManager: Result error:`, result?.error);

      const finalResult = result.success ? (result.files || []) : [];
      console.log(`ElectronMediaManager: Final getRecentFiles result for ${type}:`, finalResult);
      return finalResult;
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to get recent files for ${type}:`, error);
      return [];
    }
  }

  // 最近使用したファイルから音楽ファイルを読み込み
  async loadRecentAudioFile(filePath: string): Promise<{ audio: HTMLAudioElement; fileName: string } | null> {
    return this.loadRecentMediaFile('audio', filePath);
  }

  // 最近使用したファイルから背景動画を読み込み
  async loadRecentBackgroundVideo(filePath: string): Promise<{ video: HTMLVideoElement; fileName: string } | null> {
    return this.loadRecentMediaFile('video', filePath);
  }

  // 統一された最近使用したファイル読み込みメソッド
  private async loadRecentMediaFile(type: 'video' | 'audio', filePath: string): Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string } | null> {
    try {
      console.log(`ElectronMediaManager: loadRecentMediaFile called for type: ${type}, filePath: ${filePath}`);
      
      // ファイル名を取得
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
      const fileURL = unifiedFileManager.getFileURL(filePath);
      
      console.log(`ElectronMediaManager: Processing recent ${type} file - fileName: ${fileName}, fileURL: ${fileURL}`);
      
      // メディア要素を作成
      const mediaElement = type === 'video' 
        ? document.createElement('video') as HTMLVideoElement
        : document.createElement('audio') as HTMLAudioElement;
      
      mediaElement.preload = 'metadata';
      if (type === 'video') {
        (mediaElement as HTMLVideoElement).muted = true; // 動画は常にミュート
      }
      
      // メディアファイル読み込み（Promise化）
      const loadResult = await new Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string }>((resolve, reject) => {
        mediaElement.onloadedmetadata = async () => {
          try {
            console.log(`ElectronMediaManager: Recent ${type} loaded successfully:`, {
              duration: mediaElement.duration,
              fileName: fileName,
              ...(type === 'video' ? {
                videoWidth: (mediaElement as HTMLVideoElement).videoWidth,
                videoHeight: (mediaElement as HTMLVideoElement).videoHeight
              } : {})
            });
            
            // メディア要素をインスタンス変数に保存
            if (type === 'video') {
              this.backgroundVideo = mediaElement as HTMLVideoElement;
              this.currentVideoFileURL = fileURL;
            } else {
              this.backgroundAudio = mediaElement as HTMLAudioElement;
              this.currentAudioFileURL = fileURL;
            }
            
            // 最近使用したファイルに追加（リストの先頭に移動）
            console.log(`ElectronMediaManager: Moving ${fileName} to top of recent files...`);
            const recentFileType = type === 'video' ? 'backgroundVideo' : 'audio';
            await this.addToRecentFiles(recentFileType, fileName, filePath);
            console.log(`ElectronMediaManager: Successfully moved ${fileName} to top of recent files`);
            
            // 結果を返す
            const result = type === 'video' 
              ? { video: mediaElement as HTMLVideoElement, fileName }
              : { audio: mediaElement as HTMLAudioElement, fileName };
            
            resolve(result);
          } catch (error) {
            console.error(`ElectronMediaManager: Error during recent ${type} processing:`, error);
            reject(error);
          }
        };
        
        mediaElement.onerror = (error) => {
          console.error(`ElectronMediaManager: Recent ${type} load error:`, error);
          reject(new Error(`Failed to load recent ${type} file: ${fileName}`));
        };
        
        console.log(`ElectronMediaManager: Setting recent ${type} src to:`, fileURL);
        mediaElement.src = fileURL;
      });
      
      console.log(`ElectronMediaManager: Recent ${type} file loading completed successfully`);
      return loadResult;
      
    } catch (error) {
      console.error(`ElectronMediaManager: Failed to load recent ${type} file:`, error);
      throw error;
    }
  }
}

// グローバルインスタンス
export const electronMediaManager = new ElectronMediaManager();