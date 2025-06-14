import { useState, useEffect, useRef } from 'react';
import { IAnimationTemplate } from './types/types';
import NewLayout from './components/NewLayout';
import Engine from './engine/Engine';
import { getTemplateById } from './templates/registry/templateRegistry';
import { FontService } from './services/FontService';
import { initializeLogging } from '../config/logging';
import testLyricsData from './data/longTestLyrics.json';
import './App.css';

// Initialize logging configuration
initializeLogging();

// デバッグ情報の型定義
interface DebugInfo {
  previewCenter?: { x: number, y: number };
  phrasePosition?: { x: number, y: number };
  redRectGlobal?: { x: number, y: number };
  redRectLocal?: { x: number, y: number };
  wordRectGlobal?: { x: number, y: number };
  wordRectLocal?: { x: number, y: number };
  wordId?: string;
  wordText?: string;
  charRectGlobal?: { x: number, y: number };
  charRectLocal?: { x: number, y: number };
  charId?: string;
  charText?: string;
  lastUpdated?: number;
}

// タイミングデバッグ情報の型定義
interface TimingDebugInfo {
  currentTime?: number;
  activePhrase?: {
    id?: string;
    inTime?: number;
    outTime?: number;
    isVisible?: boolean;
    state?: string;
  }[];
  activeWord?: {
    id?: string;
    inTime?: number;
    outTime?: number;
    isVisible?: boolean;
    state?: string;
  }[];
}

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60000); // デフォルト60秒（エンジンから実際の値を取得する）
  const [selectedTemplate, setSelectedTemplate] = useState('fadeslidetext'); // テンプレート選択状態
  const [engineReady, setEngineReady] = useState(false); // エンジン初期化状態を追加
  const [fontServiceReady, setFontServiceReady] = useState(false); // FontService初期化状態を追加
  const [currentTemplate, setCurrentTemplate] = useState<IAnimationTemplate | null>(null); // 現在のテンプレートを状態として保持
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({});
  const [timingDebugInfo, setTimingDebugInfo] = useState<TimingDebugInfo>({});// タイミングデバッグ情報

  const engineRef = useRef<Engine | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  
  // Electron APIの状態を確認
  useEffect(() => {
    console.log('=== Electron API Check ===');
    console.log('window.electronAPI:', window.electronAPI);
    console.log('window.electronAPI?.persistence:', window.electronAPI?.persistence);
    console.log('Available persistence methods:', window.electronAPI?.persistence ? Object.keys(window.electronAPI.persistence) : 'None');
    console.log('=========================');
  }, []);

  // デバッグ情報を受け取るカスタムイベントリスナー
  useEffect(() => {
    const setupTimestamp = Date.now();
    console.log(`[${setupTimestamp}] App.tsx: ===== イベントリスナー設定開始 =====`);
    console.log(`[${setupTimestamp}] App.tsx: engineRef.current: ${engineRef.current ? '存在' : 'null'}`);
    console.log(`[${setupTimestamp}] App.tsx: engineReady: ${engineReady}`);
    console.log(`[${setupTimestamp}] App.tsx: totalDuration: ${totalDuration}`);
    
    // カスタムイベントのリスナーを設定
    const handleDebugInfo = (event: CustomEvent) => {
      // 新しいデータ形式を確認
      if (event.detail) {
        // timestampを除外して無限ループを防ぐ
        const { timestamp, ...eventData } = event.detail;
        setDebugInfo(prevInfo => ({
          ...prevInfo,
          ...eventData
        }));
      }
    };
    
    // 単語レベルのデバッグ情報リスナー
    const handleWordDebugInfo = (event: CustomEvent) => {
      // 単語始め固有のデバッグ情報を更新
      if (event.detail.wordRectGlobal) {
        setDebugInfo(prevInfo => ({
          ...prevInfo,
          wordRectGlobal: event.detail.wordRectGlobal,
          wordRectLocal: event.detail.wordRectLocal,
          wordId: event.detail.wordId,
          wordText: event.detail.wordText,
          lastUpdated: Date.now()
        }));
      }
    };
    
    // タイミングデバッグ情報リスナー
    const handleTimingDebugInfo = (event: CustomEvent) => {
      setTimingDebugInfo(event.detail);
    };

    // タイムライン更新イベントのリスナー（歌詞データ読み込み後の持続時間更新用）
    const handleTimelineUpdated = (event: CustomEvent) => {
      if (event.detail && event.detail.duration) {
        setTotalDuration(event.detail.duration);
      }
    };
    
    // 波形シークイベントのリスナー
    const handleWaveformSeek = (event: CustomEvent) => {
      if (event.detail && event.detail.currentTime !== undefined) {
        const seekTime = event.detail.currentTime;
        // 共通のhandleSeek関数を使用してエンジンと状態の完全同期を実現
        handleSeek(seekTime);
      }
    };
    
    // エンジンシークイベントのリスナー
    const handleEngineSeek = (event: CustomEvent) => {
      if (event.detail && event.detail.currentTime !== undefined) {
        setCurrentTime(event.detail.currentTime);
      }
    };
    
    // キーボードショートカットのハンドラ
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z: Undo
      if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (engineRef.current) {
          const success = engineRef.current.undo();
          if (success) {
            console.log('Undo実行完了');
          } else {
            console.log('Undoできません（履歴なし）');
          }
        }
      }
      // Ctrl+Shift+Z または Ctrl+Y: Redo
      else if ((event.ctrlKey && event.shiftKey && event.key === 'Z') || 
               (event.ctrlKey && event.key === 'y')) {
        event.preventDefault();
        if (engineRef.current) {
          const success = engineRef.current.redo();
          if (success) {
            console.log('Redo実行完了');
          } else {
            console.log('Redoできません（履歴なし）');
          }
        }
      }
    };

    // イベントリスナーを追加
    console.log(`[${setupTimestamp}] App.tsx: イベントリスナー登録開始`);
    window.addEventListener('debug-info-updated', handleDebugInfo as EventListener);
    window.addEventListener('word-debug-info-updated', handleWordDebugInfo as EventListener);
    window.addEventListener('timing-debug-info-updated', handleTimingDebugInfo as EventListener);
    window.addEventListener('timeline-updated', handleTimelineUpdated as EventListener);
    window.addEventListener('waveform-seek', handleWaveformSeek as EventListener);
    window.addEventListener('engine-seeked', handleEngineSeek as EventListener);
    window.addEventListener('keydown', handleKeyDown);
    console.log(`[${setupTimestamp}] App.tsx: イベントリスナー登録完了`);
    console.log(`[${setupTimestamp}] App.tsx: ===== イベントリスナー設定完了 =====`);

    // クリーンアップ
    return () => {
      console.log(`[${Date.now()}] App.tsx: ===== イベントリスナークリーンアップ =====`);
      window.removeEventListener('debug-info-updated', handleDebugInfo as EventListener);
      window.removeEventListener('word-debug-info-updated', handleWordDebugInfo as EventListener);
      window.removeEventListener('timing-debug-info-updated', handleTimingDebugInfo as EventListener);
      window.removeEventListener('timeline-updated', handleTimelineUpdated as EventListener);
      window.removeEventListener('waveform-seek', handleWaveformSeek as EventListener);
      window.removeEventListener('engine-seeked', handleEngineSeek as EventListener);
      window.removeEventListener('keydown', handleKeyDown);
      console.log(`[${Date.now()}] App.tsx: イベントリスナークリーンアップ完了`);
    };
  }, []); // 一度だけ登録し、イベントハンドラ内で最新のstateを参照する方式に変更



  // コンポーネントのアンマウント時にクリーンアップするための効果
  useEffect(() => {
    return () => {
      console.log("=== 最終クリーンアップ ===");
      
      // requestAnimationFrameをキャンセル
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      cleanupEngine();
    };
  }, []);

  // FontServiceの初期化（アプリケーション起動時に一度だけ）
  useEffect(() => {
    console.log("=== FontService初期化開始 ===");
    
    const initializeFontService = async () => {
      try {
        await FontService.initialize();
        console.log("FontService初期化完了");
        setFontServiceReady(true);
      } catch (error) {
        console.error("FontService初期化エラー:", error);
        // エラーが発生してもアプリケーションは動作させる
        setFontServiceReady(true);
      }
    };
    
    initializeFontService();
  }, []); // 一度だけ実行
  
  // 自動保存データの復元確認
  useEffect(() => {
    console.log('App.tsx: 自動保存復元イベントリスナーを設定');
    
    const handleAutoSaveAvailable = (event: CustomEvent) => {
      console.log('App.tsx: ===== 自動保存復元イベントを受信 =====');
      console.log('App.tsx: event.detail:', event.detail);
      
      const { timestamp, hasLyrics, hasAudio } = event.detail;
      const timeAgo = Date.now() - timestamp;
      const minutes = Math.floor(timeAgo / 60000);
      const hours = Math.floor(minutes / 60);
      
      let timeText = '';
      if (hours > 0) {
        timeText = `${hours}時間前`;
      } else if (minutes > 0) {
        timeText = `${minutes}分前`;
      } else {
        timeText = '数秒前';
      }
      
      const message = `前回の作業内容を復元しますか？\n（${timeText}の自動保存データ）\n\n` +
                     `歌詞データ: ${hasLyrics ? 'あり' : 'なし'}\n` +
                     `音楽ファイル: ${hasAudio ? 'あり' : 'なし'}`;
      
      console.log('App.tsx: 復元確認ダイアログを表示');
      console.log('App.tsx: メッセージ:', message);
      
      if (window.confirm(message)) {
        console.log('App.tsx: ユーザーが復元を選択しました');
        // エンジンが初期化されるまで待つ
        const checkEngineAndRestore = async () => {
          if (engineRef.current) {
            console.log('App.tsx: Engine.loadFromLocalStorage() を実行');
            await engineRef.current.loadFromLocalStorage();
            console.log('App.tsx: Engine.loadFromLocalStorage() 完了');
          } else {
            console.log('App.tsx: エンジンが初期化されていないため再試行');
            // エンジンがまだ初期化されていない場合は少し待って再試行
            setTimeout(checkEngineAndRestore, 100);
          }
        };
        checkEngineAndRestore();
      } else {
        console.log('App.tsx: ユーザーが復元をキャンセルしました');
      }
    };
    
    window.addEventListener('visiblyrics:autosave-available', handleAutoSaveAvailable as EventListener);
    
    return () => {
      console.log('App.tsx: 自動保存復元イベントリスナーを削除');
      window.removeEventListener('visiblyrics:autosave-available', handleAutoSaveAvailable as EventListener);
    };
  }, []);

  // 初回のエンジン初期化（1回のみ）
  useEffect(() => {
    console.log("=== アプリケーション初期化（初回のみ） ===");
    console.log("テストデータ:", testLyricsData);
    console.log("現在選択されているテンプレートID:", selectedTemplate);
    
    // FontServiceの初期化を待ってからエンジンを初期化
    if (!fontServiceReady) {
      console.log("FontService初期化待機中...");
      return;
    }
    
    // 初回のみエンジンを初期化
    if (!engineRef.current) {
      setEngineReady(false);
      
      // canvasContainer要素が存在することを確認してからエンジンを初期化
      // setTimeout で DOM 更新後に実行することを保証
      setTimeout(() => {
        try {
          const canvasElement = document.getElementById('canvasContainer');
          if (canvasElement) {
            console.log("canvasContainer要素を検出しました。エンジンを初期化します。");
            initEngine();
          } else {
            console.error("canvasContainer要素が見つかりません。エンジン初期化をスキップします。");
            // エラー状態を通知
            setEngineReady(false);
          }
        } catch (error) {
          console.error("エンジン初期化エラー:", error);
          setEngineReady(false);
        }
      }, 100); // 100msの遅延を設定
    }
  }, [fontServiceReady]); // FontService初期化完了後に実行
  
  // テンプレート変更の処理（エンジンを再初期化せずテンプレートのみ変更）
  useEffect(() => {
    // 初回の場合はスキップ（上記のuseEffectで初期化される）
    if (!engineRef.current || !engineReady) {
      return;
    }
    
    console.log("=== テンプレート変更処理 ===");
    console.log("新しいテンプレートID:", selectedTemplate);
    
    try {
      // テンプレートレジストリから動的にテンプレートを取得
      const template = getTemplateById(selectedTemplate);
      if (!template) {
        console.error(`Template not found: ${selectedTemplate}`);
        return;
      }
      
      // テンプレートの検証
      if (typeof template.getParameterConfig !== 'function') {
        console.error(`Invalid template: ${selectedTemplate} must implement getParameterConfig() method`);
        return;
      }
      
      // 既存のパラメータを取得し、不足分をデフォルト値で補完
      const existingParams = engineRef.current.parameterManager 
        ? engineRef.current.parameterManager.getGlobalParams() 
        : {};
      
      // デフォルトパラメータを取得
      const defaultParams = {};
      const paramConfig = template.getParameterConfig();
      paramConfig.forEach((param) => {
        defaultParams[param.name] = param.default;
      });
      
      // 既存のパラメータを優先し、新しいパラメータのみデフォルト値を設定
      const mergedParams = { ...defaultParams, ...existingParams };
      
      // エンジンのテンプレートを変更（歌詞データを保持）
      const success = engineRef.current.changeTemplate(template, mergedParams, selectedTemplate);
      if (success) {
        setCurrentTemplate(template);
        console.log("テンプレート変更完了 - 歌詞データとマーカー調整結果を保持");
      } else {
        console.error("テンプレート変更に失敗しました");
      }
    } catch (error) {
      console.error("テンプレート変更エラー:", error);
    }
  }, [selectedTemplate, engineReady]); // テンプレート変更時とエンジン準備完了時に実行

  // プロジェクトロード時のイベントリスナー
  useEffect(() => {
    const handleProjectLoaded = (event: CustomEvent) => {
      const { globalTemplateId } = event.detail;
      if (globalTemplateId && globalTemplateId !== selectedTemplate) {
        console.log('App: プロジェクトロード時のテンプレートをUIに反映:', globalTemplateId);
        setSelectedTemplate(globalTemplateId);
      }
    };

    const handleTemplateLoaded = (event: CustomEvent) => {
      const { templateId } = event.detail;
      if (templateId && templateId !== selectedTemplate) {
        console.log('App: ロードされたテンプレートをUIに反映:', templateId);
        setSelectedTemplate(templateId);
      }
    };

    window.addEventListener('project-loaded', handleProjectLoaded as EventListener);
    window.addEventListener('template-loaded', handleTemplateLoaded as EventListener);

    return () => {
      window.removeEventListener('project-loaded', handleProjectLoaded as EventListener);
      window.removeEventListener('template-loaded', handleTemplateLoaded as EventListener);
    };
  }, [selectedTemplate]);

  // エンジンのクリーンアップ
  const cleanupEngine = () => {
    // アニメーションフレームをキャンセル
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // エンジンを破棄
    if (engineRef.current) {
      try {
        engineRef.current.destroy();
        engineRef.current = null;
      } catch (error) {
        console.error("Engine cleanup error:", error);
      }
    }
  };

  // エンジン初期化
  const initEngine = async () => {
    try {
      // テンプレートレジストリから動的にテンプレートを取得
      const template = getTemplateById(selectedTemplate);
      if (!template) {
        console.error(`Template not found: ${selectedTemplate}`);
        setEngineReady(false);
        return;
      }
      
      // テンプレートの検証
      if (typeof template.getParameterConfig !== 'function') {
        console.error(`Invalid template: ${selectedTemplate} must implement getParameterConfig() method`);
        setEngineReady(false);
        return;
      }
      
      // テンプレートのパラメータ設定からデフォルトパラメータを取得
      // システムデフォルト値（Arial, フォントサイズ120, オレンジ色）をベースにする
      const systemDefaults = {
        fontSize: 120,
        fontFamily: 'Arial',
        fill: '#FFA500', // オレンジ色
        defaultTextColor: '#FFA500', // オレンジ色
        activeTextColor: '#FFA500', // オレンジ色
        completedTextColor: '#FFA500' // オレンジ色
      };
      
      const params = { ...systemDefaults };
      const paramConfig = template.getParameterConfig();
      paramConfig.forEach((param) => {
        // システムデフォルト値がある場合はそれを優先、ない場合はテンプレートのデフォルト値を使用
        if (systemDefaults[param.name] === undefined) {
          params[param.name] = param.default;
        }
      });
      
      setCurrentTemplate(template);
      
      // canvasContainer要素の再確認
      const canvasElement = document.getElementById('canvasContainer');
      if (!canvasElement) {
        console.error('initEngine: canvasContainer要素が見つかりません');
        setEngineReady(false);
        return;
      }
      
      const engineInitTimestamp = Date.now();
      console.log(`[${engineInitTimestamp}] App.tsx: ===== エンジン初期化開始 =====`);
      
      // PIXIエンジンの初期化
      const engine = new Engine('canvasContainer', template, params, selectedTemplate);
      console.log(`[${engineInitTimestamp}] App.tsx: Engine作成完了`);
      
      // エンジンインスタンスを保存（自動保存チェックの前に設定）
      engineRef.current = engine;
      console.log(`[${engineInitTimestamp}] App.tsx: engineRef.current設定完了`);
      
      // 注意：テスト歌詞のロードはしない
      // Engine初期化時にcheckAndPromptAutoRestore()が呼ばれ、
      // 自動保存データがある場合は復元ダイアログが表示される
      // 自動保存データがない場合や復元しない場合は、ユーザーが手動で歌詞をロードする
      console.log(`[${engineInitTimestamp}] App.tsx: テスト歌詞の自動ロードをスキップ（復元プロセスを優先）`);

      // エンジンから実際の持続時間を取得
      const { duration: engineDuration } = engine.getTimelineData();
      setTotalDuration(engineDuration);
      console.log(`アニメーション期間: 0-${engineDuration}ms（エンジンから取得）`);
      
      // デバッグ機能を有効化
      engine.setDebugEnabled(true);
      console.log('デバッグ機能を有効化しました');
      
      // 初期表示
      engine.seek(0);
      
      // 状態をリセット
      setIsPlaying(false);
      setCurrentTime(0);
      
      // 現在のテンプレートを設定
      setCurrentTemplate(template);
      
      // エンジン初期化完了をマーク
      setEngineReady(true);
      console.log("Engine 初期化完了");
      
      // updateFrameループを開始
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(updateFrame);
      }

      // デバッグ情報の初期化
      setTimeout(() => {
        // エンジンのプレビューエリアサイズを取得
        if (engine.app && engine.app.renderer) {
          const screenWidth = engine.app.screen.width;
          const screenHeight = engine.app.screen.height;
          const centerX = screenWidth / 2;
          const centerY = screenHeight / 2;
          
            setDebugInfo({
              previewCenter: { x: centerX, y: centerY },
              phrasePosition: { x: centerX, y: centerY },
              redRectGlobal: { x: centerX, y: centerY },
              redRectLocal: { x: 0, y: 0 },
              wordRectGlobal: { x: centerX, y: centerY },
              wordRectLocal: { x: 0, y: 0 },
              wordId: 'phrase_1_word_0',
              wordText: '初期化時',
              lastUpdated: Date.now()
            });
            
            // 強制的にグローバル空間に単語情報デバッグデータを追加
            (window as any).wordMarkerDebugInfo = {
              wordId: 'phrase_1_word_0',
              wordText: '初期化時',
              globalPos: { x: centerX, y: centerY },
              timestamp: Date.now()
            };
            
            // 初期化後に強制的にデバッグ情報を更新
            const event = new CustomEvent('debug-info-updated', { 
              detail: {
                previewCenter: { x: centerX, y: centerY },
                phrasePosition: { x: centerX, y: centerY },
                redRectGlobal: { x: centerX, y: centerY },
                redRectLocal: { x: 0, y: 0 },
                wordRectGlobal: { x: centerX, y: centerY },
                wordRectLocal: { x: 0, y: 0 },
                wordId: 'phrase_1_word_0',
                wordText: '初期化時',
                timestamp: Date.now()
              }
            });
          window.dispatchEvent(event);
          console.log(`デバッグ情報初期化: 中心座標=(${centerX}, ${centerY})`);
        }
      }, 100);
    } catch (error) {
      console.error("エンジン初期化エラー:", error);
      setEngineReady(false);
    }
  };

  // アニメーションフレーム更新処理
  const updateFrame = () => {
    if (engineRef.current) {
      const currentEngineTime = engineRef.current.currentTime;
      
      // フレームカウントを増やし、30フレームに1回だけ状態を更新（約30FPSで更新）
      frameCountRef.current++;
      
      if (frameCountRef.current % 2 === 0 || Math.abs(currentEngineTime - lastTimeRef.current) > 100) {
        // 2フレームに1回、または100ms以上の差がある場合のみ更新
        setCurrentTime(currentEngineTime);
        lastTimeRef.current = currentEngineTime;
      }
      
      // 再生中で終了時間に達した場合のみ停止処理
      if (currentEngineTime >= totalDuration && isPlaying) {
        console.log("アニメーション終了");
        handlePause();
        handleReset();
        return;
      }
    }
    
    // 常に次のフレームをリクエスト
    animationFrameRef.current = requestAnimationFrame(updateFrame);
  };

  // 再生ハンドラ
  const handlePlay = () => {
    console.log("再生ボタンクリック");
    if (engineRef.current) {
      engineRef.current.play();
      setIsPlaying(true);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(updateFrame);
    }
  };

  // 一時停止ハンドラ
  const handlePause = () => {
    console.log("一時停止ボタンクリック");
    if (engineRef.current) {
      engineRef.current.pause();
      setIsPlaying(false);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  };

  // リセットハンドラ
  const handleReset = () => {
    console.log("リセットボタンクリック");
    if (engineRef.current) {
      engineRef.current.reset();
      setCurrentTime(0);
    }
  };

  // シークハンドラ
  const handleSeek = (value: number) => {
    const handleSeekTimestamp = Date.now();
    console.log(`[${handleSeekTimestamp}] App.tsx: ===== handleSeek関数実行 =====`);
    console.log(`[${handleSeekTimestamp}] App.tsx: シーク値: ${value}ms`);
    console.log(`[${handleSeekTimestamp}] App.tsx: engineRef.current: ${engineRef.current ? '存在' : 'null'}`);
    console.log(`[${handleSeekTimestamp}] App.tsx: 現在のcurrentTime: ${currentTime}ms`);
    
    if (engineRef.current) {
      console.log(`[${handleSeekTimestamp}] App.tsx: Engine.seek(${value})を実行します`);
      engineRef.current.seek(value);
      console.log(`[${handleSeekTimestamp}] App.tsx: Engine.seek(${value})実行完了`);
      
      console.log(`[${handleSeekTimestamp}] App.tsx: setCurrentTime(${value})を実行します`);
      setCurrentTime(value);
      console.log(`[${handleSeekTimestamp}] App.tsx: setCurrentTime(${value})実行完了`);
      
      // シーク後に強制的にデバッグ情報を更新
      setTimeout(() => {
        if (engineRef.current && engineRef.current.app) {
          const centerX = engineRef.current.app.screen.width / 2;
          const centerY = engineRef.current.app.screen.height / 2;
          
          const event = new CustomEvent('debug-info-updated', { 
            detail: {
              previewCenter: { x: centerX, y: centerY },
              phrasePosition: { x: centerX, y: centerY },
              redRectGlobal: { x: centerX, y: centerY },
              redRectLocal: { x: 0, y: 0 },
              wordRectGlobal: { x: centerX, y: centerY },
              wordRectLocal: { x: 0, y: 0 },
              wordId: 'phrase_1_word_0',
              wordText: 'シーク後',
              timestamp: Date.now()
            }
          });
          window.dispatchEvent(event);
        }
      }, 50); // シーク処理の後に実行
    } else {
      console.warn(`[${handleSeekTimestamp}] App.tsx: engineRef.currentがnullのためシークをスキップします`);
    }
    console.log(`[${handleSeekTimestamp}] App.tsx: ===== handleSeek関数完了 =====`);
  };

  // テンプレート変更ハンドラ（再生を停止ぜずテンプレートのみ変更）
  const handleTemplateChange = (template: string) => {
    console.log(`テンプレート変更: ${template} - 再生状態を保持`);
    // 再生中でも停止せず、テンプレートのみ変更
    setSelectedTemplate(template);
  };

  return (
    <div className="app-container">
      {/* 常に NewLayout をレンダリングし、canvasContainer を確保する */}
      <NewLayout
        onPlay={handlePlay}
        onPause={handlePause}
        onReset={handleReset}
        onSeek={handleSeek}
        onTemplateChange={handleTemplateChange}
        isPlaying={isPlaying}
        currentTime={currentTime}
        totalDuration={totalDuration}
        selectedTemplate={selectedTemplate}
        engine={engineReady ? engineRef.current : undefined}
        template={engineReady ? currentTemplate : undefined}
        debugInfo={debugInfo}
        timingDebugInfo={timingDebugInfo}
      />

      {/* エンジン初期化中はローディングオーバーレイを表示 */}
      {!engineReady && (
        <div className="loading-overlay">
          <div className="loading-container">
            <p>エンジン初期化中...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;