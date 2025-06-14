import React, { useRef, useEffect, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import Engine from '../../engine/Engine';
import '../../styles/components.css';

interface WaveformPanelProps {
  currentTime: number;
  totalDuration: number;
  viewStart?: number; // 表示開始時間（ズーム機能用）
  viewDuration?: number; // 表示期間（ズーム機能用）
  engine?: Engine;
  onSeek?: (value: number) => void;
}

const WaveformPanel: React.FC<WaveformPanelProps> = ({ 
  currentTime, 
  totalDuration,
  viewStart = 0,
  viewDuration,
  engine,
  onSeek
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  
  // シークイベントハンドラをコンポーネントトップレベルで定義
  const handleSeek = useCallback((progress: number) => {
    // 統一された全体長（totalDuration）に基づいてシーク位置を計算
    const seekTime = progress * totalDuration;
    
    // 波形シークイベントを発火してApp.tsxのhandleSeekで统一的に処理
    const waveformSeekEvent = new CustomEvent('waveform-seek', {
      detail: { 
        currentTime: seekTime,
        timestamp: Date.now(),
        source: 'WaveformPanel',
        progress: progress,
        totalDuration: totalDuration
      }
    });
    
    window.dispatchEvent(waveformSeekEvent);
  }, [totalDuration]); // totalDurationのみを依存配列に
  
  // クリックイベントハンドラ（useRefで最新のpropsを保持）
  const totalDurationRef = useRef(totalDuration);
  const viewStartRef = useRef(viewStart);
  const viewDurationRef = useRef(viewDuration);
  
  // propsの更新時にrefを更新
  useEffect(() => {
    totalDurationRef.current = totalDuration;
    viewStartRef.current = viewStart;
    viewDurationRef.current = viewDuration;
  }, [totalDuration, viewStart, viewDuration]);
  
  const handleClick = (progress: number) => {
    // refで最新の値を参照
    const currentTotalDuration = totalDurationRef.current;
    
    // 統一された全体長（totalDuration）に基づいてシーク位置を計算
    const seekTime = progress * currentTotalDuration;
    
    // 波形シークイベントを直接発火
    const waveformSeekEvent = new CustomEvent('waveform-seek', {
      detail: { 
        currentTime: seekTime,
        timestamp: Date.now(),
        source: 'WaveformPanel-ClickHandler',
        progress: progress,
        totalDuration: currentTotalDuration
      }
    });
    
    window.dispatchEvent(waveformSeekEvent);
    
    // 波形の表示更新
    if (wavesurferRef.current) {
      wavesurferRef.current.seekTo(progress);
    }
  };
  
  // 音声ファイルURLの監視
  useEffect(() => {
    // 音楽ファイル読み込みイベントのリスナー（MusicPanelからの即座のイベント）
    const handleMusicFileLoaded = (event: CustomEvent) => {
      if (event.detail.url) {
        setAudioUrl(event.detail.url);
      }
    };
  
  window.addEventListener('music-file-loaded', handleMusicFileLoaded as EventListener);
  
  return () => {
    window.removeEventListener('music-file-loaded', handleMusicFileLoaded as EventListener);
  };
  }, []);
  
  // WaveSurferの初期化
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) {
      setIsReady(false);
      return;
    }
    
    // 既存のインスタンスがあれば破棄
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }
    
    // WaveSurferインスタンスの作成
    try {
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#555',
        progressColor: '#09f',
        cursorColor: '#fff',
        barWidth: 2,
        barGap: 1,
        height: 'auto',
        normalize: true,
        responsive: true,
        fillParent: true,
        backend: 'WebAudio',
        interact: true,
        closeAudioContext: false,
        mediaControls: false
      });
      
      // 音声ファイル読み込み
      wavesurfer.load(audioUrl);
      
      // イベントリスナー
      wavesurfer.on('ready', () => {
        setIsReady(true);
        
        // 波形読み込み完了イベントを発火
        const waveformReadyEvent = new CustomEvent('waveform-ready', {
          detail: { 
            duration: wavesurfer.getDuration() * 1000 // ミリ秒に変換
          }
        });
        window.dispatchEvent(waveformReadyEvent);
      });
      
      // クリックイベントの登録
      wavesurfer.on('click', handleClick);
      
      // エラーハンドリング
      wavesurfer.on('error', (err) => {
        console.error('WaveSurfer error:', err);
        setIsReady(false);
      });
      
      wavesurferRef.current = wavesurfer;
    } catch (error) {
      console.error('WaveSurfer initialization error:', error);
    }
    
    // クリーンアップ
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [audioUrl]);
  
  // 現在の再生位置をWaveSurferに反映（統一されたtotalDurationベース）
  useEffect(() => {
    if (wavesurferRef.current && isReady && totalDuration > 0) {
      try {
        // 統一されたtotalDurationに基づいて進行度を計算
        const progress = currentTime / totalDuration;
        
        // seek中は再生しないように設定
        if (!wavesurferRef.current.isPlaying()) {
          wavesurferRef.current.seekTo(progress);
        }
      } catch (error) {
        console.warn('WaveSurfer seek error:', error);
      }
    }
  }, [currentTime, totalDuration, isReady]);
  
  // シークイベントリスナーの設定
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.on('seek', handleSeek);
      
      return () => {
        if (wavesurferRef.current) {
          wavesurferRef.current.un('seek', handleSeek);
        }
      };
    }
  }, [isReady, handleSeek]);

  return (
    <div className="waveform-panel">
      <div 
        ref={waveformRef} 
        className="waveform-container"
        style={{
          cursor: isReady ? 'pointer' : 'not-allowed',
          opacity: isReady ? 1 : 0.5
        }}
      />
      
      <div className="time-markers">
        <div className="time-marker start">
          00:00
        </div>
        <div className="time-marker end">
          {formatTime(totalDuration)}
        </div>
      </div>
    </div>
  );
};

// 時間をmm:ss形式にフォーマット（ミリ秒なし）
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default WaveformPanel;
