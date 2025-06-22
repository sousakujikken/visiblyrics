import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PhraseUnit, WordUnit, CharUnit } from '../../types/types';
import {
  MarkerLevel,
  HierarchicalMarkerProps,
  DragState,
  MarkerConstraints
} from './types/HierarchicalMarkerTypes';
import {
  validateMarkerPosition
} from './MarkerConstraints';
import {
  getMarkerStyle,
  getResizeHandleStyle,
  getDisplayText
} from './MarkerStyles';

/**
 * 階層マーカー統一コンポーネント
 * フレーズ、単語、文字のすべてのマーカーを統一的に扱う
 */
const HierarchicalMarker: React.FC<HierarchicalMarkerProps> = ({
  unit,
  level,
  duration,
  timelineWidth,
  parentConstraints,
  onUpdate,
  onMultiUpdate,
  onSelectionChange,
  isSelected = false,
  multiSelected = false,
  isLeftOuterMarker = false,
  isRightOuterMarker = false,
  children,
  onDragStart,
  isActivated = false
}) => {
  // ドラッグ状態管理（React再レンダリングから完全保護）
  const dragStateRef = useRef<{
    isDragging: boolean;
    isResizing: 'left' | 'right' | null;
    startMouseX: number;
    startUnitStart: number;
    startUnitEnd: number;
    operationType: 'move' | 'resizeLeft' | 'resizeRight' | null;
    isActive: boolean;
  }>({
    isDragging: false,
    isResizing: null,
    startMouseX: 0,
    startUnitStart: 0,
    startUnitEnd: 0,
    operationType: null,
    isActive: false
  });

  // レガシー状態（後方互換性のため）
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    isResizing: null,
    initialPosition: { x: 0, start: 0, end: 0 },
    initialDuration: 0
  });

  // リサイズデータ（レガシー）
  const resizeDataRef = useRef<any>(null);
  const absoluteDragDataRef = useRef<{
    startMouseX: number;
    startUnitStart: number;
    startUnitEnd: number;
    isDragging: boolean;
    operationType: 'move' | 'resizeLeft' | 'resizeRight' | null;
  } | null>(null);

  /**
   * 子要素を含む全体の更新処理
   */
  const updateUnitWithChildren = useCallback((
    originalUnit: PhraseUnit | WordUnit | CharUnit,
    newStart: number,
    newEnd: number,
    currentLevel: MarkerLevel
  ): PhraseUnit | WordUnit | CharUnit => {
    const originalDuration = originalUnit.end - originalUnit.start;
    const newDuration = newEnd - newStart;
    const scaleFactor = originalDuration > 0 ? newDuration / originalDuration : 1;

    // 基本的な更新
    const updatedUnit = {
      ...originalUnit,
      start: newStart,
      end: newEnd
    };

    // 子要素の自動調整
    if (currentLevel === 'phrase' && 'words' in originalUnit) {
      // フレーズの場合、単語と文字を自動調整
      const phraseUnit = originalUnit as PhraseUnit;
      (updatedUnit as PhraseUnit).words = phraseUnit.words.map((word: WordUnit) => {
        const wordOffset = word.start - originalUnit.start;
        const wordDuration = word.end - word.start;
        const newWordStart = newStart + (wordOffset * scaleFactor);
        const newWordEnd = newWordStart + (wordDuration * scaleFactor);

        return {
          ...word,
          start: newWordStart,
          end: newWordEnd,
          chars: word.chars.map((char: CharUnit) => {
            const charOffset = char.start - word.start;
            const charDuration = char.end - char.start;
            const charScaleFactor = (newWordEnd - newWordStart) / (word.end - word.start);
            
            return {
              ...char,
              start: newWordStart + (charOffset * charScaleFactor),
              end: newWordStart + (charOffset * charScaleFactor) + (charDuration * charScaleFactor)
            };
          })
        };
      });
    } else if (currentLevel === 'word' && 'chars' in originalUnit) {
      // 単語の場合、文字を自動調整
      const wordUnit = originalUnit as WordUnit;
      (updatedUnit as WordUnit).chars = wordUnit.chars.map((char: CharUnit) => {
        const charOffset = char.start - originalUnit.start;
        const charDuration = char.end - char.start;
        
        return {
          ...char,
          start: newStart + (charOffset * scaleFactor),
          end: newStart + (charOffset * scaleFactor) + (charDuration * scaleFactor)
        };
      });
    }

    return updatedUnit;
  }, []);

  /**
   * ポインターダウンハンドラー
   */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    
    // リサイズハンドル以外での選択処理
    if (onSelectionChange && !target.classList.contains('resize-handle-left') && 
        !target.classList.contains('resize-handle-right')) {
      // ドラッグ操作の場合、既に選択されているマーカーの選択状態を保持
      // 既に選択されているマーカーをドラッグする場合は選択状態を変更しない
      if (!isSelected || e.shiftKey) {
        // 未選択のマーカーまたはShiftキーが押されている場合のみ選択状態を更新
        onSelectionChange([unit.id], level, e.shiftKey);
      }
      // 既に選択されているマーカーの通常クリックは選択状態を保持
    }
    
    // ドラッグ開始時のUndoステート保存
    if (onDragStart) {
      let operationType = `${level}マーカー移動`;
      
      if (target.classList.contains('resize-handle-left')) {
        operationType = `${level}マーカー左リサイズ`;
      } else if (target.classList.contains('resize-handle-right')) {
        operationType = `${level}マーカー右リサイズ`;
      }
      
      onDragStart(unit.id, operationType);
    }

    // ❗重要: 新しいドラッグ状態を保存（完全にReact再レンダリングから保護）
    const dragType = target.classList.contains('resize-handle-left') ? 'resizeLeft' :
                     target.classList.contains('resize-handle-right') ? 'resizeRight' : 'move';
                     
    const newDragState = dragStateRef.current;
    newDragState.isDragging = !target.classList.contains('resize-handle-left') && !target.classList.contains('resize-handle-right');
    newDragState.isResizing = target.classList.contains('resize-handle-left') ? 'left' : 
                             target.classList.contains('resize-handle-right') ? 'right' : null;
    newDragState.startMouseX = e.clientX;
    newDragState.startUnitStart = unit.start;
    newDragState.startUnitEnd = unit.end;
    newDragState.operationType = dragType;
    newDragState.isActive = true;

    // レガシー状態も更新（後方互換性のため）
    absoluteDragDataRef.current = {
      startMouseX: e.clientX,
      startUnitStart: unit.start,
      startUnitEnd: unit.end,
      isDragging: true,
      operationType: dragType
    };

    const initialPosition = {
      x: e.clientX,
      start: unit.start,
      end: unit.end
    };

    // リサイズの場合の初期データ保存
    if (target.classList.contains('resize-handle-left') || target.classList.contains('resize-handle-right')) {
      resizeDataRef.current = {
        originalUnit: JSON.parse(JSON.stringify(unit)),
        initialStart: unit.start,
        initialEnd: unit.end,
        initialDuration: unit.end - unit.start
      };
    }

    setDragState({
      isDragging: newDragState.isDragging,
      isResizing: newDragState.isResizing,
      initialPosition,
      initialDuration: unit.end - unit.start
    });

    // ポインターキャプチャー
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    
    if (multiSelected && import.meta.env.DEV) {
      console.log(`[Marker:${unit.id}] ドラッグ開始: mouseX=${e.clientX}, start=${unit.start}, end=${unit.end}, 操作:${dragType}`);
    }
  }, [unit, level, onSelectionChange, onDragStart, isSelected, multiSelected]);

  /**
   * ポインタームーブハンドラー（改良版）
   */
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // 新しいドラッグ状態を使用（React再レンダリングに完全に影響されない）
    const dragData = dragStateRef.current;
    if (!dragData.isActive || (!dragData.isDragging && !dragData.isResizing)) {
      return;
    }

    // ❗重要: 絶対座標を使用して移動量を計算
    const deltaX = e.clientX - dragData.startMouseX;
    const pxPerMs = timelineWidth / duration;
    const deltaMs = deltaX / pxPerMs;


    // 移動量が小さすぎる場合は処理をスキップ
    if (Math.abs(deltaMs) < 0.1) {
      return;
    }

    let newStart: number;
    let newEnd: number;
    let operationType: 'move' | 'resizeLeft' | 'resizeRight';

    // ❗重要: 基準点からの絶対移動量で計算
    if (dragData.operationType === 'move') {
      // ドラッグ移動
      newStart = dragData.startUnitStart + deltaMs;
      newEnd = dragData.startUnitEnd + deltaMs;
      operationType = 'move';
    } else if (dragData.operationType === 'resizeLeft') {
      // 左リサイズ
      newStart = dragData.startUnitStart + deltaMs;
      newEnd = dragData.startUnitEnd;
      operationType = 'resizeLeft';
    } else if (dragData.operationType === 'resizeRight') {
      // 右リサイズ
      newStart = dragData.startUnitStart;
      newEnd = dragData.startUnitEnd + deltaMs;
      operationType = 'resizeRight';
    } else {
      console.error(`[Marker:${unit.id}] 不明な操作タイプ: ${dragData.operationType}`);
      return;
    }

    // 複数選択時は一括操作、単一選択時は個別更新
    if (multiSelected && onMultiUpdate) {
      // 複数選択時は個別の制約チェックをスキップし、元のdeltaMsをそのまま使用
      
      onMultiUpdate(
        operationType,
        unit.id,
        deltaMs,  // 元の移動量をそのまま渡す
        level
      );
    } else if (onUpdate) {
      // 単一選択時の個別更新
      // 制約による位置調整
      const validatedPosition = validateMarkerPosition(newStart, newEnd, level, parentConstraints);
      
      
      const updatedUnit = updateUnitWithChildren(unit, validatedPosition.start, validatedPosition.end, level);
      onUpdate(updatedUnit);
    }
  }, [unit, level, duration, timelineWidth, parentConstraints, onUpdate, onMultiUpdate, multiSelected, updateUnitWithChildren]);

  /**
   * ポインターアップハンドラー（改良版）
   */
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // 新しいドラッグ状態をクリア
    const dragData = dragStateRef.current;
    dragData.isDragging = false;
    dragData.isResizing = null;
    dragData.startMouseX = 0;
    dragData.startUnitStart = 0;
    dragData.startUnitEnd = 0;
    dragData.operationType = null;
    dragData.isActive = false;

    // レガシー状態もクリア
    if (absoluteDragDataRef.current) {
      absoluteDragDataRef.current.isDragging = false;
      absoluteDragDataRef.current = null;
    }
    
    setDragState({
      isDragging: false,
      isResizing: null,
      initialPosition: { x: 0, start: 0, end: 0 },
      initialDuration: 0
    });
    
    // リサイズデータをクリア
    resizeDataRef.current = null;
    
    // デバッグログ: ドラッグ終了（簡潔版）
    if (multiSelected && import.meta.env.DEV) {
      }
  }, [multiSelected, unit.id]);

  // スタイルの計算（新しいドラッグ状態を参照）
  const isDraggingState = dragStateRef.current.isDragging || dragState.isDragging;
  const markerStyle = getMarkerStyle(level, isSelected, multiSelected, isDraggingState, isActivated);
  const pxPerMs = timelineWidth / duration;
  const startX = (unit.start / duration) * timelineWidth;
  const width = ((unit.end - unit.start) / duration) * timelineWidth;

  // 表示テキストの取得
  const displayText = getDisplayText(unit, level);

  // リサイズハンドルの表示制御
  const showLeftHandle = !multiSelected || isLeftOuterMarker;
  const showRightHandle = !multiSelected || isRightOuterMarker;

  return (
    <div 
      className={`hierarchical-marker ${level}-marker ${isSelected ? 'selected' : ''} ${multiSelected ? 'multi-selected' : ''} ${isActivated ? 'activated' : ''}`}
      style={{
        position: 'absolute',
        left: `${startX}px`,
        width: `${width}px`,
        height: `${markerStyle.height}px`,
        backgroundColor: markerStyle.backgroundColor,
        border: markerStyle.border,
        borderRadius: markerStyle.borderRadius,
        cursor: markerStyle.cursor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${markerStyle.fontSize}px`,
        zIndex: markerStyle.zIndex,
        boxSizing: 'border-box',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        color: 'white',
        fontWeight: isSelected ? 'bold' : 'normal',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* 表示テキスト */}
      <span style={{ 
        pointerEvents: 'none',
        textAlign: 'center',
        width: '100%',
        padding: '0 8px'
      }}>
        {displayText}
      </span>

      {/* 左リサイズハンドル */}
      {showLeftHandle && (
        <div 
          className="resize-handle-left"
          style={getResizeHandleStyle('left', true, dragStateRef.current.isResizing === 'left' || dragState.isResizing === 'left')}
        />
      )}

      {/* 右リサイズハンドル */}
      {showRightHandle && (
        <div 
          className="resize-handle-right"
          style={getResizeHandleStyle('right', true, dragStateRef.current.isResizing === 'right' || dragState.isResizing === 'right')}
        />
      )}

      {/* 子要素（必要に応じて） */}
      {children}
    </div>
  );
};

export default HierarchicalMarker;