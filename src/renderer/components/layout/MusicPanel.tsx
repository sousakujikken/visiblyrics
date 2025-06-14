import React, { useState, useEffect } from 'react';
import Engine from '../../engine/Engine';
import { electronMediaManager } from '../../services/ElectronMediaManager';
import { logger } from '../../../utils/logger';
import '../../styles/components.css';

interface MusicPanelProps {
  engine?: Engine;
}

const MusicPanel: React.FC<MusicPanelProps> = ({ engine }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<Array<{fileName: string, filePath: string, timestamp: number}>>([]);

  // 音楽ファイル復元イベントのリスナー
  useEffect(() => {
    const log = logger.module('MusicPanel');
    log.debug('音楽ファイル復元イベントリスナーを設定');
    
    const handleAudioRestore = async (event: CustomEvent) => {
      const { fileName: originalFileName } = event.detail;
      log.debug(`===== 音楽ファイル復元要求を受信 =====`);
      log.debug(`originalFileName: ${originalFileName}`);
      log.debug(`engine: ${engine ? '存在' : 'なし'}`);
      log.debug(`electronMediaManager.restoreAudioFile: ${electronMediaManager.restoreAudioFile ? '存在' : 'なし'}`);
      
      try {
        // 同じ名前のファイルを自動で読み込み試行
        // ElectronMediaManagerにファイル復元機能があるかチェック
        if (electronMediaManager.restoreAudioFile) {
          log.debug(`音楽ファイル復元処理開始: ${originalFileName}`);
          const result = await electronMediaManager.restoreAudioFile(originalFileName);
          if (result && engine) {
            const { audio, fileName } = result;
            log.info(`音楽ファイル復元成功、エンジンに設定: ${fileName} (元: ${originalFileName})`);
            engine.loadAudioElement(audio, fileName);
            setFileName(fileName);
            log.debug(`音楽ファイル復元完了: ${fileName}`);
          } else {
            log.warn(`音楽ファイル復元失敗 - result: ${result ? '存在' : 'なし'}, engine: ${engine ? '存在' : 'なし'}`);
          }
        } else {
          log.warn(`音楽ファイル復元機能が利用できません: ${originalFileName}`);
        }
      } catch (error) {
        log.error(`音楽ファイル復元エラー:`, error);
        setError(`音楽ファイル復元に失敗: ${originalFileName}`);
      }
    };

    window.addEventListener('visiblyrics:restore-audio-file', handleAudioRestore as EventListener);
    
    return () => {
      log.debug('音楽ファイル復元イベントリスナーを削除');
      window.removeEventListener('visiblyrics:restore-audio-file', handleAudioRestore as EventListener);
    };
  }, [engine]);

  // 最近使用したファイルを読み込み（コンポーネント表示時とengine変更時）
  useEffect(() => {
    const log = logger.module('MusicPanel');
    log.debug('useEffect for loading recent files triggered, engine:', engine ? 'exists' : 'null');
    const loadRecentFiles = async () => {
      try {
        log.debug('useEffect - Calling getRecentFiles for audio');
        const files = await electronMediaManager.getRecentFiles('audio');
        log.debug('useEffect - Received recent files:', files);
        log.debug('useEffect - Current recentFiles state before setState:', recentFiles);
        setRecentFiles(files);
        log.debug('useEffect - setRecentFiles completed');
      } catch (error) {
        log.error('useEffect - Failed to load recent audio files:', error);
      }
    };
    
    loadRecentFiles();
  }, [engine]); // engineが変更されるたびに実行

  // recentFiles状態の変化を監視
  useEffect(() => {
    const log = logger.module('MusicPanel');
    log.debug('recentFiles state changed:', recentFiles);
    log.debug('recentFiles length:', recentFiles.length);
    log.debug('recentFiles array:', [...recentFiles]);
  }, [recentFiles]);

  // エレクトロン専用のため、ドラッグ&ドロップは不要

  return (
    <div className="panel-content">
      <h3>音楽データ</h3>
      
      <div className="electron-music-selector">
        <button
          onClick={async () => {
            const clickTimestamp = Date.now();
            const log = logger.module('MusicPanel');
            log.debug(`[${clickTimestamp}] ===== 音楽ファイル選択開始 =====`);
            
            try {
              // 新しい音楽ファイルを読み込み
              log.debug(`[${clickTimestamp}] 音楽ファイルを読み込みます`);
              const result = await electronMediaManager.loadBackgroundAudio();
              
              if (result && engine) {
                const { audio, fileName } = result;
                log.info(`[${clickTimestamp}] Engineに音楽データを登録します - ファイル名: ${fileName}`);
                
                // AudioElementから情報を取得してEngineに渡す
                engine.loadAudioElement(audio, fileName);
                setFileName(fileName);
                
                log.debug(`[${clickTimestamp}] Engine登録完了`);
                
                // 最近使用したファイルリストを更新（少し遅延を入れて確実に取得）
                log.debug(`[${clickTimestamp}] ファイル選択後、最近使用したファイルリストを更新中...`);
                setTimeout(async () => {
                  try {
                    log.debug(`[${clickTimestamp}] getRecentFiles('audio')を呼び出し中...`);
                    const updatedFiles = await electronMediaManager.getRecentFiles('audio');
                    log.debug(`[${clickTimestamp}] getRecentFiles結果:`, updatedFiles);
                    log.debug(`[${clickTimestamp}] setRecentFiles実行前 - 現在のrecentFiles:`, recentFiles);
                    setRecentFiles(updatedFiles);
                    log.debug(`[${clickTimestamp}] setRecentFiles実行完了`);
                  } catch (error) {
                    log.error(`[${clickTimestamp}] getRecentFilesでエラー:`, error);
                  }
                }, 100);
                
                // 音楽読み込み完了イベントを発火
                setTimeout(() => {
                  log.debug(`[${clickTimestamp}] 音楽読み込み完了イベントを発火`);
                  const actualFileURL = electronMediaManager.getCurrentAudioFileURL();
                  const audioLoadEvent = new CustomEvent('music-file-loaded', {
                    detail: { 
                      url: actualFileURL || 'electron://loaded',
                      fileName,
                      timestamp: clickTimestamp
                    }
                  });
                  window.dispatchEvent(audioLoadEvent);
                  log.debug(`[${clickTimestamp}] ===== 音楽ファイル読み込み完了 =====`);
                }, 50);
              }
            } catch (error) {
              log.error(`[${clickTimestamp}] 読み込みエラー:`, error);
              setError('音楽ファイルの読み込みに失敗しました');
            }
          }}
          className="file-select-button"
          style={{
            padding: '10px 20px',
            marginBottom: '10px',
            backgroundColor: '#09f',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          音楽ファイルを選択
        </button>
        
        <div style={{ marginTop: '10px' }}>
          <label htmlFor="recent-audio-select" style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>最近使用したファイル:</label>
          <select
            id="recent-audio-select"
            disabled={recentFiles.length === 0}
            onChange={async (e) => {
                if (!e.target.value) return;
                
                const clickTimestamp = Date.now();
                const log = logger.module('MusicPanel');
                log.debug(`[${clickTimestamp}] 最近使用したファイルを選択:`, e.target.value);
                
                try {
                  const result = await electronMediaManager.loadRecentAudioFile(e.target.value);
                  
                  if (result && engine) {
                    const { audio, fileName } = result;
                    log.info(`[${clickTimestamp}] 最近使用したファイルをEngineに登録: ${fileName}`);
                    
                    engine.loadAudioElement(audio, fileName);
                    setFileName(fileName);
                    
                    // 最近使用したファイルリストを更新
                    setTimeout(async () => {
                      try {
                        log.debug(`[${clickTimestamp}] 最近使用したファイル選択後、リスト更新中...`);
                        const updatedFiles = await electronMediaManager.getRecentFiles('audio');
                        log.debug(`[${clickTimestamp}] 最近使用したファイル選択後のgetRecentFiles結果:`, updatedFiles);
                        setRecentFiles(updatedFiles);
                        log.debug(`[${clickTimestamp}] 最近使用したファイル選択後のsetRecentFiles完了`);
                      } catch (error) {
                        log.error(`[${clickTimestamp}] 最近使用したファイル選択後のgetRecentFilesでエラー:`, error);
                      }
                    }, 100);
                    
                    // 音楽読み込み完了イベントを発火
                    setTimeout(() => {
                      const actualFileURL = electronMediaManager.getCurrentAudioFileURL();
                      const audioLoadEvent = new CustomEvent('music-file-loaded', {
                        detail: { 
                          url: actualFileURL || 'electron://loaded',
                          fileName,
                          timestamp: clickTimestamp
                        }
                      });
                      window.dispatchEvent(audioLoadEvent);
                      log.debug(`[${clickTimestamp}] 最近使用したファイル読み込み完了`);
                    }, 50);
                  }
                } catch (error) {
                  log.error(`[${clickTimestamp}] 最近使用したファイル読み込みエラー:`, error);
                  setError('最近使用したファイルの読み込みに失敗しました');
                }
                
                // セレクトボックスをリセット
                e.target.value = '';
              }}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: recentFiles.length === 0 ? '#f5f5f5' : '#fff',
                color: recentFiles.length === 0 ? '#999' : '#000',
                cursor: recentFiles.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="">{recentFiles.length === 0 ? 'Empty - ファイルが選択されていません' : 'ファイルを選択してください'}</option>
              {recentFiles.map((file, index) => (
                <option key={index} value={file.filePath}>
                  {file.fileName}
                </option>
              ))}
            </select>
          </div>
        
        {fileName && (
          <p className="file-info">読み込み済み: {fileName}</p>
        )}
      </div>
      
      {error && (
        <div style={{ color: '#ff6b6b', marginTop: '10px' }}>
          エラー: {error}
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <h4>使用方法</h4>
        <p>
          MP3、WAV、OGG形式の音楽ファイルをドロップするか、ボタンをクリックして選択してください。
        </p>
        <p>
          歌詞データと時間を合わせることで、音楽に同期したアニメーションを実現できます。
        </p>
      </div>
    </div>
  );
};

export default MusicPanel;