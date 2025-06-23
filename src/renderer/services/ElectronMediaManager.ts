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

  // 音楽ファイルの復元機能 - 改善版
  async restoreAudioFile(originalFileName: string, savedFilePath?: string): Promise<{ audio: HTMLAudioElement; fileName: string } | null> {
    try {
      console.log(`ElectronMediaManager: 音楽ファイル復元を試行: ${originalFileName}`, { savedFilePath });
      
      // 保存されたファイルパスがある場合は直接読み込みを試行
      if (savedFilePath) {
        try {
          const fileExists = await window.electronAPI.checkFileExists(savedFilePath);
          if (fileExists) {
            console.log(`ElectronMediaManager: 保存されたパスからファイルを直接読み込み: ${savedFilePath}`);
            return await this.loadMediaFileFromPath(savedFilePath, 'audio');
          } else {
            console.warn(`ElectronMediaManager: 保存されたファイルが見つかりません: ${savedFilePath}`);
          }
        } catch (error) {
          console.warn(`ElectronMediaManager: 保存されたパスからの読み込みに失敗: ${savedFilePath}`, error);
        }
      }
      
      // 最近使用したファイルから同じ名前のファイルを検索
      try {
        const recentFiles = await this.getRecentFiles('audio');
        const matchingFile = recentFiles.find(file => 
          file.fileName === originalFileName || file.filePath.includes(originalFileName)
        );
        
        if (matchingFile) {
          const fileExists = await window.electronAPI.checkFileExists(matchingFile.filePath);
          if (fileExists) {
            console.log(`ElectronMediaManager: 最近使用したファイルから復元: ${matchingFile.filePath}`);
            return await this.loadMediaFileFromPath(matchingFile.filePath, 'audio');
          }
        }
      } catch (error) {
        console.warn(`ElectronMediaManager: 最近使用したファイルからの復元に失敗:`, error);
      }
      
      // ファイルが見つからない場合、ユーザーに再選択を求める（通知付き）
      console.log(`ElectronMediaManager: ファイルが見つからないため、再選択を求めます: ${originalFileName}`);
      const message = `音楽ファイル "${originalFileName}" が見つかりません。\n同じファイルを選択してください。`;
      if (window.confirm(message)) {
        const mediaInfo = await unifiedFileManager.selectAudioFile();
        return await this.loadMediaFileFromPath(mediaInfo.path, 'audio');
      }
      
      return null;
      
    } catch (error) {
      console.error(`ElectronMediaManager: 音楽ファイル復元に失敗:`, error);
      throw error;
    }
  }
  
  // 背景動画ファイルの復元機能 - 改善版
  async restoreBackgroundVideo(originalFileName: string, savedFilePath?: string): Promise<{ video: HTMLVideoElement; fileName: string } | null> {
    try {
      console.log(`ElectronMediaManager: 背景動画復元を試行: ${originalFileName}`, { savedFilePath });
      
      // 保存されたファイルパスがある場合は直接読み込みを試行
      if (savedFilePath) {
        try {
          const fileExists = await window.electronAPI.checkFileExists(savedFilePath);
          if (fileExists) {
            console.log(`ElectronMediaManager: 保存されたパスからファイルを直接読み込み: ${savedFilePath}`);
            return await this.loadMediaFileFromPath(savedFilePath, 'video');
          } else {
            console.warn(`ElectronMediaManager: 保存されたファイルが見つかりません: ${savedFilePath}`);
          }
        } catch (error) {
          console.warn(`ElectronMediaManager: 保存されたパスからの読み込みに失敗: ${savedFilePath}`, error);
        }
      }
      
      // 最近使用したファイルから同じ名前のファイルを検索
      try {
        const recentFiles = await this.getRecentFiles('backgroundVideo');
        const matchingFile = recentFiles.find(file => 
          file.fileName === originalFileName || file.filePath.includes(originalFileName)
        );
        
        if (matchingFile) {
          const fileExists = await window.electronAPI.checkFileExists(matchingFile.filePath);
          if (fileExists) {
            console.log(`ElectronMediaManager: 最近使用したファイルから復元: ${matchingFile.filePath}`);
            return await this.loadMediaFileFromPath(matchingFile.filePath, 'video');
          }
        }
      } catch (error) {
        console.warn(`ElectronMediaManager: 最近使用したファイルからの復元に失敗:`, error);
      }
      
      // ファイルが見つからない場合、ユーザーに再選択を求める（通知付き）
      console.log(`ElectronMediaManager: ファイルが見つからないため、再選択を求めます: ${originalFileName}`);
      const message = `背景動画 "${originalFileName}" が見つかりません。\n同じファイルを選択してください。`;
      if (window.confirm(message)) {
        const mediaInfo = await unifiedFileManager.selectVideoFile();
        return await this.loadMediaFileFromPath(mediaInfo.path, 'video');
      }
      
      return null;
      
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

  // ファイルパスから直接メディアファイルを読み込むメソッド（復元機能で使用）
  private async loadMediaFileFromPath(filePath: string, type: 'video' | 'audio'): Promise<{ video?: HTMLVideoElement; audio?: HTMLAudioElement; fileName: string }> {
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
    const fileURL = await window.electronAPI.readFileAsURL(filePath);
    
    console.log(`ElectronMediaManager: loadMediaFileFromPath - fileName: ${fileName}, fileURL: ${fileURL}`);
    
    // メディア要素を作成
    const mediaElement = type === 'video' 
      ? document.createElement('video') as HTMLVideoElement
      : document.createElement('audio') as HTMLAudioElement;
    
    mediaElement.preload = 'metadata';
    if (type === 'video') {
      (mediaElement as HTMLVideoElement).muted = true; // 動画は常にミュート
    }
    
    // メディアファイル読み込み（Promise化）
    return new Promise((resolve, reject) => {
      mediaElement.onloadedmetadata = async () => {
        try {
          console.log(`ElectronMediaManager: ${type} loaded from path successfully:`, {
            duration: mediaElement.duration,
            fileName: fileName,
            filePath: filePath,
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
          
          // 最近使用したファイルに追加
          const recentFileType = type === 'video' ? 'backgroundVideo' : 'audio';
          await this.addToRecentFiles(recentFileType, fileName, filePath);
          
          // 結果を返す
          const result = type === 'video' 
            ? { video: mediaElement as HTMLVideoElement, fileName }
            : { audio: mediaElement as HTMLAudioElement, fileName };
          
          resolve(result);
        } catch (error) {
          console.error(`ElectronMediaManager: Error during ${type} processing from path:`, error);
          reject(error);
        }
      };
      
      mediaElement.onerror = (error) => {
        console.error(`ElectronMediaManager: ${type} load error from path:`, error);
        reject(new Error(`Failed to load ${type} file from path: ${filePath}`));
      };
      
      mediaElement.src = fileURL;
    });
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