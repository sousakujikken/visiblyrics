import React from 'react';
import '../../styles/components.css';
import Engine from '../../engine/Engine';

interface ZoomControlsProps {
  zoomLevel: number;
  viewStart: number;
  viewEnd: number;
  totalDuration: number;
  maxZoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomLevels: number[];
  engine?: Engine; // Undo/Redo機能のためにEngineインスタンスを受け取る
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomLevel,
  viewStart,
  viewEnd,
  totalDuration,
  maxZoomLevel,
  onZoomIn,
  onZoomOut,
  zoomLevels,
  engine
}) => {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Undo操作
  const handleUndo = () => {
    if (engine && engine.canUndo()) {
      const success = engine.undo();
      if (success) {
        console.log('Undo操作が完了しました');
      } else {
        console.error('Undo操作に失敗しました');
      }
    }
  };
  
  // Redo操作
  const handleRedo = () => {
    if (engine && engine.canRedo()) {
      const success = engine.redo();
      if (success) {
        console.log('Redo操作が完了しました');
      } else {
        console.error('Redo操作に失敗しました');
      }
    }
  };

  return (
    <div className="zoom-controls-container" style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '12px',
      padding: '8px',
      backgroundColor: '#2a2a2a',
      borderRadius: '8px',
      minWidth: '280px'
    }}>
      <div style={{ 
        color: '#999', 
        fontSize: '10px',
        textAlign: 'left',
        minWidth: '80px'
      }}>
        <div>表示範囲</div>
        <div>{formatTime(viewStart)} - {formatTime(viewEnd)}</div>
        <div>/ {formatTime(totalDuration)}</div>
      </div>
      
      {/* Undo/Redoボタン */}
      <div style={{
        display: 'flex',
        gap: '4px'
      }}>
        <button 
          onClick={handleUndo}
          disabled={!engine || !engine.canUndo()}
          style={{
            padding: '4px 8px',
            background: (!engine || !engine.canUndo()) ? '#555' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '11px',
            cursor: (!engine || !engine.canUndo()) ? 'not-allowed' : 'pointer',
            minWidth: '50px'
          }}
          title="元に戻す (Undo)"
        >
          ↶ 戻す
        </button>
        <button 
          onClick={handleRedo}
          disabled={!engine || !engine.canRedo()}
          style={{
            padding: '4px 8px',
            background: (!engine || !engine.canRedo()) ? '#555' : '#ffc107',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '11px',
            cursor: (!engine || !engine.canRedo()) ? 'not-allowed' : 'pointer',
            minWidth: '50px'
          }}
          title="やり直し (Redo)"
        >
          ↷ やり直し
        </button>
      </div>
      
      {/* ズームコントロールボタン */}
      <div style={{
        display: 'flex',
        gap: '4px'
      }}>
        <button 
          onClick={onZoomIn}
          disabled={zoomLevel === 0}
          style={{
            padding: '4px 8px',
            background: zoomLevel === 0 ? '#555' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: zoomLevel === 0 ? 'not-allowed' : 'pointer',
            minWidth: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="より詳細に表示"
        >
          🔍+
        </button>
        <button 
          onClick={onZoomOut}
          disabled={zoomLevel === maxZoomLevel || Math.min(zoomLevels[zoomLevel + 1] || Infinity, totalDuration) <= (viewEnd - viewStart)}
          style={{
            padding: '4px 8px',
            background: (zoomLevel === maxZoomLevel || Math.min(zoomLevels[zoomLevel + 1] || Infinity, totalDuration) <= (viewEnd - viewStart)) ? '#555' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: (zoomLevel === maxZoomLevel || Math.min(zoomLevels[zoomLevel + 1] || Infinity, totalDuration) <= (viewEnd - viewStart)) ? 'not-allowed' : 'pointer',
            minWidth: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="より広く表示"
        >
          🔍−
        </button>
      </div>
      
      <div style={{ 
        color: '#666', 
        fontSize: '9px',
        textAlign: 'center',
        minWidth: '60px'
      }}>
        {Math.floor((viewEnd - viewStart) / 1000)}秒表示
      </div>
    </div>
  );
};

export default ZoomControls;