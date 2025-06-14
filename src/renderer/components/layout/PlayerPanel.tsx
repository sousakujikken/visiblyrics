import React, { useEffect } from 'react';
import '../../styles/components.css';

interface PlayerPanelProps {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (value: number) => void;
}

const PlayerPanel: React.FC<PlayerPanelProps> = ({
  isPlaying,
  currentTime,
  totalDuration,
  onPlay,
  onPause,
  onReset,
  onSeek
}) => {
  
  // シークイベントの監視
  useEffect(() => {
    // 波形からのシークイベントを監視
    const handleWaveformSeek = (event: CustomEvent) => {
      if (event.detail && event.detail.currentTime !== undefined) {
        console.log('PlayerPanel: 波形シークイベントを受信:', event.detail.currentTime + 'ms');
      }
    };
    
    // エンジンからのシークイベントを監視
    const handleEngineSeek = (event: CustomEvent) => {
      if (event.detail && event.detail.currentTime !== undefined) {
        console.log('PlayerPanel: エンジンシークイベントを受信:', event.detail.currentTime + 'ms');
      }
    };
    
    window.addEventListener('waveform-seek', handleWaveformSeek as EventListener);
    window.addEventListener('engine-seeked', handleEngineSeek as EventListener);
    
    return () => {
      window.removeEventListener('waveform-seek', handleWaveformSeek as EventListener);
      window.removeEventListener('engine-seeked', handleEngineSeek as EventListener);
    };
  }, []); // 依存配列を空にして重複登録を防ぐ
  
  // PlayerPanelではEngineに音声制御を委ねるため、Howlの初期化は行わない
  
  // 再生/停止/リセットの制御（Engineに委ねる）
  const handlePlay = () => {
    onPlay(); // Engineを通じて音声を制御
  };
  
  const handlePause = () => {
    onPause(); // Engineを通じて音声を制御
  };
  
  const handleReset = () => {
    onReset(); // Engineを通じて音声を制御
  };
  
  const handleSeek = (value: number) => {
    onSeek(value); // Engineを通じてシークを制御
  };
  
  // 10秒前後にジャンプする関数
  const jumpForward = () => {
    const newTime = Math.min(currentTime + 10000, totalDuration);
    handleSeek(newTime);
  };
  
  const jumpBackward = () => {
    const newTime = Math.max(currentTime - 10000, 0);
    handleSeek(newTime);
  };

  return (
    <div className="player-panel-container">
      <div className="player-controls">
        <button 
          className="control-button reset-button" 
          onClick={handleReset} 
          title="先頭に戻る"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M6 6h2v12H6z"></path>
            <path d="M9.5 12l8.5 6V6z"></path>
          </svg>
        </button>
        
        <button 
          className="control-button jump-button" 
          onClick={jumpBackward}
          title="10秒戻る"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19L2 12l9-7v14z"></path>
            <path d="M22 19L13 12l9-7v14z"></path>
          </svg>
        </button>
        
        {isPlaying ? (
          <button 
            className="control-button pause-button" 
            onClick={handlePause} 
            title="一時停止"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          </button>
        ) : (
          <button 
            className="control-button play-button" 
            onClick={handlePlay} 
            title="再生"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M8 5.14v14l11-7-11-7z"></path>
            </svg>
          </button>
        )}
        
        <button 
          className="control-button jump-button" 
          onClick={jumpForward}
          title="10秒進む"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 5v14l9-7-9-7z"></path>
            <path d="M2 5v14l9-7-9-7z"></path>
          </svg>
        </button>
      </div>
      
      <div className="seek-controls">
        <div className="time-display current-time">
          {formatTime(currentTime)}
        </div>
        
        <div className="slider-container">
          <input 
            type="range" 
            className="seek-slider"
            value={currentTime} 
            min={0} 
            max={totalDuration} 
            onChange={(e) => handleSeek(Number(e.target.value))}
            style={{
              width: '100%',
              height: '8px',
              appearance: 'none',
              background: `linear-gradient(to right, #09f ${(currentTime / totalDuration) * 100}%, #444 0%)`,
              borderRadius: '4px',
              outline: 'none'
            }}
          />
        </div>
        
        <div className="time-display total-time">
          {formatTime(totalDuration)}
        </div>
      </div>
    </div>
  );
};

// 時間をmm:ss.ms形式にフォーマット
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

export default PlayerPanel;
