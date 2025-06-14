/**
 * デバッグ機能のための型定義
 */

// アニメーションのフェーズ（in/active/outは既存のものと同じ）
export type AnimationPhase = 'in' | 'active' | 'out';

// 階層タイプ（phrase/word/charは既存のものと同じ）
export type HierarchyType = 'phrase' | 'word' | 'char';

// デバッグ情報の型
export interface DebugInfo {
  // プレビューエリアの中心座標
  previewCenter?: { x: number, y: number };
  
  // フレーズコンテナ関連
  phrasePosition?: { x: number, y: number };
  redRectGlobal?: { x: number, y: number };
  redRectLocal?: { x: number, y: number };
  
  // 単語コンテナ関連
  wordRectGlobal?: { x: number, y: number };
  wordRectLocal?: { x: number, y: number };
  wordId?: string;
  wordText?: string;
  
  // 文字コンテナ関連
  charRectGlobal?: { x: number, y: number };
  charRectLocal?: { x: number, y: number };
  charId?: string;
  charText?: string;
  
  // 更新情報
  lastUpdated?: number;
}

// タイミング診断用デバッグ情報
export interface TimingDebugInfo {
  currentTime?: number;
  activePhrase?: {
    id?: string;
    inTime?: number;
    outTime?: number;
    isVisible?: boolean;
    state?: string; // イン前、イン、発声中、アウト、アウト後
  }[];
  activeWord?: {
    id?: string;
    inTime?: number;
    outTime?: number;
    isVisible?: boolean;
    state?: string; // イン前、イン、発声中、アウト、アウト後
  }[];
  activeChar?: {
    id?: string;
    char?: string;
    inTime?: number;
    outTime?: number;
    isVisible?: boolean;
    state?: string; // イン前、イン、発声中、アウト、アウト後
    shapeType?: number; // 形状タイプ（3～5）
  }[];
}

// デバッグマネージャーの設定
export interface DebugSettings {
  // デバッグ機能の有効/無効
  enabled: boolean;
  
  // 階層構造の可視化
  showHierarchy: boolean;
  
  // コンテナ境界の表示
  showContainerBounds: boolean;
  
  // 座標情報の表示
  showCoordinates: boolean;
  
  // タイミング情報の表示
  showTimingInfo: boolean;
  
  // コンソールへのデバッグ出力
  logToConsole: boolean;
  
  // デバッグイベントの発行
  dispatchEvents: boolean;
  
  // 方眼目盛りの表示
  showGrid: boolean;
}

// デバッグイベントの種類
export enum DebugEventType {
  COORDINATE_UPDATED = 'debug-coordinate-updated',
  TIMING_UPDATED = 'debug-timing-updated',
  HIERARCHY_UPDATED = 'debug-hierarchy-updated',
  SETTINGS_UPDATED = 'debug-settings-updated',
  ALL_INFO_UPDATED = 'debug-info-updated'
}
