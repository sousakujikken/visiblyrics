import React, { useState, useEffect } from 'react';
import PreviewArea from './layout/PreviewArea';
import TemplateTab from './layout/TemplateTab';
import PlayerPanel from './layout/PlayerPanel';
import TimelinePanel from './layout/TimelinePanel';
import LyricsPanel from './layout/LyricsPanel';
import MusicPanel from './layout/MusicPanel';
import VideoExportPanel from './ExportPanel/VideoExportPanel';
import DebugTab from './layout/DebugTab';
import BackgroundTab from './layout/BackgroundTab';
import { SaveTab } from './layout/SaveTab';
import ZoomControls from './layout/ZoomControls';
import SidebarTabs from './ui/SidebarTabs';
import Engine from '../engine/Engine';
import { IAnimationTemplate } from '../types/types';
import '../styles/NewLayout.css';
import '../styles/components.css';

// ズームレベルの定義（表示時間）
const ZOOM_LEVELS = [10000, 30000, 60000, 120000]; // 10秒, 30秒, 60秒, 120秒

interface NewLayoutProps {
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (value: number) => void;
  onTemplateChange: (template: string) => void;
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  selectedTemplate: string;
  engine?: Engine; // Engineインスタンスを受け取るためのプロパティを追加
  template?: IAnimationTemplate; // 現在のテンプレート
  debugInfo?: {
    previewCenter?: { x: number, y: number };
    phrasePosition?: { x: number, y: number };
    redRectGlobal?: { x: number, y: number };
    redRectLocal?: { x: number, y: number };
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
  };
}

