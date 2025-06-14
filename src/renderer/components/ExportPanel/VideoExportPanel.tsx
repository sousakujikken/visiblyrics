import React, { useState, useEffect } from 'react';

import { Engine } from '../../engine/Engine';
import { ASPECT_RATIO_RESOLUTIONS, ResolutionManager } from '../../export/video/ResolutionManager';
import { ModernVideoExportOptions } from '../../export/video/VideoExporter';
// import { BatchVideoExportOptions } from '../../export/video/BatchVideoExporter'; // 未実装のため一時的にコメントアウト
import { VideoOutputQuality } from '../../export/video/VideoEncoder';
import { VideoQuality, CustomResolution } from '../../types/types';
import './VideoExportPanel.css';

interface VideoExportPanelProps {
  engine: Engine;
  onClose?: () => void;
}

const VideoExportPanel: React.FC<VideoExportPanelProps> = ({ engine, onClose }) => {
  // エンジンからアスペクト比設定を取得
  const stageConfig = engine.getStageConfig();
  
  // ResolutionManagerのインスタンス
  const resolutionManager = new ResolutionManager();
  
  // モダンな状態管理
  const [quality, setQuality] = useState<VideoQuality>('MEDIUM');
  const [customResolution, setCustomResolution] = useState<CustomResolution>({ width: 1920, height: 1080 });
  const [videoQuality, setVideoQuality] = useState<VideoOutputQuality>('medium');
  
  // 共通状態
  const [fps, setFps] = useState<30 | 60>(30);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60000);
  // const [filename, setFilename] = useState('animation_export.mp4'); // 廃止：システムダイアログで設定
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [batchProgress, setBatchProgress] = useState<number | undefined>();
  const [memoryUsage, setMemoryUsage] = useState<number | undefined>();
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeDebugVisuals, setIncludeDebugVisuals] = useState(false);
  // const [useBatchProcessing, setUseBatchProcessing] = useState(false);
  // const [batchSize, setBatchSize] = useState(100);
  // const [maxConcurrency, setMaxConcurrency] = useState(2);

  // 楽曲の長さをエンジンから取得し、推奨設定を計算
  useEffect(() => {
    if (engine) {
      const duration = engine.getMaxTime();
      setEndTime(duration);
      
      // 推奨バッチ設定を計算
      const options: ModernVideoExportOptions = {
        aspectRatio: stageConfig.aspectRatio,
        orientation: stageConfig.orientation,
        quality,
        customResolution: quality === 'CUSTOM' ? customResolution : undefined,
        videoQuality,
        fps,
        fileName: 'animation_export.mp4', // 一時的なファイル名（実際の出力では使用されない）
        startTime,
        endTime: duration,
        includeDebugVisuals
      };
      
      // 推奨出力方法を取得（現在は常にseek-and-snap）
      // const recommendedMethod = engine.videoExporter.getRecommendedExportMethod(options);
      // setUseBatchProcessing(recommendedMethod === 'batch');
      
      // 推奨バッチサイズを取得
      // const memoryEstimate = engine.videoExporter.getMemoryEstimate(options);
      // setBatchSize(memoryEstimate.recommendedBatchSize);
    }
  }, [engine, quality, customResolution, fps, startTime, endTime]);

  // アスペクト比に対応する解像度オプションを取得
  const getAvailableResolutions = () => {
    const resolutions = ASPECT_RATIO_RESOLUTIONS[stageConfig.aspectRatio][stageConfig.orientation];
    return Object.entries(resolutions)
      .filter(([key]) => key !== 'CUSTOM')
      .map(([key, value]) => ({
        key: key as VideoQuality,
        label: value.label,
        ...value
      }));
  };

  // 現在の設定での解像度を取得
  const getCurrentResolution = () => {
    if (quality === 'CUSTOM') {
      return customResolution;
    }
    return ASPECT_RATIO_RESOLUTIONS[stageConfig.aspectRatio][stageConfig.orientation][quality];
  };

  // デバッグ用の3秒動画出力ハンドラ
  const handleExportDebug3Seconds = async () => {
    setIsExporting(true);
    setProgress(0);
    setExportError(null);

    try {
      const options: ModernVideoExportOptions = {
        aspectRatio: stageConfig.aspectRatio,
        orientation: stageConfig.orientation,
        quality,
        customResolution: quality === 'CUSTOM' ? customResolution : undefined,
        videoQuality,
        fps,
        fileName: 'debug_3sec_animation_export.mp4',
        startTime: startTime,
        endTime: startTime + 3000,
        includeDebugVisuals: true
      };
      
      const outputPath = await engine.videoExporter.startDirectExport(
        options,
        (p) => setProgress(p)
      );
    } catch (error) {
      console.error('3秒デバッグ出力失敗:', error);
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  };

  // デバッグ用の15秒動画出力ハンドラ（バッチ間ジャンプ確認用）
  const handleExportDebug15Seconds = async () => {
    setIsExporting(true);
    setProgress(0);
    setExportError(null);

    try {
      const options: ModernVideoExportOptions = {
        aspectRatio: stageConfig.aspectRatio,
        orientation: stageConfig.orientation,
        quality,
        customResolution: quality === 'CUSTOM' ? customResolution : undefined,
        videoQuality,
        fps,
        fileName: 'debug_15sec_batch_test_animation_export.mp4',
        startTime: startTime,
        endTime: startTime + 15000, // 15秒
        includeDebugVisuals: true
      };
      
      
      const outputPath = await engine.videoExporter.startDirectExport(
        options,
        (p) => setProgress(p)
      );
    } catch (error) {
      console.error('15秒バッチテスト出力失敗:', error);
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  };

  // 実際のエクスポート処理
  const handleExport = async () => {
    // まず保存先を選択させる
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) {
      setExportError('Electron APIが利用できません');
      return;
    }

    try {
      const defaultFileName = `animation_export_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
      const filePath = await electronAPI.showSaveDialogForVideo(defaultFileName);
      
      if (!filePath) {
        // ユーザーがキャンセルした
        return;
      }

      setIsExporting(true);
      setProgress(0);
      setBatchProgress(undefined);
      setMemoryUsage(undefined);
      setExportError(null);

      // ファイルパスからファイル名だけを抽出
      const fileName = filePath.split(/[/\\]/).pop() || 'animation_export.mp4';
      
      // 常にダイレクト出力を使用（バッチ処理は未実装）
      const options: ModernVideoExportOptions = {
        aspectRatio: stageConfig.aspectRatio,
        orientation: stageConfig.orientation,
        quality,
        customResolution: quality === 'CUSTOM' ? customResolution : undefined,
        videoQuality,
        fps,
        fileName: fileName,
        startTime,
        endTime,
        includeDebugVisuals,
        outputPath: filePath // フルパスを追加
      };
      
      const outputPath = await engine.videoExporter.startDirectExport(
        options,
        (p) => setProgress(p)
      );
    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  };

  // エクスポートのキャンセル処理
  const handleCancelExport = async () => {
    if (isExporting) {
      await engine.videoExporter.cancelExport();
      setIsExporting(false);
    }
  };

  // 時間を人間が読める形式に変換 (ミリ秒 → MM:SS.mmm)
  const formatTime = (ms: number): string => {
    const totalSec = ms / 1000;
    const minutes = Math.floor(totalSec / 60);
    const seconds = Math.floor(totalSec % 60);
    const millis = Math.floor((totalSec % 1) * 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  };

  // 人間が読める形式から時間に変換 (MM:SS.mmm → ミリ秒)
  const parseTime = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    
    const secParts = parts[1].split('.');
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(secParts[0], 10) || 0;
    const millis = parseInt(secParts[1], 10) || 0;
    
    return (minutes * 60 * 1000) + (seconds * 1000) + millis;
  };

  // 予測ファイルサイズの計算
  const calculateEstimatedFileSize = (): string => {
    const currentRes = getCurrentResolution();
    const pixels = currentRes.width * currentRes.height;
    
    // 720p (1280x720 = 921,600 pixels) 30fps で 1秒あたり約 5MB を基準
    const basePixels = 1280 * 720;
    const baseSize = 5; // MB per second
    
    const pixelMultiplier = pixels / basePixels;
    const fpsMultiplier = fps / 30;
    const durationSec = (endTime - startTime) / 1000;
    
    const estimatedSize = baseSize * pixelMultiplier * fpsMultiplier * durationSec;
    
    if (estimatedSize < 1000) {
      return `${Math.round(estimatedSize * 10) / 10} MB`;
    } else {
      return `${Math.round(estimatedSize / 100) / 10} GB`;
    }
  };

  // カスタム解像度のバリデーション
  const validateCustomResolution = (width: number, height: number): string | null => {
    return resolutionManager.validateCustomResolutionSafe(width, height);
  };

  return (
    <div className="video-export-panel">
      <div className="export-panel-header">
        <h2>動画エクスポート</h2>
        {onClose && <button className="close-button" onClick={onClose}>×</button>}
      </div>

      <div className="export-settings">
        <div className="export-setting-group">
          <h3>動画設定</h3>
          <div className="current-aspect-ratio">
            <label>現在のアスペクト比: <strong>{stageConfig.aspectRatio} {stageConfig.orientation === 'portrait' ? '縦' : '横'}</strong></label>
          </div>
        </div>

        <div className="export-setting-group">
          <h3>解像度</h3>
          <div className="resolution-options">
            {getAvailableResolutions().map((res) => (
              <label key={res.key}>
                <input
                  type="radio"
                  name="quality"
                  value={res.key}
                  checked={quality === res.key}
                  onChange={() => setQuality(res.key)}
                  disabled={isExporting}
                />
                {res.label}
              </label>
            ))}
            <label>
              <input
                type="radio"
                name="quality"
                value="CUSTOM"
                checked={quality === 'CUSTOM'}
                onChange={() => setQuality('CUSTOM')}
                disabled={isExporting}
              />
              カスタム
            </label>
          </div>
          
          {quality === 'CUSTOM' && (
            <div className="custom-resolution">
              <div className="input-group">
                <label>幅:</label>
                <input
                  type="number"
                  value={customResolution.width}
                  onChange={(e) => setCustomResolution(prev => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                  min="320"
                  max="7680"
                  step="2"
                  disabled={isExporting}
                />
              </div>
              <div className="input-group">
                <label>高さ:</label>
                <input
                  type="number"
                  value={customResolution.height}
                  onChange={(e) => setCustomResolution(prev => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                  min="240"
                  max="4320"
                  step="2"
                  disabled={isExporting}
                />
              </div>
              {quality === 'CUSTOM' && validateCustomResolution(customResolution.width, customResolution.height) && (
                <div className="validation-error">
                  {validateCustomResolution(customResolution.width, customResolution.height)}
                </div>
              )}
            </div>
          )}
          
          <div className="current-resolution-display">
            <label>出力解像度: <strong>{getCurrentResolution().width}×{getCurrentResolution().height}</strong></label>
          </div>
        </div>

        <div className="export-setting-group">
          <h3>品質設定</h3>
          <div className="input-group">
            <label>動画品質:</label>
            <select
              value={videoQuality}
              onChange={(e) => setVideoQuality(e.target.value as VideoOutputQuality)}
              disabled={isExporting}
            >
              <option value="low">低画質 (高圧縮)</option>
              <option value="medium">標準画質</option>
              <option value="high">高画質</option>
              <option value="highest">最高画質 (低圧縮)</option>
            </select>
          </div>
          
          <div className="input-group">
            <label>フレームレート:</label>
            <select
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value, 10) as 30 | 60)}
              disabled={isExporting}
            >
              <option value="30">30 fps</option>
              <option value="60">60 fps</option>
            </select>
          </div>

          <div className="input-group checkbox">
            <input
              type="checkbox"
              id="debug-visuals"
              checked={includeDebugVisuals}
              onChange={(e) => setIncludeDebugVisuals(e.target.checked)}
              disabled={isExporting}
            />
            <label htmlFor="debug-visuals">デバッグ表示を含める</label>
          </div>
          
        </div>

        <div className="export-setting-group">
          <h3>出力範囲</h3>
          <div className="input-group">
            <label>開始時間:</label>
            <input
              type="text"
              value={formatTime(startTime)}
              onChange={(e) => setStartTime(parseTime(e.target.value))}
              placeholder="00:00.000"
              disabled={isExporting}
            />
          </div>

          <div className="input-group">
            <label>終了時間:</label>
            <input
              type="text"
              value={formatTime(endTime)}
              onChange={(e) => setEndTime(parseTime(e.target.value))}
              placeholder="00:00.000"
              disabled={isExporting}
            />
          </div>

          <div className="input-group">
            <label>出力時間: {formatTime(endTime - startTime)}</label>
          </div>
        </div>

        <div className="export-setting-group">
          <h3>出力設定</h3>
          <div className="input-group">
            <label>推定ファイルサイズ: {calculateEstimatedFileSize()}</label>
          </div>
        </div>
      </div>

      {isExporting && (
        <div className="export-progress">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress * 100}%` }}
            ></div>
          </div>
          <div className="progress-text">{Math.floor(progress * 100)}%</div>
        </div>
      )}

      {exportError && (
        <div className="export-error">
          エラー: {exportError}
        </div>
      )}

      <div className="export-actions">
        {isExporting ? (
          <button
            className="cancel-button"
            onClick={handleCancelExport}
          >
            エクスポートを中止
          </button>
        ) : (
          <>
            <button
              className="cancel-button"
              onClick={onClose}
            >
              キャンセル
            </button>
            {/* デバッグ用テストボタン（非表示化） */}
          </>
        )}
        <button
          className="export-button"
          onClick={handleExport}
          disabled={isExporting || (quality === 'CUSTOM' && validateCustomResolution(customResolution.width, customResolution.height) !== null)}
        >
          {isExporting ? 'エクスポート中...' : 'エクスポート開始'}
        </button>
      </div>
    </div>
  );
};

export default VideoExportPanel;