import React, { useState, useEffect } from 'react';
import Engine from '../../engine/Engine';
import { DebugManager, DebugSettings, DebugEventType } from '../../utils/debug';
import '../../styles/components.css';

interface DebugTabProps {
  engine?: Engine;
  debugInfo?: {
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
  };
  timingDebugInfo?: {
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
    activeChar?: {
      id?: string;
      char?: string;
      inTime?: number;
      outTime?: number;
      isVisible?: boolean;
      state?: string;
      shapeType?: number; // 形状タイプ（3～5）
    }[];
  };
}

const DebugTab: React.FC<DebugTabProps> = ({ engine, debugInfo: propDebugInfo, timingDebugInfo }) => {
  // ローカルステートでデバッグ情報を管理
  const [localDebugInfo, setLocalDebugInfo] = useState(propDebugInfo || {});
  
  // デバッグマネージャーの状態を取得する関数
  const [debugSettings, setDebugSettings] = useState<DebugSettings | null>(null);
  const [currentPhraseInfo, setCurrentPhraseInfo] = useState<any>(null);
  
  // デバッグマネージャーの参照を更新
  useEffect(() => {
    if (engine) {
      const debugManager = engine.getDebugManager();
      if (debugManager) {
        setDebugSettings(debugManager.getSettings());
      }
    }
  }, [engine]);
  
  // 現在位置のフレーズ情報を定期的に更新
  useEffect(() => {
    if (!engine || !engine.isDebugEnabled()) {
      setCurrentPhraseInfo(null);
      return;
    }
    
    const updateCurrentPhraseInfo = () => {
      try {
        const phraseInfo = engine.getCurrentPhraseInfo();
        setCurrentPhraseInfo(phraseInfo);
      } catch (error) {
        console.error('フレーズ情報取得エラー:', error);
      }
    };
    
    // 初回実行
    updateCurrentPhraseInfo();
    
    // 定期更新（500msごと）
    const intervalId = setInterval(updateCurrentPhraseInfo, 500);
    
    return () => clearInterval(intervalId);
  }, [engine, debugSettings?.enabled]);

  // debug-info-updatedイベントをリッスン
  useEffect(() => {
    // 座標更新イベントリスナー
    const handleDebugInfoUpdate = (event: any) => {
      console.log('デバッグタブ: デバッグ情報更新', event.detail);
      
      if (event.detail) {
        // デバッグ情報更新
        const updatedInfo = {
          ...event.detail,
          lastUpdated: Date.now()
        };
        
        setLocalDebugInfo(prev => ({
          ...prev,
          ...updatedInfo
        }));
      }
    };
    
    // 設定更新リスナー
    const handleSettingsUpdate = (event: any) => {
      console.log('デバッグタブ: 設定更新', event.detail);
      
      if (event.detail && event.detail.settings) {
        setDebugSettings(event.detail.settings);
        
        // デバッグモードがOFFになった場合、フレーズ情報をクリア
        if (!event.detail.settings.enabled) {
          setCurrentPhraseInfo(null);
        }
      }
    };
    
    // イベントリスナーを登録
    window.addEventListener(DebugEventType.ALL_INFO_UPDATED, handleDebugInfoUpdate);
    window.addEventListener(DebugEventType.SETTINGS_UPDATED, handleSettingsUpdate);
    
    // クリーンアップ事項
    return () => {
      window.removeEventListener(DebugEventType.ALL_INFO_UPDATED, handleDebugInfoUpdate);
      window.removeEventListener(DebugEventType.SETTINGS_UPDATED, handleSettingsUpdate);
    };
  }, []);
  
  // propsからのデバッグ情報をローカルに反映
  useEffect(() => {
    if (propDebugInfo) {
      setLocalDebugInfo(prev => ({
        ...prev,
        ...propDebugInfo
      }));
    }
  }, [propDebugInfo]);
  
  // 実際に表示に使用するデバッグ情報
  const debugInfo = localDebugInfo;
  // 時間をフォーマットする関数
  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return 'なし';
    
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
  };

  return (
    <div className="debug-tab">
      <h3>デバッグ情報</h3>
      
      <div className="debug-section">
        <h4>デバッグツール {debugSettings?.enabled || engine?.isDebugEnabled() ? '有効' : '無効'}</h4>
        <div className="debug-controls">
          <button 
            className={`debug-button ${debugSettings?.enabled || engine?.isDebugEnabled() ? 'active' : ''}`}
            onClick={() => {
              engine?.toggleDebug();
              // 状態を即座に更新
              setTimeout(() => {
                if (engine) {
                  const debugManager = engine.getDebugManager();
                  if (debugManager) {
                    setDebugSettings(debugManager.getSettings());
                  }
                }
              }, 50);
            }}
          >
            デバッグ機能 {debugSettings?.enabled || engine?.isDebugEnabled() ? 'ON' : 'OFF'}
          </button>
          
          <button 
            className={`grid-toggle-button ${engine?.isGridVisible() ? 'active' : ''}`}
            onClick={() => engine?.toggleGrid()}
            disabled={!(debugSettings?.enabled || engine?.isDebugEnabled())}
          >
            方眼目盛り表示切替
          </button>
        </div>
        
        <div className="debug-note" style={{ marginTop: '10px', marginBottom: '5px' }}>
          デバッグ機能を有効にすると、コンテナの座標情報やタイミング情報などが表示されます。
          方眼目盛りを表示するとグローバル座標と一緒に表示される目盛りが表示されます。
        </div>
      </div>
      
      <div className="debug-section">
        <h4>エンジン状態</h4>
        <div className="debug-info-row">
          <div className="debug-info-label">エンジン接続状態:</div>
          <div className="debug-info-value">{engine ? '接続済み' : '未接続'}</div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">現在の時間:</div>
          <div className="debug-info-value">{engine ? `${engine.currentTime.toFixed(2)}ms` : 'N/A'}</div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">再生状態:</div>
          <div className="debug-info-value">{engine?.isRunning ? '再生中' : '停止中'}</div>
        </div>
      </div>
      
      <div className="debug-section">
        <h4>座標情報</h4>
        <div className="debug-info-row">
          <div className="debug-info-label">プレビューエリア中心:</div>
          <div className="debug-info-value">
            {debugInfo?.previewCenter 
              ? `(${debugInfo.previewCenter.x.toFixed(1)}, ${debugInfo.previewCenter.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">フレーズコンテナ位置:</div>
          <div className="debug-info-value">
            {debugInfo?.phrasePosition 
              ? `(${debugInfo.phrasePosition.x.toFixed(1)}, ${debugInfo.phrasePosition.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">フレーズコンテナのグローバル座標:</div>
          <div className="debug-info-value" style={{color: '#ff5555', fontWeight: 'bold'}}>
            {debugInfo?.redRectGlobal
              ? `(${debugInfo.redRectGlobal.x.toFixed(1)}, ${debugInfo.redRectGlobal.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">フレーズコンテナのローカル座標:</div>
          <div className="debug-info-value" style={{color: '#ff5555', fontWeight: 'bold'}}>
            {debugInfo?.redRectLocal
              ? `(${debugInfo.redRectLocal.x.toFixed(1)}, ${debugInfo.redRectLocal.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">単語ID:</div>
          <div className="debug-info-value">
            {debugInfo?.wordId || 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">単語テキスト:</div>
          <div className="debug-info-value">
            {debugInfo?.wordText || 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">単語コンテナのグローバル座標:</div>
          <div className="debug-info-value" style={{color: '#5555ff', fontWeight: 'bold'}}>
            {debugInfo?.wordRectGlobal
              ? `(${debugInfo.wordRectGlobal.x.toFixed(1)}, ${debugInfo.wordRectGlobal.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">単語コンテナのローカル座標:</div>
          <div className="debug-info-value" style={{color: '#5555ff', fontWeight: 'bold'}}>
            {debugInfo?.wordRectLocal
              ? `(${debugInfo.wordRectLocal.x.toFixed(1)}, ${debugInfo.wordRectLocal.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        
        {/* 文字コンテナの情報表示セクションを追加 */}
        <div className="debug-info-row">
          <div className="debug-info-label">文字ID:</div>
          <div className="debug-info-value">
            {debugInfo?.charId || 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">文字:</div>
          <div className="debug-info-value">
            {debugInfo?.charText || 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">文字コンテナのグローバル座標:</div>
          <div className="debug-info-value" style={{color: '#55cc55', fontWeight: 'bold'}}>
            {debugInfo?.charRectGlobal
              ? `(${debugInfo.charRectGlobal.x.toFixed(1)}, ${debugInfo.charRectGlobal.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">文字コンテナのローカル座標:</div>
          <div className="debug-info-value" style={{color: '#55cc55', fontWeight: 'bold'}}>
            {debugInfo?.charRectLocal
              ? `(${debugInfo.charRectLocal.x.toFixed(1)}, ${debugInfo.charRectLocal.y.toFixed(1)})`
              : 'データなし'}
          </div>
        </div>
        <div className="debug-info-row">
          <div className="debug-info-label">最終更新時間:</div>
          <div className="debug-info-value">{formatTime(debugInfo?.lastUpdated)}</div>
        </div>
      </div>
      
      <div className="debug-section">
        <h4>レンダリング情報</h4>
        {engine && (
          <>
            <div className="debug-info-row">
              <div className="debug-info-label">フレーズ数:</div>
              <div className="debug-info-value">{engine.phrases.length}</div>
            </div>
            <div className="debug-info-row">
              <div className="debug-info-label">描画解像度:</div>
              <div className="debug-info-value">
                {engine.app ? `${engine.app.renderer.width}x${engine.app.renderer.height}` : 'N/A'}
              </div>
            </div>
            {engine.app && (
              <div className="debug-info-row">
                <div className="debug-info-label">ステージ位置:</div>
                <div className="debug-info-value">
                  {`(${engine.app.stage.position.x}, ${engine.app.stage.position.y})`}
                </div>
              </div>
            )}
            {engine.instanceManager && (
              <div className="debug-info-row">
                <div className="debug-info-label">メインコンテナ位置:</div>
                <div className="debug-info-value">
                  {`(${engine.instanceManager.mainContainer.position.x}, ${engine.instanceManager.mainContainer.position.y})`}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="debug-section">
        <h4>タイミング情報</h4>
        <div className="debug-info-row">
          <div className="debug-info-label">現在時間:</div>
          <div className="debug-info-value">
            {timingDebugInfo?.currentTime !== undefined ? `${timingDebugInfo.currentTime.toFixed(2)}ms` : 'データなし'}
          </div>
        </div>
        
        {/* フレーズのタイミング情報 */}
        <div className="debug-subsection">
          <h5>表示対象フレーズ</h5>
          {timingDebugInfo?.activePhrase && timingDebugInfo.activePhrase.length > 0 ? (
            timingDebugInfo.activePhrase.map((phrase, index) => (
              <div key={`phrase-${index}`} className="debug-timing-item">
                <div className="debug-info-row">
                  <div className="debug-info-label">フレーズID:</div>
                  <div className="debug-info-value">{phrase.id || 'なし'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">表示タイミング:</div>
                  <div className="debug-info-value">
                    {phrase.inTime !== undefined && phrase.outTime !== undefined
                      ? `in: ${phrase.inTime}ms, out: ${phrase.outTime}ms`
                      : 'データなし'}
                  </div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">現在の状態:</div>
                  <div className="debug-info-value">{phrase.state || 'データなし'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">表示状態:</div>
                  <div className="debug-info-value">{phrase.isVisible ? 'ON' : 'OFF'}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="debug-info-row">データなし</div>
          )}
        </div>
        
        {/* 単語のタイミング情報 */}
        <div className="debug-subsection">
          <h5>表示対象単語</h5>
          {timingDebugInfo?.activeWord && timingDebugInfo.activeWord.length > 0 ? (
            timingDebugInfo.activeWord.map((word, index) => (
              <div key={`word-${index}`} className="debug-timing-item">
                <div className="debug-info-row">
                  <div className="debug-info-label">単語ID:</div>
                  <div className="debug-info-value">{word.id || 'なし'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">表示タイミング:</div>
                  <div className="debug-info-value">
                    {word.inTime !== undefined && word.outTime !== undefined
                      ? `in: ${word.inTime}ms, out: ${word.outTime}ms`
                      : 'データなし'}
                  </div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">現在の状態:</div>
                  <div className="debug-info-value">{word.state || 'データなし'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">表示状態:</div>
                  <div className="debug-info-value">{word.isVisible ? 'ON' : 'OFF'}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="debug-info-row">データなし</div>
          )}
        </div>
        
        {/* 文字のタイミング情報 */}
        <div className="debug-subsection">
          <h5>表示対象文字</h5>
          {timingDebugInfo?.activeChar && timingDebugInfo.activeChar.length > 0 ? (
            timingDebugInfo.activeChar.map((char, index) => (
              <div key={`char-${index}`} className="debug-timing-item">
                <div className="debug-info-row">
                  <div className="debug-info-label">文字ID:</div>
                  <div className="debug-info-value">{char.id || 'なし'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">文字:</div>
                  <div className="debug-info-value">{char.char || 'なし'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">表示タイミング:</div>
                  <div className="debug-info-value">
                    {char.inTime !== undefined && char.outTime !== undefined
                      ? `in: ${char.inTime}ms, out: ${char.outTime}ms`
                      : 'データなし'}
                  </div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">現在の状態:</div>
                  <div className="debug-info-value">{char.state || 'データなし'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">表示状態:</div>
                  <div className="debug-info-value">{char.isVisible ? 'ON' : 'OFF'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">形状タイプ:</div>
                  <div className="debug-info-value">
                    {char.shapeType ? `${char.shapeType}角形` : 'データなし'}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="debug-info-row">データなし</div>
          )}
        </div>
      </div>
      
      {/* 現在位置のフレーズ詳細情報 */}
      {(debugSettings?.enabled || engine?.isDebugEnabled()) && currentPhraseInfo && (
        <div className="debug-section">
          <h4>現在位置のフレーズ詳細情報</h4>
          
          {/* テンプレート情報 */}
          <div className="debug-subsection">
            <h5>使用中テンプレート</h5>
            <div className="debug-info-row">
              <div className="debug-info-label">テンプレート名:</div>
              <div className="debug-info-value">{currentPhraseInfo.templateName || 'なし'}</div>
            </div>
            <div className="debug-info-row">
              <div className="debug-info-label">テンプレートID:</div>
              <div className="debug-info-value">{currentPhraseInfo.templateId || 'なし'}</div>
            </div>
          </div>
          
          {/* コンテナ座標情報 */}
          <div className="debug-subsection">
            <h5>コンテナ座標情報</h5>
            {currentPhraseInfo.containers && (
              <>
                {currentPhraseInfo.containers.phrase && (
                  <>
                    <div className="debug-info-row">
                      <div className="debug-info-label">フレーズコンテナ (グローバル):</div>
                      <div className="debug-info-value" style={{color: '#ff5555', fontWeight: 'bold'}}>
                        ({currentPhraseInfo.containers.phrase.global.x.toFixed(1)}, {currentPhraseInfo.containers.phrase.global.y.toFixed(1)})
                      </div>
                    </div>
                    <div className="debug-info-row">
                      <div className="debug-info-label">フレーズコンテナ (ローカル):</div>
                      <div className="debug-info-value" style={{color: '#ff5555'}}>
                        ({currentPhraseInfo.containers.phrase.local.x.toFixed(1)}, {currentPhraseInfo.containers.phrase.local.y.toFixed(1)})
                      </div>
                    </div>
                  </>
                )}
                
                {currentPhraseInfo.containers.word && (
                  <>
                    <div className="debug-info-row">
                      <div className="debug-info-label">単語コンテナ (グローバル):</div>
                      <div className="debug-info-value" style={{color: '#5555ff', fontWeight: 'bold'}}>
                        ({currentPhraseInfo.containers.word.global.x.toFixed(1)}, {currentPhraseInfo.containers.word.global.y.toFixed(1)})
                      </div>
                    </div>
                    <div className="debug-info-row">
                      <div className="debug-info-label">単語コンテナ (ローカル):</div>
                      <div className="debug-info-value" style={{color: '#5555ff'}}>
                        ({currentPhraseInfo.containers.word.local.x.toFixed(1)}, {currentPhraseInfo.containers.word.local.y.toFixed(1)})
                      </div>
                    </div>
                  </>
                )}
                
                {currentPhraseInfo.containers.char && (
                  <>
                    <div className="debug-info-row">
                      <div className="debug-info-label">文字コンテナ (グローバル):</div>
                      <div className="debug-info-value" style={{color: '#55cc55', fontWeight: 'bold'}}>
                        ({currentPhraseInfo.containers.char.global.x.toFixed(1)}, {currentPhraseInfo.containers.char.global.y.toFixed(1)})
                      </div>
                    </div>
                    <div className="debug-info-row">
                      <div className="debug-info-label">文字コンテナ (ローカル):</div>
                      <div className="debug-info-value" style={{color: '#55cc55'}}>
                        ({currentPhraseInfo.containers.char.local.x.toFixed(1)}, {currentPhraseInfo.containers.char.local.y.toFixed(1)})
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          
          {/* パラメータ情報 */}
          <div className="debug-subsection">
            <h5>パラメータ情報</h5>
            {currentPhraseInfo.parameters && (
              <>
                <div className="debug-info-row">
                  <div className="debug-info-label">文字間隔 (letterSpacing):</div>
                  <div className="debug-info-value">{currentPhraseInfo.parameters.letterSpacing || 'デフォルト'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">フォントサイズ (fontSize):</div>
                  <div className="debug-info-value">{currentPhraseInfo.parameters.fontSize || 'デフォルト'}</div>
                </div>
                <div className="debug-info-row">
                  <div className="debug-info-label">その他のパラメータ:</div>
                  <div className="debug-info-value">
                    {Object.keys(currentPhraseInfo.parameters).filter(key => !['letterSpacing', 'fontSize'].includes(key)).length}個
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* 文字カウント情報 */}
          <div className="debug-subsection">
            <h5>文字カウント情報</h5>
            {currentPhraseInfo.charCounts && currentPhraseInfo.charCounts.length > 0 ? (
              <div className="debug-char-list">
                {currentPhraseInfo.charCounts.map((charInfo: any, index: number) => (
                  <div key={index} className="debug-char-item" style={{
                    marginBottom: '8px', 
                    padding: '8px', 
                    background: '#2a2a2a', 
                    border: '1px solid #444', 
                    borderRadius: '6px',
                    color: '#e0e0e0'
                  }}>
                    <div className="debug-info-row">
                      <div className="debug-info-label">文字:</div>
                      <div className="debug-info-value" style={{fontWeight: 'bold', color: '#fff'}}>"{charInfo.char}"</div>
                    </div>
                    <div className="debug-info-row">
                      <div className="debug-info-label">フレーズ内位置:</div>
                      <div className="debug-info-value">{charInfo.phraseIndex + 1}/{charInfo.totalInPhrase}</div>
                    </div>
                    <div className="debug-info-row">
                      <div className="debug-info-label">単語内位置:</div>
                      <div className="debug-info-value">{charInfo.wordIndex + 1}/{charInfo.totalInWord}</div>
                    </div>
                    <div className="debug-info-row">
                      <div className="debug-info-label">文字ID:</div>
                      <div className="debug-info-value" style={{fontSize: '0.8em', color: '#999'}}>{charInfo.id}</div>
                    </div>
                    {/* 文字コンテナの位置情報 */}
                    {charInfo.containerPosition && (
                      <>
                        <div className="debug-info-row">
                          <div className="debug-info-label">コンテナ (グローバル):</div>
                          <div className="debug-info-value" style={{color: '#55cc55', fontWeight: 'bold'}}>
                            ({charInfo.containerPosition.global.x.toFixed(1)}, {charInfo.containerPosition.global.y.toFixed(1)})
                          </div>
                        </div>
                        <div className="debug-info-row">
                          <div className="debug-info-label">コンテナ (ローカル):</div>
                          <div className="debug-info-value" style={{color: '#55cc55'}}>
                            ({charInfo.containerPosition.local.x.toFixed(1)}, {charInfo.containerPosition.local.y.toFixed(1)})
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="debug-info-row" style={{color: '#999', fontStyle: 'italic'}}>
                現在位置に表示中の文字がありません
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="debug-section">
        <h4>注意</h4>
        <p className="debug-note">
          プレビューエリアの中心とフレーズコンテナの座標情報は、
          テンプレートからの更新があったときのみ表示されます。
          ローカル座標とはコンテナ内の相対座標を、グローバル座標は画面上の絶対座標を表します。
          現在位置のフレーズ詳細情報は、デバッグ機能がONの時のみ表示されます。
        </p>
      </div>
    </div>
  );
};

export default DebugTab;