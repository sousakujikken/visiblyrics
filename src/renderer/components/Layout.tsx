import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Layout.css';

interface LayoutProps {
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (value: number) => void;
  onTemplateChange: (template: string) => void;
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  selectedTemplate: string;
}

export default function Layout({
  onPlay,
  onPause,
  onReset,
  onSeek,
  onTemplateChange,
  isPlaying,
  currentTime,
  totalDuration,
  selectedTemplate
}: LayoutProps) {
  return (
    <div className="layout">
      <h2 className="heading">Visiblyrics v0.1.0 - カラオケ効果テスト</h2>
      
      <p className="text-small">ファイルアップロード（未実装）</p>
      
      <div className="template-selector">
        <label htmlFor="template-select">テンプレート: </label>
        <select 
          id="template-select" 
          value={selectedTemplate} 
          onChange={(e) => onTemplateChange(e.target.value)}
        >
          <option value="karaoke">KaraokeColor</option>
          <option value="center">CenterText</option>
        </select>
        <Link to="/test-center" className="test-link">CenterText単体テスト</Link>
      </div>
      
      <div className="debug-info">
        <div className="debug-time">現在時間: {formatTime(currentTime)}</div>
        <div className="debug-state">
          状態: {getTimeState(currentTime)}
        </div>
      </div>
      
      <div className="canvas-container" id="canvasContainer"></div>
      
      <div className="controls">
        <div className="time-display">
          <span className="time-text">{formatTime(currentTime)}</span>
          <span className="time-text">{formatTime(totalDuration)}</span>
        </div>
        
        <div className="slider-container">
          <input 
            type="range" 
            className="slider"
            value={currentTime} 
            min={0} 
            max={totalDuration} 
            onChange={(e) => onSeek(Number(e.target.value))}
          />
        </div>
        
        <div className="button-group">
          <button className="button button-reset" onClick={onReset}>
            リセット
          </button>
          {isPlaying ? (
            <button className="button button-primary" onClick={onPause}>
              一時停止
            </button>
          ) : (
            <button className="button button-primary" onClick={onPlay}>
              再生
            </button>
          )}
        </div>
      </div>
      
      <p className="footer-text">
        歌詞アニメーションテスト - v0.1.0
      </p>
    </div>
  );
}

// 時間をmm:ss.ms形式にフォーマット
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

// 時間に基づく状態を取得
function getTimeState(time: number): string {
  if (time < 1000) {
    return "開始前";
  } else if (time < 3500) {
    return "「こんにちは」発声中";
  } else if (time < 4000) {
    return "インターバル";
  } else if (time < 6000) {
    return "「世界」発声中";
  } else {
    return "終了";
  }
}