const NewLayout: React.FC<NewLayoutProps> = ({
  onPlay,
  onPause,
  onReset,
  onSeek,
  onTemplateChange,
  isPlaying,
  currentTime,
  totalDuration,
  selectedTemplate,
  engine, // propsからengineを受け取る
  template, // propsからtemplateを受け取る
  debugInfo,
  timingDebugInfo
}) => {
  // ズーム関連の状態
  const [zoomLevel, setZoomLevel] = useState(2); // 初期値を60秒表示に設定
  const [viewStart, setViewStart] = useState(0); // 表示開始時間
  
  // 現在のズームレベルでの表示範囲、ただしdurationを超えない
  const viewDuration = Math.min(ZOOM_LEVELS[zoomLevel], totalDuration);
  const viewEnd = Math.min(viewStart + viewDuration, totalDuration);
  
  // エンジンの有無をログ出力（デバッグ用）
  React.useEffect(() => {
    if (engine) {
      console.log('NewLayout: Engineインスタンスを受け取りました');
    } else {
      console.warn('NewLayout: Engineインスタンスがありません');
    }
  }, [engine]);
  
  // 歌詞データの長さに応じて最適なズームレベルを選択（現在は使用しない）
  const getOptimalZoomLevel = (duration: number): number => {
    // 30秒未満の場合は10秒表示
    if (duration <= 30000) return 0;
    // 60秒未満の場合は30秒表示
    if (duration <= 60000) return 1;
    // 120秒未満の場合は60秒表示
    if (duration <= 120000) return 2;
    // それ以上は120秒表示
    return 3;
  };
  
  // totalDurationが変更されたときにズームレベルを調整（コメントアウト：常に60秒で起動）
  // useEffect(() => {
  //   const optimalZoomLevel = getOptimalZoomLevel(totalDuration);
  //   setZoomLevel(optimalZoomLevel);
  // }, [totalDuration]);
  
  // ズームイン・アウトハンドラ
  const handleZoomIn = () => {
    if (zoomLevel > 0) {
      const newZoomLevel = zoomLevel - 1;
      setZoomLevel(newZoomLevel);
      
      // 現在時間が中心に来るように調整
      const newViewDuration = Math.min(ZOOM_LEVELS[newZoomLevel], totalDuration);
      const newViewStart = Math.max(0, Math.min(
        currentTime - newViewDuration / 2,
        totalDuration - newViewDuration
      ));
      setViewStart(newViewStart);
    }
  };
  
  const handleZoomOut = () => {
    if (zoomLevel < ZOOM_LEVELS.length - 1) {
      const newZoomLevel = zoomLevel + 1;
      const newViewDuration = Math.min(ZOOM_LEVELS[newZoomLevel], totalDuration);
      
      // 最大時間でもデータの長さを超えない場合はズームアウトしない
      if (newViewDuration > viewDuration) {
        setZoomLevel(newZoomLevel);
        
        // 現在時間が中心に来るように調整
        const newViewStart = Math.max(0, Math.min(
          currentTime - newViewDuration / 2,
          totalDuration - newViewDuration
        ));
        setViewStart(newViewStart);
      }
    }
  };
  
  // 現在時間に合わせて表示範囲を調整
  useEffect(() => {
    // 現在時間が表示範囲外の場合、表示範囲をシフト
    if (currentTime < viewStart || currentTime > viewEnd) {
      const newViewStart = Math.max(0, Math.min(
        currentTime - viewDuration / 4, // 左端から1/4の位置に現在時間を配置
        totalDuration - viewDuration
      ));
      setViewStart(newViewStart);
    }
  }, [currentTime, viewStart, viewEnd, viewDuration, totalDuration]);

  return (
    <div className="new-layout-container">
      <header className="app-header">
        {/* バージョン情報を一時的に非表示 */}
      </header>
      
      <main className="app-content">
        {/* 上段エリア */}
        <section className="top-area">
          <div className="preview-area">
            <PreviewArea engine={engine} />
          </div>
          <div className="sidepanel-area">
            {/* タブ切り替え実装：背景・保存タブ追加 */}
            <SidebarTabs labels={['テンプレート', '歌詞', '音楽', '背景', '保存', '動画出力', 'デバッグ']}>
              {[
                <TemplateTab
                  key="template-tab"
                  selectedTemplate={selectedTemplate}
                  onTemplateChange={onTemplateChange}
                  engine={engine}
                  template={template}
                />,
                <LyricsPanel key="lyrics-panel" engine={engine} />,
                <MusicPanel key="music-panel" engine={engine} />,
                <BackgroundTab key="background-tab" engine={engine} />,
                <SaveTab key="save-tab" engine={engine!} />,
                <VideoExportPanel key="video-export-panel" engine={engine} onClose={() => {}} />,
                <DebugTab key="debug-tab" engine={engine} debugInfo={debugInfo} timingDebugInfo={timingDebugInfo} />
              ]}
            </SidebarTabs>
          </div>
        </section>
        
        {/* 下段エリア */}
        <section className="bottom-area">
          <div className="player-area" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <PlayerPanel
                isPlaying={isPlaying}
                currentTime={currentTime}
                totalDuration={totalDuration}
                onPlay={onPlay}
                onPause={onPause}
                onReset={onReset}
                onSeek={onSeek}
              />
            </div>
            <ZoomControls
              zoomLevel={zoomLevel}
              viewStart={viewStart}
              viewEnd={viewEnd}
              totalDuration={totalDuration}
              maxZoomLevel={ZOOM_LEVELS.length - 1}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              zoomLevels={ZOOM_LEVELS}
              engine={engine} // Undo/Redo機能のためにEngineインスタンスを渡す
            />
          </div>
          {/* 3段のタイムラインパネル */}
          <div className="timeline-area">
            <TimelinePanel
              currentTime={currentTime}
              totalDuration={totalDuration}
              engine={engine} // Engineインスタンスを渡す
              template={template} // テンプレートを渡す
              viewStart={viewStart}
              viewDuration={viewDuration}
              zoomLevel={zoomLevel}
            />
          </div>
        </section>
      </main>
      
      <footer className="app-footer">
        {/* 時刻表示を一時的に非表示 */}
      </footer>
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

export default NewLayout;