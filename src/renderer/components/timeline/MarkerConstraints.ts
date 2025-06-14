import { MarkerLevel, MarkerConstraints } from './types/HierarchicalMarkerTypes';

// 階層レベル別の最小持続時間（ms）
export const MIN_DURATIONS: Record<MarkerLevel, number> = {
  phrase: 200, // フレーズは最小200ms
  word: 100,   // 単語は最小100ms
  char: 50     // 文字は最小50ms
};

/**
 * 階層レベルに基づく最小持続時間を取得
 */
export const getMinDuration = (level: MarkerLevel): number => {
  return MIN_DURATIONS[level];
};

/**
 * マーカーの位置を検証し、制約に従って調整する
 */
export const validateMarkerPosition = (
  newStart: number,
  newEnd: number,
  level: MarkerLevel,
  parentConstraints?: MarkerConstraints
): { start: number; end: number } => {
  const minDuration = getMinDuration(level);
  
  // 親制約のデフォルト値
  const parentStart = parentConstraints?.parentStart ?? 0;
  const parentEnd = parentConstraints?.parentEnd ?? Infinity;
  
  // 最小持続時間の保証
  let validatedEnd = Math.max(newStart + minDuration, newEnd);
  let validatedStart = newStart;
  
  // 持続時間が最大制約を超える場合の調整
  if (validatedEnd - validatedStart > parentEnd - parentStart) {
    const maxDuration = parentEnd - parentStart;
    validatedEnd = validatedStart + maxDuration;
  }
  
  // 親制約内に収める
  validatedStart = Math.max(parentStart, Math.min(parentEnd - minDuration, validatedStart));
  validatedEnd = Math.min(parentEnd, Math.max(validatedStart + minDuration, validatedEnd));
  
  return { start: validatedStart, end: validatedEnd };
};

/**
 * 複数選択時のブロック制約を計算する
 */
export const calculateBlockConstraints = (
  selectedMarkers: Array<{ start: number; end: number }>,
  level: MarkerLevel,
  parentConstraints?: MarkerConstraints
): { minBlockStart: number; maxBlockEnd: number; minBlockDuration: number } => {
  if (selectedMarkers.length === 0) {
    return { minBlockStart: 0, maxBlockEnd: Infinity, minBlockDuration: getMinDuration(level) };
  }
  
  const parentStart = parentConstraints?.parentStart ?? 0;
  const parentEnd = parentConstraints?.parentEnd ?? Infinity;
  
  // 選択されたマーカーの数 × 最小持続時間
  const minBlockDuration = selectedMarkers.length * getMinDuration(level);
  
  // ブロック全体の制約
  const minBlockStart = parentStart;
  const maxBlockEnd = parentEnd;
  
  return { minBlockStart, maxBlockEnd, minBlockDuration };
};

/**
 * リサイズ操作の制約を計算する
 */
export const calculateResizeConstraints = (
  isLeftResize: boolean,
  currentStart: number,
  currentEnd: number,
  level: MarkerLevel,
  parentConstraints?: MarkerConstraints,
  multiSelectionInfo?: {
    blockStart: number;
    blockEnd: number;
    minBlockDuration: number;
  }
): { minValue: number; maxValue: number } => {
  const minDuration = getMinDuration(level);
  const parentStart = parentConstraints?.parentStart ?? 0;
  const parentEnd = parentConstraints?.parentEnd ?? Infinity;
  
  if (multiSelectionInfo) {
    // 複数選択時のリサイズ制約
    if (isLeftResize) {
      return {
        minValue: parentStart,
        maxValue: multiSelectionInfo.blockEnd - multiSelectionInfo.minBlockDuration
      };
    } else {
      return {
        minValue: multiSelectionInfo.blockStart + multiSelectionInfo.minBlockDuration,
        maxValue: parentEnd
      };
    }
  } else {
    // 単一選択時のリサイズ制約
    if (isLeftResize) {
      return {
        minValue: parentStart,
        maxValue: currentEnd - minDuration
      };
    } else {
      return {
        minValue: currentStart + minDuration,
        maxValue: parentEnd
      };
    }
  }
};

/**
 * 親オブジェクトIDを取得する
 */
export const getParentObjectId = (objectId: string): string | null => {
  const parts = objectId.split('_');
  
  if (parts.length >= 4 && parts[parts.length - 2] === 'char') {
    // 文字の場合、親は単語
    return parts.slice(0, parts.length - 2).join('_');
  } else if (parts.length >= 4 && parts[parts.length - 2] === 'word') {
    // 単語の場合、親はフレーズ
    return parts.slice(0, parts.length - 2).join('_');
  }
  
  return null;
};

/**
 * オブジェクトIDから階層レベルを判定する
 */
export const getMarkerLevel = (objectId: string): MarkerLevel => {
  const parts = objectId.split('_');
  
  if (parts.length >= 4 && parts[parts.length - 2] === 'char') {
    return 'char';
  } else if (parts.length >= 4 && parts[parts.length - 2] === 'word') {
    return 'word';
  } else {
    return 'phrase';
  }
};
