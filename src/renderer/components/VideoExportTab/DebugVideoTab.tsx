import React, { useEffect, useRef, useState } from 'react';
import DebugVideoExporter from '../../../export/video/test/DebugVideoExporter';
import './DebugVideoTab.css';

const DebugVideoTab: React.FC = () => {
  const videoContainerId = 'debug-video-container';
  const exporterRef = useRef<DebugVideoExporter | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  
  // コンソールログをフックして表示する
  useEffect(() => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // ログをキャプチャする関数
    const captureLog = (type: string, args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      // DebugVideoExporterに関連するログのみをフィルタリング
      if (message.includes('DebugVideoExporter') || 
          message.includes('録画') || 
          message.includes('デバッグ') ||
          message.includes('MediaRecorder')) {
        setLogMessages(prev => [...prev, `[${type}] ${message}`].slice(-20)); // 最新20件のみ保持
      }
    };
    
    // コンソール関数をオーバーライド
    console.log = (...args) => {
      originalConsoleLog.apply(console, args);
      captureLog('LOG', args);
    };
    
    console.error = (...args) => {
      originalConsoleError.apply(console, args);
      captureLog('ERROR', args);
    };
    
    console.warn = (...args) => {
      originalConsoleWarn.apply(console, args);
      captureLog('WARN', args);
    };
    
    return () => {
      // クリーンアップ時に元に戻す
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };
  }, []);
  
  // コンポーネントのマウント時にエクスポーターを初期化
  useEffect(() => {
    if (!isInitialized) {
      try {
        console.log('DebugVideoExporter コンポーネントのマウント');
        exporterRef.current = new DebugVideoExporter(videoContainerId);
        setIsInitialized(true);
      } catch (error) {
        console.error('DebugVideoExporterの初期化に失敗:', error);
      }
    }
    
    // コンポーネントのアンマウント時にクリーンアップ
    return () => {
      if (exporterRef.current) {
        exporterRef.current.destroy();
        exporterRef.current = null;
        console.log('DebugVideoExporter を破棄しました');
      }
    };
  }, [isInitialized]);
  
  // 動画作成ボタンハンドラ（3秒テスト）
  const handleCreateVideo = async () => {
    if (!exporterRef.current) {
      console.error('エクスポーターが初期化されていません');
      return;
    }
    
    setIsExporting(true);
    setLogMessages([]);
    
    try {
      console.log('デバッグ動画作成開始（3秒）');
      await exporterRef.current.startRecording();
      
      // 3秒後に自動的に録画完了
      setTimeout(() => {
        setIsExporting(false);
        console.log('デバッグ動画作成完了（3秒）');
      }, 3500); // 3秒 + バッファ500ms
      
    } catch (error) {
      console.error('動画作成エラー:', error);
      setIsExporting(false);
    }
  };
  
  // 15秒テスト用ハンドラ（バッチ間ジャンプ確認用）
  const handleCreate15SecondVideo = async () => {
    if (!exporterRef.current) {
      console.error('エクスポーターが初期化されていません');
      return;
    }
    
    setIsExporting(true);
    setLogMessages([]);
    
    try {
      console.log('15秒デバッグ動画作成開始（バッチ間ジャンプ確認用）');
      await exporterRef.current.startLongRecording(15000); // 15秒
      
      // 15秒後に自動的に録画完了
      setTimeout(() => {
        setIsExporting(false);
        console.log('15秒デバッグ動画作成完了');
      }, 15500); // 15秒 + バッファ500ms
      
    } catch (error) {
      console.error('15秒動画作成エラー:', error);
      setIsExporting(false);
    }
  };
  
  return (
    <div className="debug-video-tab">
      <h2>デバッグ動画作成</h2>
      <p className="description">
        デバッグ用グラフィックを描画してテスト映像を生成します。
        3秒テストは基本動作確認用、15秒テストはバッチ間ジャンプの確認用です。
      </p>
      
      <div className="video-preview-section">
        <h3>プレビュー</h3>
        <div id={videoContainerId} className="video-preview-container"></div>
      </div>
      
      <div className="debug-controls">
        <button 
          className={`debug-button ${isExporting ? 'exporting' : ''}`}
          onClick={handleCreateVideo}
          disabled={isExporting || !isInitialized}
        >
          {isExporting ? '出力中...' : '3秒テスト動画を作成'}
        </button>
        
        <button 
          className={`debug-button batch-test ${isExporting ? 'exporting' : ''}`}
          onClick={handleCreate15SecondVideo}
          disabled={isExporting || !isInitialized}
        >
          {isExporting ? '出力中...' : '15秒テスト動画を作成（バッチ間確認）'}
        </button>
        
        {isExporting && (
          <div className="export-progress">
            <div className="spinner"></div>
            <span>録画中... 自動的に完了します</span>
          </div>
        )}
      </div>
      
      <div className="log-container">
        <h3>ログ出力</h3>
        <div className="log-messages">
          {logMessages.length > 0 ? (
            logMessages.map((msg, index) => (
              <div key={index} className={`log-message ${msg.includes('ERROR') ? 'error' : ''}`}>
                {msg}
              </div>
            ))
          ) : (
            <div className="no-logs">録画を開始すると、ここにログが表示されます。</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebugVideoTab;
