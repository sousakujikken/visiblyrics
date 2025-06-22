import { PhraseUnit, StageConfig, BackgroundConfig } from '../types/types';

// プロジェクト状態の型定義
export interface ProjectState {
  id: string;
  timestamp: number;
  label?: string;
  templateAssignments: Record<string, string>;
  globalParams: Record<string, any>;
  objectParams: Record<string, Record<string, any>>;
  defaultTemplateId: string;
  lyricsData?: PhraseUnit[]; // 歌詞タイミング情報を含める
  currentTime?: number; // 現在の再生時間も保存
  backgroundConfig?: BackgroundConfig; // 背景設定
  stageConfig?: StageConfig; // ステージ設定
  // 音楽ファイル情報
  audioFileName?: string;
  audioFileDuration?: number;
  // アクティベーション情報
  activatedObjects?: string[]; // 明示的にアクティブ化されたオブジェクトID
}

export class ProjectStateManager {
  // 現在の状態
  private currentState: ProjectState;
  
  // 状態履歴
  private stateHistory: ProjectState[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 20;
  
  constructor(initialState: ProjectState) {
    this.currentState = { ...initialState };
  }
  
  // 現在の状態を保存
  saveCurrentState(label?: string): void {
    const state: ProjectState = {
      ...this.currentState,
      id: `state_${Date.now()}`,
      timestamp: Date.now(),
      label
    };
    
    // 履歴を保存
    if (this.historyIndex < this.stateHistory.length - 1) {
      // 現在位置が最新でない場合、以降の履歴を破棄
      this.stateHistory = this.stateHistory.slice(0, this.historyIndex + 1);
    }
    
    this.stateHistory.push(state);
    this.historyIndex = this.stateHistory.length - 1;
    
    // 最大履歴サイズを超えた場合、古い履歴を削除
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
      this.historyIndex--;
    }
  }
  
  // 特定ポイントへのロールバック
  rollbackTo(index: number): boolean {
    if (index < 0 || index >= this.stateHistory.length) {
      return false;
    }
    
    this.currentState = { ...this.stateHistory[index] };
    this.historyIndex = index;
    return true;
  }
  
  // Undo操作
  undo(): boolean {
    if (this.historyIndex <= 0) {
      return false;
    }
    
    this.historyIndex--;
    this.currentState = { ...this.stateHistory[this.historyIndex] };
    return true;
  }
  
  // Redo操作
  redo(): boolean {
    if (this.historyIndex >= this.stateHistory.length - 1) {
      return false;
    }
    
    this.historyIndex++;
    this.currentState = { ...this.stateHistory[this.historyIndex] };
    return true;
  }
  
  // テンプレート変更前に状態を保存
  saveBeforeTemplateChange(objectId?: string, oldTemplateId?: string): void {
    this.saveCurrentState(`テンプレート変更: ${objectId || 'グローバル'}`);
  }
  
  // 歌詞タイミング変更前に状態を保存
  saveBeforeLyricsChange(changeType: string, objectId?: string): void {
    this.saveCurrentState(`歌詞タイミング変更: ${changeType}${objectId ? ` (${objectId})` : ''}`);
  }
  
  // パラメータ変更前に状態を保存
  saveBeforeParameterChange(parameterName: string, objectId?: string): void {
    this.saveCurrentState(`パラメータ変更: ${parameterName}${objectId ? ` (${objectId})` : ''}`);
  }
  
  // 現在の状態を更新（歌詞データと時間情報を含む）
  updateCurrentState(updates: Partial<ProjectState>): void {
    this.currentState = {
      ...this.currentState,
      ...updates,
      timestamp: Date.now()
    };
  }
  
  // 状態のエクスポート
  exportState(): ProjectState {
    return { ...this.currentState };
  }
  
  // 完全な状態をエクスポート（歌詞データ含む）
  exportFullState(): ProjectState {
    return { 
      ...this.currentState,
      // 歌詞データも確実に含める
      lyricsData: this.currentState.lyricsData ? JSON.parse(JSON.stringify(this.currentState.lyricsData)) : undefined
    };
  }

  // 自動保存からステージ設定を取得する同期メソッド
  getStageConfigFromAutoSave(): StageConfig | null {
    return this.currentState.stageConfig || null;
  }
  
  // 状態のインポート
  importState(state: Partial<ProjectState>): void {
    this.currentState = { 
      ...this.currentState,
      ...state,
      id: state.id || `state_${Date.now()}`,
      timestamp: state.timestamp || Date.now()
    };
    this.stateHistory = [{ ...this.currentState }];
    this.historyIndex = 0;
  }
  
  // 現在の状態を取得
  getCurrentState(): ProjectState {
    return { ...this.currentState };
  }
  
  // 履歴状態を取得
  getStateHistory(): ProjectState[] {
    return [...this.stateHistory];
  }
  
  // 履歴インデックスを取得
  getHistoryIndex(): number {
    return this.historyIndex;
  }
  
  // Undo可能かどうか
  canUndo(): boolean {
    return this.historyIndex > 0;
  }
  
  // Redo可能かどうか
  canRedo(): boolean {
    return this.historyIndex < this.stateHistory.length - 1;
  }
}