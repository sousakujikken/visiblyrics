import { MarkerLevel } from './types/HierarchicalMarkerTypes';
import { PhraseUnit, WordUnit, CharUnit } from '../../types/types';

// マーカースタイルの型定義
export interface MarkerStyle {
  height: number;
  backgroundColor: string;
  border: string;
  borderRadius: string;
  fontSize: number;
  zIndex: number;
  cursor: string;
}

// 階層レベル別の基本スタイル
const BASE_STYLES: Record<MarkerLevel, Omit<MarkerStyle, 'backgroundColor' | 'border' | 'cursor'>> = {
  phrase: {
    height: 18,
    borderRadius: '2px',
    fontSize: 11,
    zIndex: 3
  },
  word: {
    height: 16,
    borderRadius: '2px',
    fontSize: 10,
    zIndex: 2
  },
  char: {
    height: 14,
    borderRadius: '1px',
    fontSize: 9,
    zIndex: 1
  }
};

// カラーパレット
const COLORS = {
  phrase: {
    normal: { bg: 'rgba(66, 135, 245, 0.5)', border: 'rgba(66, 135, 245, 0.8)' },
    selected: { bg: 'rgba(255, 204, 0, 0.4)', border: 'rgba(255, 204, 0, 0.8)' },
    multiSelected: { bg: 'rgba(255, 150, 0, 0.4)', border: 'rgba(255, 150, 0, 0.9)' }
  },
  word: {
    normal: { bg: 'rgba(100, 200, 255, 0.4)', border: 'rgba(100, 200, 255, 0.6)' },
    selected: { bg: 'rgba(255, 204, 0, 0.4)', border: 'rgba(255, 204, 0, 0.8)' },
    multiSelected: { bg: 'rgba(255, 150, 0, 0.4)', border: 'rgba(255, 150, 0, 0.9)' }
  },
  char: {
    normal: { bg: 'rgba(120, 220, 255, 0.3)', border: 'rgba(120, 220, 255, 0.5)' },
    selected: { bg: 'rgba(255, 204, 0, 0.4)', border: 'rgba(255, 204, 0, 0.8)' },
    multiSelected: { bg: 'rgba(255, 150, 0, 0.4)', border: 'rgba(255, 150, 0, 0.9)' }
  }
};

/**
 * マーカーのスタイルを取得する
 */
export const getMarkerStyle = (
  level: MarkerLevel,
  isSelected: boolean = false,
  isMultiSelected: boolean = false,
  isDragging: boolean = false
): MarkerStyle => {
  const baseStyle = BASE_STYLES[level];
  const colors = COLORS[level];
  
  let colorScheme;
  if (isMultiSelected) {
    colorScheme = colors.multiSelected;
  } else if (isSelected) {
    colorScheme = colors.selected;
  } else {
    colorScheme = colors.normal;
  }
  
  const cursor = isDragging ? 'grabbing' : 'grab';
  
  return {
    ...baseStyle,
    backgroundColor: colorScheme.bg,
    border: `${isSelected || isMultiSelected ? '2px' : '1px'} solid ${colorScheme.border}`,
    cursor
  };
};

/**
 * リサイズハンドルのスタイルを取得する
 */
export const getResizeHandleStyle = (
  position: 'left' | 'right',
  isVisible: boolean = true,
  isActive: boolean = false
): React.CSSProperties => {
  return {
    position: 'absolute',
    [position]: '0',
    width: '6px',
    height: '100%',
    cursor: 'ew-resize',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    backgroundColor: isVisible 
      ? (isActive ? 'rgba(255, 204, 0, 0.8)' : 'rgba(255, 255, 255, 0.1)')
      : 'transparent',
    borderRadius: position === 'left' ? '3px 0 0 3px' : '0 3px 3px 0',
    transition: 'background-color 0.2s ease',
    opacity: isVisible ? (isActive ? 1 : 0.7) : 0,
  };
};

/**
 * 表示テキストを取得する
 */
export const getDisplayText = (unit: PhraseUnit | WordUnit | CharUnit, level: MarkerLevel): string => {
  switch (level) {
    case 'phrase':
      return (unit as PhraseUnit).phrase || (unit as any).text || '';
    case 'word':
      return (unit as WordUnit).word || (unit as any).text || '';
    case 'char':
      return (unit as CharUnit).char || '';
    default:
      return '';
  }
};

/**
 * マーカーのホバー時スタイルを取得する
 */
export const getHoverStyle = (level: MarkerLevel): Partial<MarkerStyle> => {
  const colors = COLORS[level];
  return {
    backgroundColor: colors.selected.bg,
    border: `1px solid ${colors.selected.border}`,
  };
};

/**
 * 複数選択時の範囲表示スタイル
 */
export const getSelectionRangeStyle = (): React.CSSProperties => {
  return {
    position: 'absolute',
    backgroundColor: 'rgba(66, 135, 245, 0.2)',
    border: '1px solid rgba(66, 135, 245, 0.8)',
    borderRadius: '2px',
    pointerEvents: 'none',
    zIndex: 5,
  };
};

/**
 * ドラッグ選択領域のスタイル
 */
export const getDragSelectionStyle = (): React.CSSProperties => {
  return {
    position: 'absolute',
    backgroundColor: 'rgba(66, 135, 245, 0.15)',
    border: '1px dashed rgba(66, 135, 245, 0.6)',
    borderRadius: '2px',
    pointerEvents: 'none',
    zIndex: 10,
  };
};

/**
 * 時間インジケーターのスタイル
 */
export const getTimeIndicatorStyle = (): React.CSSProperties => {
  return {
    position: 'absolute',
    top: '-20px',
    fontSize: '10px',
    color: '#999',
    userSelect: 'none',
    pointerEvents: 'none',
  };
};

/**
 * 現在時間マーカーのスタイル
 */
export const getCurrentTimeMarkerStyle = (): React.CSSProperties => {
  return {
    position: 'absolute',
    top: '0',
    height: '100%',
    width: '2px',
    backgroundColor: '#ff0000',
    zIndex: 100,
    pointerEvents: 'none',
  };
};
