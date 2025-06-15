import React, { useEffect, useRef, useState } from 'react';
import Engine from '../../engine/Engine';
import LyricsEditor from '../editor/LyricsEditor';
import './PreviewArea.css';

interface PreviewAreaProps {
  engine?: Engine;
  lyricsEditMode?: boolean;
  onCloseLyricsEdit?: () => void;
}

const PreviewArea: React.FC<PreviewAreaProps> = ({ engine, lyricsEditMode, onCloseLyricsEdit }) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // コンポーネントマウント時にcanvasContainerのDOM要素が準備できたことを確認
  useEffect(() => {
    if (canvasContainerRef.current && engine) {
      console.log('PreviewArea: canvasContainer DOM要素の準備完了');
      
      // エンジンから初期背景色を取得してPIXIに設定
      if (engine.projectStateManager) {
        const currentState = engine.projectStateManager.getCurrentState();
        if (currentState.backgroundColor) {
          engine.setBackgroundColor(currentState.backgroundColor);
        }
      }
    }
  }, [engine]);

  // 背景色変更イベントをリッスン（PIXIアプリケーションの背景色のみ更新）
  useEffect(() => {
    const handleBackgroundColorChange = (event: CustomEvent) => {
      if (event.detail && event.detail.backgroundColor && engine) {
        // PIXIアプリケーションの背景色のみ更新
        engine.setBackgroundColor(event.detail.backgroundColor);
      }
    };

    window.addEventListener('background-color-changed', handleBackgroundColorChange as EventListener);

    return () => {
      window.removeEventListener('background-color-changed', handleBackgroundColorChange as EventListener);
    };
  }, [engine]);

  // 歌詞編集モードの切り替え時の処理
  useEffect(() => {
    if (engine) {
      if (lyricsEditMode) {
        console.log('PreviewArea: 歌詞編集モードに入りました');
        // 歌詞編集モードに入る時は特に何もしない（キャンバスは隠すだけ）
      } else {
        console.log('PreviewArea: 歌詞編集モードから復帰しました');
        // 歌詞編集モードから復帰時にアニメーションを強制更新
        setTimeout(() => {
          if (engine.instanceManager) {
            console.log('PreviewArea: アニメーション強制更新実行');
            engine.instanceManager.update(engine.currentTime);
            
            // さらに文字位置も再計算
            engine.arrangeCharsOnStage();
            engine.instanceManager.loadPhrases(engine.phrases, engine.charPositions);
            engine.instanceManager.update(engine.currentTime);
          }
        }, 100); // 少し遅延させてDOM更新を確実にする
      }
    }
  }, [lyricsEditMode, engine]);

  return (
    <div className="preview-area-container">
      {/* 歌詞編集モード */}
      {lyricsEditMode && engine && (
        <div className="lyrics-editor-wrapper" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
          <LyricsEditor engine={engine} onClose={onCloseLyricsEdit} />
        </div>
      )}
      
      {/* キャンバスコンテナ（常に存在、歌詞編集時は背景に隠れる） */}
      <div 
        className="canvas-container-wrapper" 
        style={{ 
          display: lyricsEditMode ? 'block' : 'block',
          visibility: lyricsEditMode ? 'hidden' : 'visible'
        }}
      >
        <div 
          id="canvasContainer" 
          ref={canvasContainerRef}
        ></div>
      </div>
    </div>
  );
};

export default PreviewArea;
