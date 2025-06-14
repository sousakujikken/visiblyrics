import React, { useEffect, useRef, useState } from 'react';
import Engine from '../../engine/Engine';
import './PreviewArea.css';

interface PreviewAreaProps {
  engine?: Engine;
}

const PreviewArea: React.FC<PreviewAreaProps> = ({ engine }) => {
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

  return (
    <div className="preview-area-container">
      <div className="canvas-container-wrapper">
        <div 
          id="canvasContainer" 
          ref={canvasContainerRef}
        ></div>
      </div>
    </div>
  );
};

export default PreviewArea;
