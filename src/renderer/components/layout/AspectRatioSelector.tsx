import React, { useState, useEffect } from 'react';
import { AspectRatio, Orientation } from '../../types/types';
import './AspectRatioSelector.css';

interface AspectRatioSelectorProps {
  onAspectRatioChange?: (aspectRatio: AspectRatio, orientation: Orientation) => void;
  initialAspectRatio?: AspectRatio;
  initialOrientation?: Orientation;
}

const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  onAspectRatioChange,
  initialAspectRatio = '16:9',
  initialOrientation = 'landscape'
}) => {
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>(initialAspectRatio);
  const [selectedOrientation, setSelectedOrientation] = useState<Orientation>(initialOrientation);
  const [isInitialized, setIsInitialized] = useState(false);

  // 外部からのプロパティ変更を内部状態に反映
  useEffect(() => {
    setSelectedRatio(initialAspectRatio);
  }, [initialAspectRatio]);
  
  useEffect(() => {
    setSelectedOrientation(initialOrientation);
  }, [initialOrientation]);

  // 初期化完了をマーク
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // 変更時のみコールバックを呼ぶ（初期化時は除く）
  useEffect(() => {
    if (isInitialized && onAspectRatioChange) {
      onAspectRatioChange(selectedRatio, selectedOrientation);
    }
  }, [selectedRatio, selectedOrientation, onAspectRatioChange, isInitialized]);

  const handleRatioChange = (ratio: AspectRatio) => {
    setSelectedRatio(ratio);
  };

  const handleOrientationChange = (orientation: Orientation) => {
    setSelectedOrientation(orientation);
  };

  return (
    <div className="aspect-ratio-selector">
      <div className="selector-section">
        <label>アスペクト比</label>
        <div className="ratio-buttons">
          <button
            className={`ratio-button ${selectedRatio === '16:9' ? 'active' : ''}`}
            onClick={() => handleRatioChange('16:9')}
          >
            16:9
          </button>
          <button
            className={`ratio-button ${selectedRatio === '4:3' ? 'active' : ''}`}
            onClick={() => handleRatioChange('4:3')}
          >
            4:3
          </button>
          <button
            className={`ratio-button ${selectedRatio === '1:1' ? 'active' : ''}`}
            onClick={() => handleRatioChange('1:1')}
          >
            1:1
          </button>
        </div>
      </div>

      {selectedRatio !== '1:1' && (
        <div className="selector-section">
          <label>画面の向き</label>
          <div className="orientation-buttons">
            <button
              className={`orientation-button ${selectedOrientation === 'landscape' ? 'active' : ''}`}
              onClick={() => handleOrientationChange('landscape')}
            >
              <svg viewBox="0 0 24 16" width="24" height="16">
                <rect x="1" y="1" width="22" height="14" fill="none" stroke="currentColor" strokeWidth="2"/>
              </svg>
              横画面
            </button>
            <button
              className={`orientation-button ${selectedOrientation === 'portrait' ? 'active' : ''}`}
              onClick={() => handleOrientationChange('portrait')}
            >
              <svg viewBox="0 0 16 24" width="16" height="24">
                <rect x="1" y="1" width="14" height="22" fill="none" stroke="currentColor" strokeWidth="2"/>
              </svg>
              縦画面
            </button>
          </div>
        </div>
      )}

      <div className="current-settings">
        <span className="settings-label">現在の設定: </span>
        <span className="settings-value">
          {selectedRatio}
          {selectedRatio !== '1:1' && ` (${selectedOrientation === 'landscape' ? '横' : '縦'})`}
        </span>
      </div>
    </div>
  );
};

export default AspectRatioSelector;