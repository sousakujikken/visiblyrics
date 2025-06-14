import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Engine } from '../../engine/Engine';
import { ProjectFileManager } from '../../services/ProjectFileManager';
import { unifiedFileManager } from '../../services/UnifiedFileManager';
import { DebugEventBus } from '../../utils/DebugEventBus';
import './SaveTab.css';

interface SaveTabProps {
  engine: Engine;
}

export const SaveTab: React.FC<SaveTabProps> = ({ engine }) => {
  const [lastSaved, setLastSaved] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const projectFileManager = useRef<ProjectFileManager>(new ProjectFileManager(engine));
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ステータス表示の更新
  const showStatus = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setStatus(message);
    setStatusType(type);
    
    // 3秒後にステータスをクリア
    setTimeout(() => {
      setStatus('');
    }, 3000);
  }, []);

  // プロジェクト保存（エレクトロン専用）
  const handleSave = useCallback(async () => {
    setIsLoading(true);
    try {
      const savedPath = await projectFileManager.current.saveProject('project');
      setLastSaved(new Date().toLocaleString('ja-JP'));
      showStatus(`プロジェクトを保存しました: ${savedPath}`, 'success');
    } catch (error) {
      console.error('Save error:', error);
      showStatus('保存に失敗しました', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showStatus]);

  // ファイル選択ダイアログを開く（エレクトロン専用）
  const handleOpen = useCallback(async () => {
    setIsLoading(true);
    try {
      await projectFileManager.current.loadProject();
      
      // プロジェクト名をファイル名から設定
      showStatus('プロジェクトを読み込みました', 'success');
    } catch (error) {
      console.error('Load error:', error);
      showStatus('読み込みに失敗しました', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showStatus]);

  // エレクトロン専用のため、ファイル選択は不要

  // エレクトロン専用のため、ドラッグ&ドロップは不要

  // 音楽ファイル要求イベントの処理
  useEffect(() => {
    const handleRequestAudioFile = (data: any) => {
      showStatus(`音楽ファイルを再選択してください: ${data.fileName}`, 'info');
    };
    
    DebugEventBus.on('request-audio-file', handleRequestAudioFile);
    
    return () => {
      DebugEventBus.off('request-audio-file', handleRequestAudioFile);
    };
  }, [showStatus]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+O or Cmd+O
      else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSave, handleOpen]);

  return (
    <div className="save-tab">
      {/* 上部操作ボタン */}
      <div className="top-actions">
        <button 
          className="save-button"
          onClick={handleSave} 
          disabled={isLoading}
        >
          保存 (Ctrl+S)
        </button>
        <button 
          className="load-button"
          onClick={handleOpen}
          disabled={isLoading}
        >
          読み込み (Ctrl+O)
        </button>
      </div>

      {/* プロジェクト情報 */}
      <div className="project-info">
        <h3>プロジェクト情報</h3>
        <div className="info-item">
          <span className="label">最終保存:</span>
          <span className="value">{lastSaved || '未保存'}</span>
        </div>
      </div>

      {/* ステータス */}
      <div className="status-section">
        {status && (
          <div className={`status ${statusType}`}>
            {status}
          </div>
        )}
        {isLoading && (
          <div className="loading">
            処理中...
          </div>
        )}
      </div>
    </div>
  );
};