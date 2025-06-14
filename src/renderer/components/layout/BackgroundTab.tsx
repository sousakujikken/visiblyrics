import React, { useState, useEffect, useRef } from 'react';
import Engine from '../../engine/Engine';
import AspectRatioSelector from './AspectRatioSelector';
import { AspectRatio, Orientation, BackgroundType, BackgroundFitMode } from '../../types/types';
import { electronMediaManager } from '../../services/ElectronMediaManager';
import '../../styles/components.css';

interface BackgroundTabProps {
  engine?: Engine;
}

const BackgroundTab: React.FC<BackgroundTabProps> = ({ engine }) => {
  const [backgroundColor, setBackgroundColor] = useState<string>('#000000');
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('color');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>('');
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState<string>('');
  const [fitMode, setFitMode] = useState<BackgroundFitMode>('cover');
  const [opacity, setOpacity] = useState<number>(1);
  const [recentVideoFiles, setRecentVideoFiles] = useState<Array<{fileName: string, filePath: string, timestamp: number}>>([]);
  
  // アスペクト比状態の追加
  const [currentAspectRatio, setCurrentAspectRatio] = useState<AspectRatio>('16:9');
  const [currentOrientation, setCurrentOrientation] = useState<Orientation>('landscape');

  // エンジンから現在の設定を取得し、適用
  useEffect(() => {
    if (engine) {
      // エンジンから現在の背景設定を取得
      const currentConfig = engine.getBackgroundConfig();
      
      setBackgroundType(currentConfig.type);
      if (currentConfig.backgroundColor) {
        setBackgroundColor(currentConfig.backgroundColor);
      }
      if (currentConfig.imageUrl) {
        setBackgroundImageUrl(currentConfig.imageUrl);
      }
      if (currentConfig.videoUrl) {
        setBackgroundVideoUrl(currentConfig.videoUrl);
      }
      if (currentConfig.fitMode) {
        setFitMode(currentConfig.fitMode);
      }
      if (currentConfig.opacity !== undefined) {
        setOpacity(currentConfig.opacity);
      }
      
      // エンジンから現在のステージ設定を取得
      const stageConfig = engine.getStageConfig();
      console.log('BackgroundTab: エンジンから取得したステージ設定:', stageConfig);
      setCurrentAspectRatio(stageConfig.aspectRatio);
      setCurrentOrientation(stageConfig.orientation);
      
      // プロジェクト状態からも背景設定を復元
      if (engine.projectStateManager) {
        const currentState = engine.projectStateManager.getCurrentState();
        
        // 新しい背景設定があればそれを使用
        if (currentState.backgroundConfig) {
          const config = currentState.backgroundConfig;
          setBackgroundType(config.type);
          if (config.backgroundColor) setBackgroundColor(config.backgroundColor);
          if (config.imageUrl) setBackgroundImageUrl(config.imageUrl);
          if (config.videoUrl) setBackgroundVideoUrl(config.videoUrl);
          if (config.fitMode) setFitMode(config.fitMode);
          if (config.opacity !== undefined) setOpacity(config.opacity);
        }
        // 後方互換性のため古い背景色設定もチェック
        else if (currentState.backgroundColor) {
          setBackgroundColor(currentState.backgroundColor);
          engine.setBackgroundColor(currentState.backgroundColor);
        }
      }
    }
  }, [engine]);

  // 背景動画復元イベントリスナー
  useEffect(() => {
    console.log('BackgroundTab: 背景動画復元イベントリスナーを設定');
    
    const handleBackgroundVideoRestore = async (event: CustomEvent) => {
      const { fileName: originalFileName } = event.detail;
      console.log(`BackgroundTab: ===== 背景動画復元要求を受信 =====`);
      console.log(`BackgroundTab: originalFileName: ${originalFileName}`);
      console.log(`BackgroundTab: engine: ${engine ? '存在' : 'なし'}`);
      console.log(`BackgroundTab: electronMediaManager.restoreBackgroundVideo: ${electronMediaManager.restoreBackgroundVideo ? '存在' : 'なし'}`);
      
      try {
        if (electronMediaManager.restoreBackgroundVideo) {
          console.log(`BackgroundTab: 背景動画復元処理開始: ${originalFileName}`);
          const result = await electronMediaManager.restoreBackgroundVideo(originalFileName);
          if (result && engine) {
            const { video, fileName } = result;
            console.log(`BackgroundTab: 背景動画復元成功、エンジンに設定: ${fileName} (元: ${originalFileName})`);
            // 背景動画を設定（ファイル名も渡す）
            engine.setBackgroundVideoElement(video, fitMode, fileName);
            setBackgroundVideoUrl('electron://loaded');
            setBackgroundType('video');
            console.log(`BackgroundTab: 背景動画復元完了: ${fileName}`);
            
            // プロジェクト状態を保存
            if (engine.projectStateManager) {
              const currentConfig = engine.getBackgroundConfig();
              engine.projectStateManager.updateCurrentState({
                backgroundConfig: currentConfig
              });
            }
          } else {
            console.warn(`BackgroundTab: 背景動画復元失敗 - result: ${result ? '存在' : 'なし'}, engine: ${engine ? '存在' : 'なし'}`);
          }
        } else {
          console.warn(`BackgroundTab: 背景動画復元機能が利用できません: ${originalFileName}`);
        }
      } catch (error) {
        console.error(`BackgroundTab: 背景動画復元エラー:`, error);
        alert(`背景動画復元に失敗: ${originalFileName}`);
      }
    };

    window.addEventListener('visiblyrics:restore-background-video', handleBackgroundVideoRestore as EventListener);
    
    return () => {
      console.log('BackgroundTab: 背景動画復元イベントリスナーを削除');
      window.removeEventListener('visiblyrics:restore-background-video', handleBackgroundVideoRestore as EventListener);
    };
  }, [engine, fitMode]);

  // 最近使用した背景動画ファイルを読み込み（コンポーネント表示時とengine変更時）
  useEffect(() => {
    console.log('BackgroundTab: useEffect for loading recent video files triggered');
    const loadRecentFiles = async () => {
      try {
        console.log('BackgroundTab: Calling getRecentFiles for backgroundVideo');
        const files = await electronMediaManager.getRecentFiles('backgroundVideo');
        console.log('BackgroundTab: Received recent video files:', files);
        setRecentVideoFiles(files);
      } catch (error) {
        console.error('BackgroundTab: Failed to load recent background video files:', error);
      }
    };
    
    loadRecentFiles();
  }, [engine]); // engineが変更されるたびに実行

  // 背景色変更ハンドラ
  const handleBackgroundColorChange = (color: string) => {
    setBackgroundColor(color);
    
    if (engine) {
      // 背景設定を更新
      engine.updateBackgroundConfig({ backgroundColor: color });
      
      // 背景色タイプの場合はPIXIアプリケーションの背景色を変更
      if (backgroundType === 'color') {
        engine.setBackgroundColor(color);
      }
      
      // プロジェクト状態に背景設定を保存
      if (engine.projectStateManager) {
        const currentConfig = engine.getBackgroundConfig();
        engine.projectStateManager.updateCurrentState({
          backgroundColor: color, // 後方互換性のため
          backgroundConfig: currentConfig
        });
      }
      
      // PreviewAreaの背景色を更新するイベントを発火（CSSの背景色も更新）
      const event = new CustomEvent('background-color-changed', {
        detail: { backgroundColor: color }
      });
      window.dispatchEvent(event);
    }
  };
  
  // 背景タイプ変更ハンドラ
  const handleBackgroundTypeChange = (type: BackgroundType) => {
    setBackgroundType(type);
    
    if (engine) {
      switch (type) {
        case 'color':
          engine.clearBackgroundMedia();
          engine.setBackgroundColor(backgroundColor);
          break;
        case 'image':
          if (backgroundImageUrl) {
            engine.setBackgroundImage(backgroundImageUrl, fitMode);
          }
          break;
        case 'video':
          if (backgroundVideoUrl) {
            engine.setBackgroundVideo(backgroundVideoUrl, fitMode);
          }
          break;
      }
      
      // プロジェクト状態を保存
      if (engine.projectStateManager) {
        const currentConfig = engine.getBackgroundConfig();
        engine.projectStateManager.updateCurrentState({
          backgroundConfig: currentConfig
        });
      }
    }
  };
  
  // 画像ファイル選択ハンドラ（エレクトロン専用）
  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (engine) {
      try {
        const result = await electronMediaManager.loadBackgroundVideo();
        if (result) {
          const { video } = result;
          // VideoTextureとして設定
          const texture = electronMediaManager.createPixiVideoTexture();
          if (texture) {
            engine.setBackgroundTexture(texture, fitMode);
            setBackgroundImageUrl('electron://loaded');
            
            // プロジェクト状態を保存
            if (engine.projectStateManager) {
              const currentConfig = engine.getBackgroundConfig();
              engine.projectStateManager.updateCurrentState({
                backgroundConfig: currentConfig
              });
            }
          }
        }
      } catch (error) {
        console.error('Failed to load image:', error);
        alert('画像の読み込みに失敗しました');
      }
      return;
    }
    // エレクトロン専用のため、ファイル処理は不要
  };
  
  // 動画ファイル選択ハンドラ（エレクトロン専用）
  const handleVideoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (engine) {
      try {
        const result = await electronMediaManager.loadBackgroundVideo();
        if (result) {
          const { video, fileName } = result;
          setBackgroundVideoUrl('electron://loaded');
          
          // 動画は背景映像のみに使用（音声は常に除外）
          video.muted = true;
          engine.setBackgroundVideoElement(video, fitMode, fileName);
          console.log(`背景動画を設定しました: ${fileName}。音楽データは音楽タブから別途読み込んでください。`);
          
          // 最近使用したファイルリストを更新（少し遅延を入れて確実に取得）
          console.log('BackgroundTab: ファイル選択後、最近使用したファイルリストを更新中...');
          setTimeout(async () => {
            const updatedFiles = await electronMediaManager.getRecentFiles('backgroundVideo');
            console.log('BackgroundTab: 更新された最近使用したファイル:', updatedFiles);
            setRecentVideoFiles(updatedFiles);
            console.log('BackgroundTab: setState完了');
          }, 100);
          
          // プロジェクト状態を保存
          if (engine.projectStateManager) {
            const currentConfig = engine.getBackgroundConfig();
            engine.projectStateManager.updateCurrentState({
              backgroundConfig: currentConfig
            });
          }
        }
      } catch (error) {
        console.error('Failed to load video:', error);
        alert('動画の読み込みに失敗しました');
      }
      return;
    }
    // エレクトロン専用のため、ファイル処理は不要
  };
  
  // フィットモード変更ハンドラ
  const handleFitModeChange = (mode: BackgroundFitMode) => {
    setFitMode(mode);
    
    if (engine) {
      engine.updateBackgroundConfig({ fitMode: mode });
      
      // プロジェクト状態を保存
      if (engine.projectStateManager) {
        const currentConfig = engine.getBackgroundConfig();
        engine.projectStateManager.updateCurrentState({
          backgroundConfig: currentConfig
        });
      }
    }
  };
  
  // 不透明度変更ハンドラ
  const handleOpacityChange = (value: number) => {
    setOpacity(value);
    
    if (engine) {
      engine.updateBackgroundConfig({ opacity: value });
      
      // プロジェクト状態を保存
      if (engine.projectStateManager) {
        const currentConfig = engine.getBackgroundConfig();
        engine.projectStateManager.updateCurrentState({
          backgroundConfig: currentConfig
        });
      }
    }
  };
  
  // 背景メディアクリアハンドラ
  const handleClearMedia = () => {
    if (engine) {
      engine.clearBackgroundMedia();
      setBackgroundImageUrl('');
      setBackgroundVideoUrl('');
      setBackgroundType('color');
      
      // プロジェクト状態を保存
      if (engine.projectStateManager) {
        const currentConfig = engine.getBackgroundConfig();
        engine.projectStateManager.updateCurrentState({
          backgroundConfig: currentConfig
        });
      }
    }
  };
  
  // アスペクト比変更ハンドラ
  const handleAspectRatioChange = (aspectRatio: AspectRatio, orientation: Orientation) => {
    if (engine) {
      // エンジンのステージをリサイズ
      engine.resizeStage(aspectRatio, orientation);
      
      // プロジェクト状態にステージ設定を保存
      if (engine.projectStateManager) {
        engine.projectStateManager.updateCurrentState({
          stageConfig: engine.getStageConfig()
        });
      }
      
      console.log(`アスペクト比変更: ${aspectRatio} (${orientation})`);
    }
  };

  return (
    <div className="background-tab">
      <h2>背景設定</h2>
      
      <div className="background-section">
        <h3>アスペクト比</h3>
        <p>プレビューエリアのアスペクト比と画面の向きを設定できます。</p>
        <AspectRatioSelector 
          onAspectRatioChange={handleAspectRatioChange}
          initialAspectRatio={currentAspectRatio}
          initialOrientation={currentOrientation}
        />
      </div>
      
      <div className="background-section">
        <h3>背景タイプ</h3>
        <div className="background-type-selector">
          <label>
            <input
              type="radio"
              name="backgroundType"
              value="color"
              checked={backgroundType === 'color'}
              onChange={(e) => handleBackgroundTypeChange(e.target.value as BackgroundType)}
            />
            背景色
          </label>
          <label>
            <input
              type="radio"
              name="backgroundType"
              value="image"
              checked={backgroundType === 'image'}
              onChange={(e) => handleBackgroundTypeChange(e.target.value as BackgroundType)}
            />
            画像
          </label>
          <label>
            <input
              type="radio"
              name="backgroundType"
              value="video"
              checked={backgroundType === 'video'}
              onChange={(e) => handleBackgroundTypeChange(e.target.value as BackgroundType)}
            />
            動画
          </label>
        </div>
      </div>
      
      {backgroundType === 'color' && (
        <div className="background-section">
          <h3>背景色</h3>
          <p>歌詞アニメーションエリアの背景色を設定できます。</p>
          
          <div className="color-picker-container">
            <div className="color-input-group">
              <label htmlFor="background-color-picker">背景色:</label>
              <div className="color-picker-wrapper">
                <input
                  id="background-color-picker"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => handleBackgroundColorChange(e.target.value)}
                  className="color-picker"
                />
                <span className="color-value">{backgroundColor}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {backgroundType === 'image' && (
        <div className="background-section">
          <h3>背景画像</h3>
          <p>JPEG、PNG、WebP形式の画像ファイルを背景に設定できます。（最大10MB）</p>
          
          <div className="file-upload-container">
            <button
              onClick={() => handleImageFileChange(null as any)}
              className="file-select-button"
            >
              画像ファイルを選択
            </button>
            {backgroundImageUrl && (
              <div className="media-preview">
                <img 
                  src={backgroundImageUrl} 
                  alt="背景画像プレビュー" 
                  style={{ maxWidth: '200px', maxHeight: '150px', objectFit: 'cover' }}
                />
                <button onClick={handleClearMedia} className="clear-button">削除</button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {backgroundType === 'video' && (
        <div className="background-section">
          <h3>背景動画</h3>
          <p>MP4、WebM形式の動画ファイルを背景に設定できます。（最大100MB）</p>
          
          
          <div className="file-upload-container">
            <button
              onClick={() => handleVideoFileChange(null as any)}
              className="file-select-button"
            >
              動画ファイルを選択
            </button>
            
            <div style={{ marginTop: '10px' }}>
              <label htmlFor="recent-video-select" style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>最近使用した動画ファイル:</label>
              <select
                id="recent-video-select"
                disabled={recentVideoFiles.length === 0}
                onChange={async (e) => {
                    if (!e.target.value || !engine) return;
                    
                    try {
                      const result = await electronMediaManager.loadRecentBackgroundVideo(e.target.value);
                      if (result) {
                        const { video, fileName } = result;
                        setBackgroundVideoUrl('electron://loaded');
                        
                        // 動画は背景映像のみに使用（音声は常に除外）
                        video.muted = true;
                        engine.setBackgroundVideoElement(video, fitMode, fileName);
                        console.log(`最近使用した背景動画を設定しました: ${fileName}`);
                        
                        // 最近使用したファイルリストを更新
                        setTimeout(async () => {
                          const updatedFiles = await electronMediaManager.getRecentFiles('backgroundVideo');
                          setRecentVideoFiles(updatedFiles);
                        }, 100);
                        
                        // プロジェクト状態を保存
                        if (engine.projectStateManager) {
                          const currentConfig = engine.getBackgroundConfig();
                          engine.projectStateManager.updateCurrentState({
                            backgroundConfig: currentConfig
                          });
                        }
                      }
                    } catch (error) {
                      console.error('Failed to load recent background video:', error);
                      alert('最近使用した動画ファイルの読み込みに失敗しました');
                    }
                    
                    // セレクトボックスをリセット
                    e.target.value = '';
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: recentVideoFiles.length === 0 ? '#f5f5f5' : '#fff',
                    color: recentVideoFiles.length === 0 ? '#999' : '#000',
                    cursor: recentVideoFiles.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="">{recentVideoFiles.length === 0 ? 'Empty - ファイルが選択されていません' : 'ファイルを選択してください'}</option>
                  {recentVideoFiles.map((file, index) => (
                    <option key={index} value={file.filePath}>
                      {file.fileName}
                    </option>
                  ))}
                </select>
              </div>
            
            {backgroundVideoUrl && (
              <div className="media-preview">
                <video 
                  src={backgroundVideoUrl} 
                  style={{ maxWidth: '200px', maxHeight: '150px', objectFit: 'cover' }}
                  muted
                />
                <button onClick={handleClearMedia} className="clear-button">削除</button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {backgroundType !== 'color' && (
        <>
          <div className="background-section">
            <h3>フィッティングモード</h3>
            <div className="fit-mode-selector">
              <label>
                <input
                  type="radio"
                  name="fitMode"
                  value="cover"
                  checked={fitMode === 'cover'}
                  onChange={(e) => handleFitModeChange(e.target.value as BackgroundFitMode)}
                />
                カバー（画面全体を覆う）
              </label>
              <label>
                <input
                  type="radio"
                  name="fitMode"
                  value="contain"
                  checked={fitMode === 'contain'}
                  onChange={(e) => handleFitModeChange(e.target.value as BackgroundFitMode)}
                />
                コンテイン（画面内に収める）
              </label>
              <label>
                <input
                  type="radio"
                  name="fitMode"
                  value="stretch"
                  checked={fitMode === 'stretch'}
                  onChange={(e) => handleFitModeChange(e.target.value as BackgroundFitMode)}
                />
                ストレッチ（画面に合わせて伸縮）
              </label>
            </div>
          </div>
          
          <div className="background-section">
            <h3>不透明度</h3>
            <div className="opacity-slider">
              <label htmlFor="opacity-slider">不透明度: {Math.round(opacity * 100)}%</label>
              <input
                id="opacity-slider"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={opacity}
                onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                className="slider"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BackgroundTab;