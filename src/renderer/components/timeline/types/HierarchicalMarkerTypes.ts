import React from 'react';
import { PhraseUnit, WordUnit, CharUnit } from '../../../types/types';

// マーカーの階層レベル
export type MarkerLevel = 'phrase' | 'word' | 'char';

// 基本マーカーユニット（任意の階層レベルに対応）
export interface MarkerUnit {
  id: string;
  start: number;
  end: number;
  text: string;
}

// 階層マーカーのプロパティ定義
export interface HierarchicalMarkerProps {
  unit: PhraseUnit | WordUnit | CharUnit;
  level: MarkerLevel;
  duration: number;
  timelineWidth: number;
  parentConstraints?: MarkerConstraints;
  onUpdate?: (updatedUnit: any) => void;
  onMultiUpdate?: (operationType: 'move' | 'resizeLeft' | 'resizeRight', markerId: string, deltaMs: number, level: MarkerLevel) => void;
  onSelectionChange?: (selectedIds: string[], level: MarkerLevel, isShiftKey?: boolean) => void;
  isSelected?: boolean;
  multiSelected?: boolean;
  isLeftOuterMarker?: boolean;   // 複数選択時の左端マーカーかどうか
  isRightOuterMarker?: boolean;  // 複数選択時の右端マーカーかどうか
  children?: React.ReactNode;
  onDragStart?: (unitId: string, operationType: string) => void;
  isActivated?: boolean;         // 明示的にアクティブ化されているかどうか
}

// ドラッグ状態
export interface DragState {
  isDragging: boolean;
  isResizing: 'left' | 'right' | null;
  initialPosition: { x: number; start: number; end: number };
  initialDuration: number;
}

// マーカー制約
export interface MarkerConstraints {
  minDuration: number;
  parentStart: number;
  parentEnd: number;
}

// マーカー更新データ（親子連動用）
export interface MarkerUpdateData {
  unit: PhraseUnit | WordUnit | CharUnit;
  newStart: number;
  newEnd: number;
  level: MarkerLevel;
  shouldUpdateChildren: boolean;
}

// 選択状態管理
export interface SelectionState {
  selectedIds: string[];
  selectedLevel: MarkerLevel | null;
  lastSelectedId: string | null;
}
