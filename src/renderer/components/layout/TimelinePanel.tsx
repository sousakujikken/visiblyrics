import React, { useEffect, useState, useRef } from 'react';
import HierarchicalMarker from '../timeline/HierarchicalMarker';
import WaveformPanel from './WaveformPanel';
import { PhraseUnit, WordUnit, CharUnit, IAnimationTemplate } from '../../types/types';
import { MarkerLevel, SelectionState } from '../timeline/types/HierarchicalMarkerTypes';
import { getMarkerLevel, getParentObjectId, MIN_DURATIONS, calculateBlockConstraints } from '../timeline/MarkerConstraints';
import { getCurrentTimeMarkerStyle, getTimeIndicatorStyle, getDragSelectionStyle } from '../timeline/MarkerStyles';
import Engine from '../../engine/Engine';
import '../../styles/components.css';

// ズームレベルの定義（ピクセル密度: ms per pixel）
const ZOOM_LEVELS = [50, 20, 10, 5, 2]; // 50ms/px から 2ms/px まで

interface TimelinePanelProps {
  currentTime: number;
  totalDuration: number;
  engine?: Engine;
  template?: IAnimationTemplate;
  viewStart?: number;
  viewDuration?: number;
  zoomLevel?: number;
}

const TimelinePanel: React.FC<TimelinePanelProps> = ({ 
  currentTime, 
  totalDuration,
  engine,
  template,
  viewStart: externalViewStart,
  viewDuration: externalViewDuration,
  zoomLevel: externalZoomLevel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineAreaRef = useRef<HTMLDivElement>(null);
  const [lyrics, setLyrics] = useState<PhraseUnit[]>([]);
  const [width, setWidth] = useState(800);
  const [localDuration, setLocalDuration] = useState(totalDuration || 10000);
  
  // 選択状態管理
  const [selectionState, setSelectionState] = useState<SelectionState>({
    selectedIds: [],
    selectedLevel: null,
    lastSelectedId: null
  });

  // ドラッグ選択の状態
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, y: 0 });
  
  // 複数マーカーのドラッグ制御用（改良版）
  const multiDragStateRef = useRef<{
    isActive: boolean,
    operationType: 'move' | 'resizeLeft' | 'resizeRight' | null,
    selectedIds: string[],
    selectedLevel: MarkerLevel | null,
    initialPositions: Map<string, { start: number, end: number }>,
    totalDeltaMs: number,
    lastUpdateTime: number,
    isLocked: boolean
  }>({
    isActive: false,
    operationType: null,
    selectedIds: [],
    selectedLevel: null,
    initialPositions: new Map(),
    totalDeltaMs: 0,
    lastUpdateTime: 0,
    isLocked: false
  });

  // レガシー用（後方互換性のため残す）
  const [currentDragMarkerId, setCurrentDragMarkerId] = useState<string | null>(null);
  const dragThrottleRef = useRef<number>(0);
  const multiUpdateLockRef = useRef<boolean>(false);
  const lastOperationRef = useRef<{
    operationType: string;
    triggeredMarkerId: string;
    deltaMs: number;
    timestamp: number;
  } | null>(null);

  // totalDurationが更新されたらlocalDurationも更新
  useEffect(() => {
    if (totalDuration && totalDuration > 0) {
      setLocalDuration(totalDuration);
    }
  }, [totalDuration]);
  
  const duration = localDuration;
  
  // externalViewDurationが提供されている場合は、それに基づいてmsPerPixelを計算
  let msPerPixel: number;
  if (externalViewDuration && width > 0) {
    // 表示領域の幅に対して、指定された時間範囲を表示するためのms/pixelを計算
    msPerPixel = externalViewDuration / width;
  } else {
    // フォールバック：従来のズームレベル方式
    const zoomLevel = externalZoomLevel ?? 2;
    msPerPixel = ZOOM_LEVELS[zoomLevel] || 10;
  }
  
  const timelineWidth = Math.max(width, duration / msPerPixel);

  /**
   * Undo状態保存
   */
  const saveUndoState = (operationType: string, objectId?: string) => {
    if (!engine) return;
    
    try {
      engine.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(lyrics)),
        currentTime: currentTime,
        templateAssignments: engine.templateManager.exportAssignments(),
        globalParams: engine.parameterManager.getGlobalParams(),
        objectParams: engine.parameterManager.exportParameters().objects || {},
        defaultTemplateId: engine.templateManager.getDefaultTemplateId()
      });
      
      engine.projectStateManager.saveBeforeLyricsChange(operationType, objectId);
      console.log(`TimelinePanel: Undo状態保存完了 - ${operationType} (${objectId || 'グローバル'})`);
    } catch (error) {
      console.error('TimelinePanel: Undo状態保存エラー:', error);
    }
  };

  /**
   * 歌詞データを更新し、エンジンに通知
   */
  const updateLyricsWithEngine = (updatedLyrics: PhraseUnit[], operationType: string) => {
    setLyrics(updatedLyrics);
    
    if (engine) {
      engine.updateLyricsData(updatedLyrics, false, `${operationType}完了`);
    }
  };

  /**
   * 選択状態の変更ハンドラー
   */
  const handleSelectionChange = (selectedIds: string[], level: MarkerLevel, isShiftKey: boolean = false) => {
    let newSelectedIds: string[];
    let newSelectedLevel: MarkerLevel | null;
    
    if (isShiftKey) {
      // Shiftキーが押されている場合は追加選択
      if (selectionState.selectedLevel === level || selectionState.selectedLevel === null) {
        // 同じレベルまたは初回選択の場合
        const targetId = selectedIds[0];
        if (selectionState.selectedIds.includes(targetId)) {
          // すでに選択されている場合は選択解除
          newSelectedIds = selectionState.selectedIds.filter(id => id !== targetId);
          newSelectedLevel = newSelectedIds.length > 0 ? level : null;
        } else {
          // 新たに選択に追加
          newSelectedIds = [...selectionState.selectedIds, targetId];
          newSelectedLevel = level;
        }
      } else {
        // 異なるレベルの場合は新規選択
        newSelectedIds = selectedIds;
        newSelectedLevel = level;
      }
    } else {
      // 通常の単一選択
      newSelectedIds = selectedIds;
      newSelectedLevel = level;
    }
    
    setSelectionState({
      selectedIds: newSelectedIds,
      selectedLevel: newSelectedLevel,
      lastSelectedId: newSelectedIds.length > 0 ? newSelectedIds[newSelectedIds.length - 1] : null
    });

    // パラメータ取得（単一選択時のみ）
    let params = {};
    if (newSelectedIds.length === 1) {
      const id = newSelectedIds[0];
      if (newSelectedLevel === 'phrase') {
        const phrase = lyrics.find(p => p.id === id);
        params = phrase?.params || {};
      } else if (newSelectedLevel === 'word') {
        for (const phrase of lyrics) {
          const word = phrase.words.find(w => w.id === id);
          if (word) {
            params = word.params || {};
            break;
          }
        }
      } else if (newSelectedLevel === 'char') {
        for (const phrase of lyrics) {
          for (const word of phrase.words) {
            const char = word.chars.find(c => c.id === id);
            if (char) {
              params = char.params || {};
              break;
            }
          }
        }
      }
    }

    // カスタムイベント発火
    try {
      const singleEvent = new CustomEvent('object-selected', {
        detail: { 
          objectId: newSelectedIds[0] || '', 
          objectType: newSelectedLevel || 'phrase', 
          params 
        }
      });
      window.dispatchEvent(singleEvent);
      
      const multiEvent = new CustomEvent('objects-selected', {
        detail: { 
          objectIds: newSelectedIds, 
          objectType: newSelectedLevel || 'phrase',
          params: newSelectedIds.length === 1 ? params : {}
        }
      });
      window.dispatchEvent(multiEvent);
      
      console.log('TimelinePanel: オブジェクト選択', newSelectedIds, newSelectedLevel);
    } catch (error) {
      console.error('イベント発火エラー:', error);
    }
  };

  /**
   * 複数選択時の一括操作ハンドラー（改良版）
   */
  const handleMultiUpdate = (
    operationType: 'move' | 'resizeLeft' | 'resizeRight',
    triggeredMarkerId: string,
    deltaMs: number,
    level: MarkerLevel
  ) => {
    if (selectionState.selectedIds.length <= 1 || selectionState.selectedLevel !== level) {
      return; // 単一選択または異なるレベルの場合は何もしない
    }

    const dragState = multiDragStateRef.current;
    const now = Date.now();

    // ❗重要: ドラッグ開始時の初期化
    if (!dragState.isActive) {
      dragState.isActive = true;
      dragState.operationType = operationType;
      dragState.selectedIds = [...selectionState.selectedIds];
      dragState.selectedLevel = level;
      dragState.totalDeltaMs = 0;
      dragState.lastUpdateTime = now;
      dragState.isLocked = false;
      
      // 選択された全マーカーとその子要素の初期位置を記録
      dragState.initialPositions.clear();
      const selectedMarkers = getSelectedMarkersData(lyrics, selectionState.selectedIds, level);
      
      // 選択されたマーカーの初期位置を記録
      selectedMarkers.forEach(marker => {
        dragState.initialPositions.set(marker.id, {
          start: marker.start,
          end: marker.end
        });
      });
      
      // ❗重要: 子要素の初期位置も記録
      lyrics.forEach(phrase => {
        if (level === 'phrase' && selectionState.selectedIds.includes(phrase.id)) {
          // フレーズが選択されている場合、その下の全ての単語・文字の初期位置を記録
          phrase.words.forEach(word => {
            dragState.initialPositions.set(word.id, {
              start: word.start,
              end: word.end
            });
            
            word.chars.forEach(char => {
              dragState.initialPositions.set(char.id, {
                start: char.start,
                end: char.end
              });
            });
          });
        }
        
        phrase.words.forEach(word => {
          if (level === 'word' && selectionState.selectedIds.includes(word.id)) {
            // 単語が選択されている場合、その下の全ての文字の初期位置を記録
            word.chars.forEach(char => {
              dragState.initialPositions.set(char.id, {
                start: char.start,
                end: char.end
              });
            });
          }
        });
      });
      
    }

    // ❗重複処理防止: より厳密なロック
    if (dragState.isLocked || (now - dragState.lastUpdateTime) < 5) {
      return;
    }

    // 操作タイプが変わった場合はリセット
    if (dragState.operationType !== operationType) {
      if (import.meta.env.DEV) {
        console.log(`[MultiDrag] 操作タイプ変更: ${dragState.operationType} → ${operationType}`);
      }
      dragState.operationType = operationType;
      dragState.totalDeltaMs = 0;
    }

    // ロックを設定
    dragState.isLocked = true;
    dragState.lastUpdateTime = now;

    // ❗重要: 累積移動量の更新（deltaMs の増分分だけ加算）
    const deltaMsIncrement = deltaMs - dragState.totalDeltaMs;
    dragState.totalDeltaMs = deltaMs;

    // デバッグログ（詳細版）

    let updatedLyrics = [...lyrics];
    
    if (operationType === 'move') {
      // ❗重要: 絶対位置での移動適用
      updatedLyrics = applyAbsoluteMoveToSelectedMarkers(
        updatedLyrics, 
        dragState.selectedIds, 
        level, 
        dragState.totalDeltaMs,
        dragState.initialPositions
      );
    } else {
      // ❗重要: 絶対位置でのリサイズ適用
      updatedLyrics = applyAbsoluteResizeToSelectedMarkers(
        updatedLyrics, 
        dragState.selectedIds, 
        level, 
        operationType,
        dragState.totalDeltaMs,
        dragState.initialPositions
      );
    }

    updateLyricsWithEngine(updatedLyrics, `複数${level}マーカー${operationType === 'move' ? '移動' : 'リサイズ'}`);
    
    // ロックを解除 (短時間後に非同期で実行)
    setTimeout(() => {
      dragState.isLocked = false;
    }, 1);
  };

  /**
   * 絶対基準点を使用してマーカーを移動する（改良版）
   */
  const applyAbsoluteMoveToSelectedMarkers = (
    currentLyrics: PhraseUnit[],
    selectedIds: string[],
    level: MarkerLevel,
    totalDeltaMs: number,
    initialPositions: Map<string, { start: number; end: number }>
  ): PhraseUnit[] => {
    // デバッグログ（詳細版）
    
    return currentLyrics.map(phrase => {
      if (level === 'phrase' && selectedIds.includes(phrase.id)) {
        // フレーズの移動
        const initialPos = initialPositions.get(phrase.id);
        if (!initialPos) {
          console.error(`[ApplyAbsoluteMove] 初期位置が見つかりません: ${phrase.id}`);
          return phrase;
        }
        
        const newStart = initialPos.start + totalDeltaMs;
        const newEnd = initialPos.end + totalDeltaMs;
        
        
        return {
          ...phrase,
          start: newStart,
          end: newEnd,
          words: phrase.words.map(word => {
            const wordInitialPos = initialPositions.get(word.id) || {
              start: word.start - (phrase.start - initialPos.start),
              end: word.end - (phrase.end - initialPos.end)
            };
            return {
              ...word,
              start: wordInitialPos.start + totalDeltaMs,
              end: wordInitialPos.end + totalDeltaMs,
              chars: word.chars.map(char => {
                const charInitialPos = initialPositions.get(char.id) || {
                  start: char.start - (phrase.start - initialPos.start),
                  end: char.end - (phrase.end - initialPos.end)
                };
                return {
                  ...char,
                  start: charInitialPos.start + totalDeltaMs,
                  end: charInitialPos.end + totalDeltaMs
                };
              })
            };
          })
        };
      } else {
        // 単語または文字の移動
        const updatedWords = phrase.words.map(word => {
          if (level === 'word' && selectedIds.includes(word.id)) {
            const initialPos = initialPositions.get(word.id);
            if (!initialPos) {
              console.error(`[ApplyAbsoluteMove] 初期位置が見つかりません: ${word.id}`);
              return word;
            }
            
            const newStart = initialPos.start + totalDeltaMs;
            const newEnd = initialPos.end + totalDeltaMs;
            
            
            return {
              ...word,
              start: newStart,
              end: newEnd,
              chars: word.chars.map(char => {
                const charInitialPos = initialPositions.get(char.id) || {
                  start: char.start - (word.start - initialPos.start),
                  end: char.end - (word.end - initialPos.end)
                };
                return {
                  ...char,
                  start: charInitialPos.start + totalDeltaMs,
                  end: charInitialPos.end + totalDeltaMs
                };
              })
            };
          } else {
            const updatedChars = word.chars.map(char => {
              if (level === 'char' && selectedIds.includes(char.id)) {
                const initialPos = initialPositions.get(char.id);
                if (!initialPos) {
                  console.error(`[ApplyAbsoluteMove] 初期位置が見つかりません: ${char.id}`);
                  return char;
                }
                
                const newStart = initialPos.start + totalDeltaMs;
                const newEnd = initialPos.end + totalDeltaMs;
                
                
                return {
                  ...char,
                  start: newStart,
                  end: newEnd
                };
              }
              return char;
            });
            return { ...word, chars: updatedChars };
          }
        });
        return { ...phrase, words: updatedWords };
      }
    });
  };

  /**
   * 選択されたマーカーを同じ量移動する（レガシー版）
   */
  const applyMoveToSelectedMarkers = (
    currentLyrics: PhraseUnit[],
    selectedIds: string[],
    level: MarkerLevel,
    deltaMs: number
  ): PhraseUnit[] => {
    
    return currentLyrics.map(phrase => {
      if (level === 'phrase' && selectedIds.includes(phrase.id)) {
        // フレーズの移動
        const oldStart = phrase.start;
        const newStart = phrase.start + deltaMs;
        const newEnd = phrase.end + deltaMs;
        
        
        return {
          ...phrase,
          start: newStart,
          end: newEnd,
          words: phrase.words.map(word => ({
            ...word,
            start: word.start + deltaMs,
            end: word.end + deltaMs,
            chars: word.chars.map(char => ({
              ...char,
              start: char.start + deltaMs,
              end: char.end + deltaMs
            }))
          }))
        };
      } else {
        // 単語または文字の移動
        const updatedWords = phrase.words.map(word => {
          if (level === 'word' && selectedIds.includes(word.id)) {
            const oldStart = word.start;
            const newStart = word.start + deltaMs;
            const newEnd = word.end + deltaMs;
            
            
            return {
              ...word,
              start: newStart,
              end: newEnd,
              chars: word.chars.map(char => ({
                ...char,
                start: char.start + deltaMs,
                end: char.end + deltaMs
              }))
            };
          } else {
            const updatedChars = word.chars.map(char => {
              if (level === 'char' && selectedIds.includes(char.id)) {
                const oldStart = char.start;
                const newStart = char.start + deltaMs;
                const newEnd = char.end + deltaMs;
                
                
                return {
                  ...char,
                  start: newStart,
                  end: newEnd
                };
              }
              return char;
            });
            return { ...word, chars: updatedChars };
          }
        });
        return { ...phrase, words: updatedWords };
      }
    });
  };

  /**
   * 絶対基準点を使用してマーカーをリサイズする（改良版）
   */
  const applyAbsoluteResizeToSelectedMarkers = (
    currentLyrics: PhraseUnit[],
    selectedIds: string[],
    level: MarkerLevel,
    operationType: 'resizeLeft' | 'resizeRight',
    totalDeltaMs: number,
    initialPositions: Map<string, { start: number, end: number }>
  ): PhraseUnit[] => {
    // 初期位置から選択されたマーカーの範囲を取得
    const initialMarkers = Array.from(initialPositions.entries())
      .filter(([id]) => selectedIds.includes(id))
      .map(([id, pos]) => ({ id, start: pos.start, end: pos.end }));
    
    if (initialMarkers.length === 0) {
      console.error('[ApplyAbsoluteResize] 初期マーカーが見つかりません');
      return currentLyrics;
    }

    const initialBlockStart = Math.min(...initialMarkers.map(m => m.start));
    const initialBlockEnd = Math.max(...initialMarkers.map(m => m.end));
    const initialBlockDuration = initialBlockEnd - initialBlockStart;
    
    // リサイズ後のブロック範囲を計算（絶対基準点から）
    let newBlockStart = initialBlockStart;
    let newBlockEnd = initialBlockEnd;
    
    if (operationType === 'resizeLeft') {
      // 左リサイズ：右端固定、左端変更
      newBlockStart = initialBlockStart + totalDeltaMs;
    } else {
      // 右リサイズ：左端固定、右端変更
      newBlockEnd = initialBlockEnd + totalDeltaMs;
    }
    
    // 選択されたマーカーの数に基づく最小ブロック期間を計算
    const selectedMarkerCount = selectedIds.length;
    const minBlockDuration = selectedMarkerCount * MIN_DURATIONS[level];
    
    // 最小制約を適用
    if (newBlockEnd - newBlockStart < minBlockDuration) {
      if (operationType === 'resizeLeft') {
        newBlockStart = newBlockEnd - minBlockDuration;
      } else {
        newBlockEnd = newBlockStart + minBlockDuration;
      }
    }
    
    const newBlockDuration = newBlockEnd - newBlockStart;
    const scaleFactor = initialBlockDuration > 0 ? newBlockDuration / initialBlockDuration : 1;
    
    
    // 各マーカーを初期位置からの相対位置でスケーリング
    return currentLyrics.map(phrase => {
      if (level === 'phrase' && selectedIds.includes(phrase.id)) {
        const initialPos = initialPositions.get(phrase.id);
        if (!initialPos) {
          console.error(`[ApplyAbsoluteResize] 初期位置が見つかりません: ${phrase.id}`);
          return phrase;
        }
        
        const relativeStart = (initialPos.start - initialBlockStart) / initialBlockDuration;
        const relativeDuration = (initialPos.end - initialPos.start) / initialBlockDuration;
        
        const newPhraseStart = newBlockStart + (relativeStart * newBlockDuration);
        const newPhraseEnd = newPhraseStart + (relativeDuration * newBlockDuration);
        
        
        return {
          ...phrase,
          start: newPhraseStart,
          end: newPhraseEnd,
          words: phrase.words.map(word => {
            const wordInitialPos = initialPositions.get(word.id);
            if (!wordInitialPos) {
              console.error(`[ApplyAbsoluteResize] 単語の初期位置が見つかりません: ${word.id}`);
              return word; // 初期位置が見つからない場合は変更しない
            }
            
            // 単語の相対位置を計算（初期フレーズ内での位置）
            const wordRelativeStart = (wordInitialPos.start - initialPos.start) / (initialPos.end - initialPos.start);
            const wordRelativeDuration = (wordInitialPos.end - wordInitialPos.start) / (initialPos.end - initialPos.start);
            
            const newWordStart = newPhraseStart + (wordRelativeStart * (newPhraseEnd - newPhraseStart));
            const newWordEnd = newWordStart + (wordRelativeDuration * (newPhraseEnd - newPhraseStart));
            
            return {
              ...word,
              start: newWordStart,
              end: newWordEnd,
              chars: word.chars.map(char => {
                const charInitialPos = initialPositions.get(char.id);
                if (!charInitialPos) {
                  console.error(`[ApplyAbsoluteResize] 文字の初期位置が見つかりません: ${char.id}`);
                  return char; // 初期位置が見つからない場合は変更しない
                }
                
                // 文字の相対位置を計算（初期単語内での位置）
                const charRelativeStart = (charInitialPos.start - wordInitialPos.start) / (wordInitialPos.end - wordInitialPos.start);
                const charRelativeDuration = (charInitialPos.end - charInitialPos.start) / (wordInitialPos.end - wordInitialPos.start);
                
                return {
                  ...char,
                  start: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)),
                  end: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)) + (charRelativeDuration * (newWordEnd - newWordStart))
                };
              })
            };
          })
        };
      } else {
        // 単語または文字のリサイズ
        const updatedWords = phrase.words.map(word => {
          if (level === 'word' && selectedIds.includes(word.id)) {
            const initialPos = initialPositions.get(word.id);
            if (!initialPos) {
              console.error(`[ApplyAbsoluteResize] 初期位置が見つかりません: ${word.id}`);
              return word;
            }
            
            const relativeStart = (initialPos.start - initialBlockStart) / initialBlockDuration;
            const relativeDuration = (initialPos.end - initialPos.start) / initialBlockDuration;
            
            const newWordStart = newBlockStart + (relativeStart * newBlockDuration);
            const newWordEnd = newWordStart + (relativeDuration * newBlockDuration);
            
            
            return {
              ...word,
              start: newWordStart,
              end: newWordEnd,
              chars: word.chars.map(char => {
                const charInitialPos = initialPositions.get(char.id);
                if (!charInitialPos) {
                  console.error(`[ApplyAbsoluteResize] 文字の初期位置が見つかりません: ${char.id}`);
                  return char; // 初期位置が見つからない場合は変更しない
                }
                
                const charRelativeStart = (charInitialPos.start - initialPos.start) / (initialPos.end - initialPos.start);
                const charRelativeDuration = (charInitialPos.end - charInitialPos.start) / (initialPos.end - initialPos.start);
                
                return {
                  ...char,
                  start: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)),
                  end: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)) + (charRelativeDuration * (newWordEnd - newWordStart))
                };
              })
            };
          } else {
            const updatedChars = word.chars.map(char => {
              if (level === 'char' && selectedIds.includes(char.id)) {
                const initialPos = initialPositions.get(char.id);
                if (!initialPos) {
                  console.error(`[ApplyAbsoluteResize] 初期位置が見つかりません: ${char.id}`);
                  return char;
                }
                
                const relativeStart = (initialPos.start - initialBlockStart) / initialBlockDuration;
                const relativeDuration = (initialPos.end - initialPos.start) / initialBlockDuration;
                
                const newCharStart = newBlockStart + (relativeStart * newBlockDuration);
                const newCharEnd = newCharStart + (relativeDuration * newBlockDuration);
                
                
                return {
                  ...char,
                  start: newCharStart,
                  end: newCharEnd
                };
              }
              return char;
            });
            return { ...word, chars: updatedChars };
          }
        });
        return { ...phrase, words: updatedWords };
      }
    });
  };

  /**
   * 選択されたマーカーをブロックとして一括リサイズする（レガシー版）
   */
  const applyResizeToSelectedMarkers = (
    currentLyrics: PhraseUnit[],
    selectedIds: string[],
    level: MarkerLevel,
    operationType: 'resizeLeft' | 'resizeRight',
    triggeredMarkerId: string,
    deltaMs: number
  ): PhraseUnit[] => {
    // 選択されたマーカーの範囲を取得
    const selectedMarkers = getSelectedMarkersData(currentLyrics, selectedIds, level);
    if (selectedMarkers.length === 0) return currentLyrics;

    const blockStart = Math.min(...selectedMarkers.map(m => m.start));
    const blockEnd = Math.max(...selectedMarkers.map(m => m.end));
    const originalBlockDuration = blockEnd - blockStart;
    
    // リサイズ後のブロック範囲を計算
    let newBlockStart = blockStart;
    let newBlockEnd = blockEnd;
    
    if (operationType === 'resizeLeft') {
      // 左リサイズ：右端固定、左端変更
      newBlockStart = blockStart + deltaMs;
    } else {
      // 右リサイズ：左端固定、右端変更
      newBlockEnd = blockEnd + deltaMs;
    }
    
    const newBlockDuration = newBlockEnd - newBlockStart;
    const scaleFactor = originalBlockDuration > 0 ? newBlockDuration / originalBlockDuration : 1;
    
    // デバッグログ
    if (import.meta.env.DEV) {
      console.log(`[ResizeToSelectedMarkers] operation: ${operationType}, deltaMs: ${deltaMs.toFixed(1)}, blockStart: ${blockStart} → ${newBlockStart}, blockEnd: ${blockEnd} → ${newBlockEnd}, scaleFactor: ${scaleFactor.toFixed(3)}`);
    }
    
    // 各マーカーをブロック内で比例スケーリング
    return currentLyrics.map(phrase => {
      if (level === 'phrase' && selectedIds.includes(phrase.id)) {
        const relativeStart = (phrase.start - blockStart) / originalBlockDuration;
        const relativeDuration = (phrase.end - phrase.start) / originalBlockDuration;
        
        const newPhraseStart = newBlockStart + (relativeStart * newBlockDuration);
        const newPhraseEnd = newPhraseStart + (relativeDuration * newBlockDuration);
        
        return {
          ...phrase,
          start: newPhraseStart,
          end: newPhraseEnd,
          words: phrase.words.map(word => {
            const wordRelativeStart = (word.start - phrase.start) / (phrase.end - phrase.start);
            const wordRelativeDuration = (word.end - word.start) / (phrase.end - phrase.start);
            
            const newWordStart = newPhraseStart + (wordRelativeStart * (newPhraseEnd - newPhraseStart));
            const newWordEnd = newWordStart + (wordRelativeDuration * (newPhraseEnd - newPhraseStart));
            
            return {
              ...word,
              start: newWordStart,
              end: newWordEnd,
              chars: word.chars.map(char => {
                const charRelativeStart = (char.start - word.start) / (word.end - word.start);
                const charRelativeDuration = (char.end - char.start) / (word.end - word.start);
                
                return {
                  ...char,
                  start: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)),
                  end: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)) + (charRelativeDuration * (newWordEnd - newWordStart))
                };
              })
            };
          })
        };
      } else {
        // 単語や文字レベルの処理も同様に実装
        const updatedWords = phrase.words.map(word => {
          if (level === 'word' && selectedIds.includes(word.id)) {
            const relativeStart = (word.start - blockStart) / originalBlockDuration;
            const relativeDuration = (word.end - word.start) / originalBlockDuration;
            
            const newWordStart = newBlockStart + (relativeStart * newBlockDuration);
            const newWordEnd = newWordStart + (relativeDuration * newBlockDuration);
            
            return {
              ...word,
              start: newWordStart,
              end: newWordEnd,
              chars: word.chars.map(char => {
                const charRelativeStart = (char.start - word.start) / (word.end - word.start);
                const charRelativeDuration = (char.end - char.start) / (word.end - word.start);
                
                return {
                  ...char,
                  start: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)),
                  end: newWordStart + (charRelativeStart * (newWordEnd - newWordStart)) + (charRelativeDuration * (newWordEnd - newWordStart))
                };
              })
            };
          } else {
            const updatedChars = word.chars.map(char => {
              if (level === 'char' && selectedIds.includes(char.id)) {
                const relativeStart = (char.start - blockStart) / originalBlockDuration;
                const relativeDuration = (char.end - char.start) / originalBlockDuration;
                
                return {
                  ...char,
                  start: newBlockStart + (relativeStart * newBlockDuration),
                  end: newBlockStart + (relativeStart * newBlockDuration) + (relativeDuration * newBlockDuration)
                };
              }
              return char;
            });
            return { ...word, chars: updatedChars };
          }
        });
        return { ...phrase, words: updatedWords };
      }
    });
  };

  /**
   * 選択されたマーカーのデータを取得する
   */
  const getSelectedMarkersData = (
    currentLyrics: PhraseUnit[],
    selectedIds: string[],
    level: MarkerLevel
  ): Array<{ id: string; start: number; end: number }> => {
    const markers: Array<{ id: string; start: number; end: number }> = [];
    
    currentLyrics.forEach(phrase => {
      if (level === 'phrase' && selectedIds.includes(phrase.id)) {
        markers.push({ id: phrase.id, start: phrase.start, end: phrase.end });
      }
      
      phrase.words.forEach(word => {
        if (level === 'word' && selectedIds.includes(word.id)) {
          markers.push({ id: word.id, start: word.start, end: word.end });
        }
        
        word.chars.forEach(char => {
          if (level === 'char' && selectedIds.includes(char.id)) {
            markers.push({ id: char.id, start: char.start, end: char.end });
          }
        });
      });
    });
    
    return markers;
  };

  /**
   * マーカー更新ハンドラー（単一選択時）
   */
  const handleMarkerUpdate = (level: MarkerLevel) => (updatedUnit: PhraseUnit | WordUnit | CharUnit) => {
    const updatedLyrics = [...lyrics];
    
    if (level === 'phrase') {
      const phraseIndex = updatedLyrics.findIndex(p => p.id === updatedUnit.id);
      if (phraseIndex !== -1) {
        updatedLyrics[phraseIndex] = updatedUnit as PhraseUnit;
      }
    } else if (level === 'word') {
      for (let phraseIndex = 0; phraseIndex < updatedLyrics.length; phraseIndex++) {
        const wordIndex = updatedLyrics[phraseIndex].words.findIndex(w => w.id === updatedUnit.id);
        if (wordIndex !== -1) {
          updatedLyrics[phraseIndex].words[wordIndex] = updatedUnit as WordUnit;
          break;
        }
      }
    } else if (level === 'char') {
      for (let phraseIndex = 0; phraseIndex < updatedLyrics.length; phraseIndex++) {
        for (let wordIndex = 0; wordIndex < updatedLyrics[phraseIndex].words.length; wordIndex++) {
          const charIndex = updatedLyrics[phraseIndex].words[wordIndex].chars.findIndex(c => c.id === updatedUnit.id);
          if (charIndex !== -1) {
            updatedLyrics[phraseIndex].words[wordIndex].chars[charIndex] = updatedUnit as CharUnit;
            break;
          }
        }
      }
    }

    updateLyricsWithEngine(updatedLyrics, `${level}マーカー操作`);
  };

  /**
   * ドラッグ開始ハンドラー（改良版）
   */
  const handleDragStart = (unitId: string, operationType: string) => {
    saveUndoState(operationType, unitId);
    
    // 新しいドラッグ状態をリセット
    const dragState = multiDragStateRef.current;
    dragState.isActive = false;
    dragState.operationType = null;
    dragState.selectedIds = [];
    dragState.selectedLevel = null;
    dragState.initialPositions.clear();
    dragState.totalDeltaMs = 0;
    dragState.lastUpdateTime = 0;
    dragState.isLocked = false;
    
    // レガシー状態もリセット
    setCurrentDragMarkerId(null);
    dragThrottleRef.current = 0;
    multiUpdateLockRef.current = false;
    lastOperationRef.current = null;
    
    if (import.meta.env.DEV) {
      console.log(`[DragStart] ${unitId} (${operationType}) - 状態リセット完了`);
    }
  };

  // リサイズ監視
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth);
      }
    };
    
    updateWidth();
    
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    
    return () => observer.disconnect();
  }, []);

  // 歌詞データの読み込み
  useEffect(() => {
    if (engine) {
      const { lyrics: engineLyrics } = engine.getTimelineData();
      console.log('TimelinePanel: 歌詞データを取得しました');
      setLyrics(JSON.parse(JSON.stringify(engineLyrics)));
      
      const handleTimelineUpdated = (event: CustomEvent) => {
        setLyrics(JSON.parse(JSON.stringify(event.detail.lyrics)));
      };
      
      // アクティベーション状態の変更をリスン
      const handleObjectsActivated = () => {
        // マーカーの再レンダリングをトリガーするために状態を更新
        setLyrics(prev => [...prev]);
      };
      
      const handleObjectsDeactivated = () => {
        // マーカーの再レンダリングをトリガーするために状態を更新
        setLyrics(prev => [...prev]);
      };
      
      window.addEventListener('timeline-updated', handleTimelineUpdated as EventListener);
      window.addEventListener('objects-activated', handleObjectsActivated as EventListener);
      window.addEventListener('objects-deactivated', handleObjectsDeactivated as EventListener);
      
      return () => {
        window.removeEventListener('timeline-updated', handleTimelineUpdated as EventListener);
        window.removeEventListener('objects-activated', handleObjectsActivated as EventListener);
        window.removeEventListener('objects-deactivated', handleObjectsDeactivated as EventListener);
      };
    } else {
      console.warn('TimelinePanel: Engine インスタンスが利用できません。モックデータを使用します。');
      
      // モックデータ
      const mockLyrics: PhraseUnit[] = [
        {
          id: 'phrase_0',
          phrase: 'こんにちは 世界',
          start: 1000,
          end: 5000,
          words: [
            {
              id: 'phrase_0_word_0',
              word: 'こんにちは',
              start: 1000,
              end: 3000,
              chars: [
                { id: 'phrase_0_word_0_char_0', char: 'こ', start: 1000, end: 1400 },
                { id: 'phrase_0_word_0_char_1', char: 'ん', start: 1400, end: 1800 },
                { id: 'phrase_0_word_0_char_2', char: 'に', start: 1800, end: 2200 },
                { id: 'phrase_0_word_0_char_3', char: 'ち', start: 2200, end: 2600 },
                { id: 'phrase_0_word_0_char_4', char: 'は', start: 2600, end: 3000 }
              ]
            },
            {
              id: 'phrase_0_word_1',
              word: '世界',
              start: 3000,
              end: 5000,
              chars: [
                { id: 'phrase_0_word_1_char_0', char: '世', start: 3000, end: 4000 },
                { id: 'phrase_0_word_1_char_1', char: '界', start: 4000, end: 5000 }
              ]
            }
          ]
        },
        {
          id: 'phrase_1',
          phrase: 'テスト フレーズ',
          start: 6000,
          end: 10000,
          words: [
            {
              id: 'phrase_1_word_0',
              word: 'テスト',
              start: 6000,
              end: 8000,
              chars: [
                { id: 'phrase_1_word_0_char_0', char: 'テ', start: 6000, end: 6666 },
                { id: 'phrase_1_word_0_char_1', char: 'ス', start: 6666, end: 7333 },
                { id: 'phrase_1_word_0_char_2', char: 'ト', start: 7333, end: 8000 }
              ]
            },
            {
              id: 'phrase_1_word_1',
              word: 'フレーズ',
              start: 8000,
              end: 10000,
              chars: [
                { id: 'phrase_1_word_1_char_0', char: 'フ', start: 8000, end: 8500 },
                { id: 'phrase_1_word_1_char_1', char: 'レ', start: 8500, end: 9000 },
                { id: 'phrase_1_word_1_char_2', char: 'ー', start: 9000, end: 9500 },
                { id: 'phrase_1_word_1_char_3', char: 'ズ', start: 9500, end: 10000 }
              ]
            }
          ]
        }
      ];
      
      setLyrics(mockLyrics);
    }
  }, [engine, totalDuration]);

  // 現在の時間位置のマーカー
  const currentTimePosition = (currentTime / duration) * timelineWidth;
  
  // 現在の再生位置に自動スクロール
  useEffect(() => {
    if (timelineAreaRef.current) {
      const scrollContainer = timelineAreaRef.current;
      const containerWidth = scrollContainer.clientWidth;
      const scrollLeft = scrollContainer.scrollLeft;
      const scrollRight = scrollLeft + containerWidth;
      
      if (currentTimePosition < scrollLeft || currentTimePosition > scrollRight - 50) {
        const targetScroll = Math.max(0, Math.min(
          currentTimePosition - containerWidth / 2,
          timelineWidth - containerWidth
        ));
        scrollContainer.scrollTo({
          left: targetScroll,
          behavior: 'smooth'
        });
      }
    }
  }, [currentTimePosition, timelineWidth]);

  // フォースアップデート
  const forceUpdate = () => {
    if (engine) {
      const { lyrics: engineLyrics } = engine.getTimelineData();
      console.log('TimelinePanel: 最新データ');
      console.log(engineLyrics);
      setLyrics([...engineLyrics]);
    }
  };

  // タイムラインエリアでのマウスダウン（ドラッグ選択開始）
  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.hierarchical-marker')) {
      return;
    }
    
    if (!e.shiftKey) {
      setSelectionState({
        selectedIds: [],
        selectedLevel: null,
        lastSelectedId: null
      });
    }
    
    const timelineRect = timelineAreaRef.current?.getBoundingClientRect();
    if (!timelineRect) return;
    
    const scrollLeft = timelineAreaRef.current?.scrollLeft || 0;
    const scrollTop = timelineAreaRef.current?.scrollTop || 0;
    
    const relativeX = e.clientX - timelineRect.left + scrollLeft;
    const relativeY = e.clientY - timelineRect.top + scrollTop;
    
    setIsDragSelecting(true);
    setDragStart({ x: relativeX, y: relativeY });
    setDragEnd({ x: relativeX, y: relativeY });
  };

  const handleTimelineMouseMove = (e: React.MouseEvent) => {
    if (isDragSelecting) {
      const timelineRect = timelineAreaRef.current?.getBoundingClientRect();
      if (!timelineRect) return;
      
      const scrollLeft = timelineAreaRef.current?.scrollLeft || 0;
      const scrollTop = timelineAreaRef.current?.scrollTop || 0;
      
      const relativeX = e.clientX - timelineRect.left + scrollLeft;
      const relativeY = e.clientY - timelineRect.top + scrollTop;
      
      setDragEnd({ x: relativeX, y: relativeY });
    }
  };

  const handleTimelineMouseUp = (e: React.MouseEvent) => {
    if (isDragSelecting) {
      // ドラッグ選択の範囲内のマーカーを選択する処理
      const minX = Math.min(dragStart.x, dragEnd.x);
      const maxX = Math.max(dragStart.x, dragEnd.x);
      const minY = Math.min(dragStart.y, dragEnd.y);
      const maxY = Math.max(dragStart.y, dragEnd.y);
      
      // 小さなドラッグ（クリックとみなせる範囲）は無視
      if (Math.abs(maxX - minX) < 5 && Math.abs(maxY - minY) < 5) {
        setIsDragSelecting(false);
        return;
      }
      
      // 行の高さと位置を取得
      const timelineRect = timelineAreaRef.current?.getBoundingClientRect();
      if (!timelineRect) {
        setIsDragSelecting(false);
        return;
      }
      
      // 各行の要素を取得
      const phraseRowElement = timelineAreaRef.current?.querySelector('.phrase-row');
      const wordRowElement = timelineAreaRef.current?.querySelector('.word-row');
      const charRowElement = timelineAreaRef.current?.querySelector('.char-row');
      
      if (!phraseRowElement || !wordRowElement || !charRowElement) {
        console.error('行要素が見つかりません');
        setIsDragSelecting(false);
        return;
      }
      
      // 各行のタイムラインエリア内での相対位置を計算
      const timelineTop = timelineAreaRef.current!.offsetTop;
      const scrollTop = timelineAreaRef.current!.scrollTop;
      
      const phraseRowTop = (phraseRowElement as HTMLElement).offsetTop - timelineTop + scrollTop;
      const phraseRowBottom = phraseRowTop + (phraseRowElement as HTMLElement).offsetHeight;
      
      const wordRowTop = (wordRowElement as HTMLElement).offsetTop - timelineTop + scrollTop;
      const wordRowBottom = wordRowTop + (wordRowElement as HTMLElement).offsetHeight;
      
      const charRowTop = (charRowElement as HTMLElement).offsetTop - timelineTop + scrollTop;
      const charRowBottom = charRowTop + (charRowElement as HTMLElement).offsetHeight;
      
      // ドラッグ範囲の重心を計算
      const centerY = (minY + maxY) / 2;
      
      // 重心がどの行にあるかで排他的に判定
      let targetLevel: MarkerLevel | null = null;
      
      if (centerY >= phraseRowTop && centerY <= phraseRowBottom) {
        targetLevel = 'phrase';
      } else if (centerY >= wordRowTop && centerY <= wordRowBottom) {
        targetLevel = 'word';
      } else if (centerY >= charRowTop && centerY <= charRowBottom) {
        targetLevel = 'char';
      }
      
      console.log('選択された行:', targetLevel);
      
      let selectedIds: string[] = [];
      
      // 判定された行に基づいて選択処理
      if (targetLevel === 'phrase') {
        const selectedPhrasesInRange = lyrics.filter(phrase => {
          const phraseStartX = (phrase.start / duration) * timelineWidth;
          const phraseEndX = (phrase.end / duration) * timelineWidth;
          
          // 重なりがあるかチェック
          return (phraseEndX >= minX && phraseStartX <= maxX);
        });
        
        selectedIds = selectedPhrasesInRange.map(p => p.id);
        
      } else if (targetLevel === 'word') {
        const selectedWordsInRange = lyrics.flatMap(phrase => 
          phrase.words.filter(word => {
            const wordStartX = (word.start / duration) * timelineWidth;
            const wordEndX = (word.end / duration) * timelineWidth;
            
            return (wordEndX >= minX && wordStartX <= maxX);
          })
        );
        
        selectedIds = selectedWordsInRange.map(w => w.id);
        
      } else if (targetLevel === 'char') {
        const selectedCharsInRange = lyrics.flatMap(phrase => 
          phrase.words.flatMap(word => 
            word.chars.filter(char => {
              const charStartX = (char.start / duration) * timelineWidth;
              const charEndX = (char.end / duration) * timelineWidth;
              
              return (charEndX >= minX && charStartX <= maxX);
            })
          )
        );
        
        selectedIds = selectedCharsInRange.map(c => c.id);
      }
      
      // 選択された要素がある場合のみ処理
      if (selectedIds.length > 0 && targetLevel) {
        // Shiftキーが押されていれば追加選択、押されていなければ新規選択
        if (e.shiftKey) {
          // 追加選択の場合
          if (selectionState.selectedLevel === targetLevel || selectionState.selectedLevel === null) {
            // 同じレベルまたは初回選択の場合
            const newIds = [...selectionState.selectedIds];
            selectedIds.forEach(id => {
              if (!newIds.includes(id)) {
                newIds.push(id);
              }
            });
            handleSelectionChange(newIds, targetLevel, false);
          } else {
            // 異なるレベルの場合は新規選択
            handleSelectionChange(selectedIds, targetLevel, false);
          }
        } else {
          // 新規選択
          handleSelectionChange(selectedIds, targetLevel, false);
        }
      }
      
      setIsDragSelecting(false);
    }
    
    // ドラッグ終了時に全ての状態をリセット
    const dragState = multiDragStateRef.current;
    dragState.isActive = false;
    dragState.operationType = null;
    dragState.selectedIds = [];
    dragState.selectedLevel = null;
    dragState.initialPositions.clear();
    dragState.totalDeltaMs = 0;
    dragState.lastUpdateTime = 0;
    dragState.isLocked = false;
    
    // レガシーも同時にリセット
    setCurrentDragMarkerId(null);
    dragThrottleRef.current = 0;
    multiUpdateLockRef.current = false;
    lastOperationRef.current = null;
    
    if (import.meta.env.DEV) {
      console.log(`[DragEnd] 全状態リセット完了`);
    }
  };

  return (
    <div className="timeline-panel" ref={containerRef}>
      <div 
        className="timeline-area three-rows" 
        ref={timelineAreaRef}
        onMouseDown={handleTimelineMouseDown}
        onMouseMove={handleTimelineMouseMove}
        onMouseUp={handleTimelineMouseUp}
        onMouseLeave={() => {
          if (isDragSelecting) {
            setIsDragSelecting(false);
          }
          // ドラッグ終了時に全ての状態をリセット
          const dragState = multiDragStateRef.current;
          dragState.isActive = false;
          dragState.operationType = null;
          dragState.selectedIds = [];
          dragState.selectedLevel = null;
          dragState.initialPositions.clear();
          dragState.totalDeltaMs = 0;
          dragState.lastUpdateTime = 0;
          dragState.isLocked = false;
          
          // レガシーも同時にリセット
          setCurrentDragMarkerId(null);
          dragThrottleRef.current = 0;
          multiUpdateLockRef.current = false;
          lastOperationRef.current = null;
        }}
      >
        <div className="timeline-content" style={{ width: `${timelineWidth}px`, position: 'relative' }}>
          {/* 波形表示 */}
          <div className="waveform-wrapper">
            <WaveformPanel 
              currentTime={currentTime} 
              totalDuration={duration}
              viewStart={externalViewStart ?? 0}
              viewDuration={externalViewDuration}
              engine={engine}
            />
          </div>
          
          {/* 現在時間のマーカー */}
          <div 
            className="current-time-marker"
            style={{ 
              ...getCurrentTimeMarkerStyle(),
              left: `${currentTimePosition}px`,
            }}
          />
          
          {/* フレーズ行 */}
          <div className="row phrase-row">
            {lyrics.map(phrase => {
              const isSelected = selectionState.selectedIds.includes(phrase.id) && selectionState.selectedLevel === 'phrase';
              const isMultiSelected = selectionState.selectedIds.length > 1 && selectionState.selectedLevel === 'phrase' && isSelected;
              
              // 複数選択時の左端・右端マーカー判定
              let isLeftOuterMarker = false;
              let isRightOuterMarker = false;
              
              if (isMultiSelected) {
                const selectedPhrases = lyrics.filter(p => selectionState.selectedIds.includes(p.id));
                const leftmostPhrase = selectedPhrases.reduce((prev, curr) => 
                  prev.start < curr.start ? prev : curr
                );
                const rightmostPhrase = selectedPhrases.reduce((prev, curr) => 
                  prev.end > curr.end ? prev : curr
                );
                
                isLeftOuterMarker = phrase.id === leftmostPhrase.id;
                isRightOuterMarker = phrase.id === rightmostPhrase.id;
              }
              
              const isActivated = engine?.parameterManager?.isObjectActivated(phrase.id) || false;
              
              return (
                <HierarchicalMarker
                  key={phrase.id}
                  unit={phrase}
                  level="phrase"
                  duration={duration}
                  timelineWidth={timelineWidth}
                  isSelected={isSelected}
                  multiSelected={isMultiSelected}
                  isLeftOuterMarker={isLeftOuterMarker}
                  isRightOuterMarker={isRightOuterMarker}
                  isActivated={isActivated}
                  onUpdate={handleMarkerUpdate('phrase')}
                  onMultiUpdate={handleMultiUpdate}
                  onSelectionChange={handleSelectionChange}
                  onDragStart={handleDragStart}
                />
              );
            })}
          </div>
          
          {/* 単語行 */}
          <div className="row word-row">
            {lyrics.flatMap(phrase =>
              phrase.words.map(word => {
                const parentConstraints = {
                  minDuration: 100,
                  parentStart: phrase.start,
                  parentEnd: phrase.end
                };
                
                const isSelected = selectionState.selectedIds.includes(word.id) && selectionState.selectedLevel === 'word';
                const isMultiSelected = selectionState.selectedIds.length > 1 && selectionState.selectedLevel === 'word' && isSelected;
                
                // 複数選択時の左端・右端マーカー判定
                let isLeftOuterMarker = false;
                let isRightOuterMarker = false;
                
                if (isMultiSelected) {
                  const selectedWords = lyrics.flatMap(p => p.words)
                    .filter(w => selectionState.selectedIds.includes(w.id));
                  const leftmostWord = selectedWords.reduce((prev, curr) => 
                    prev.start < curr.start ? prev : curr
                  );
                  const rightmostWord = selectedWords.reduce((prev, curr) => 
                    prev.end > curr.end ? prev : curr
                  );
                  
                  isLeftOuterMarker = word.id === leftmostWord.id;
                  isRightOuterMarker = word.id === rightmostWord.id;
                }
                
                const isActivated = engine?.parameterManager?.isObjectActivated(word.id) || false;
                
                return (
                  <HierarchicalMarker
                    key={word.id}
                    unit={word}
                    level="word"
                    duration={duration}
                    timelineWidth={timelineWidth}
                    parentConstraints={parentConstraints}
                    isSelected={isSelected}
                    multiSelected={isMultiSelected}
                    isLeftOuterMarker={isLeftOuterMarker}
                    isRightOuterMarker={isRightOuterMarker}
                    isActivated={isActivated}
                    onUpdate={handleMarkerUpdate('word')}
                    onMultiUpdate={handleMultiUpdate}
                    onSelectionChange={handleSelectionChange}
                    onDragStart={handleDragStart}
                  />
                );
              })
            )}
          </div>
          
          {/* 文字行 */}
          <div className="row char-row">
            {lyrics.flatMap(phrase =>
              phrase.words.flatMap(word =>
                word.chars.map(char => {
                  const parentConstraints = {
                    minDuration: 50,
                    parentStart: word.start,
                    parentEnd: word.end
                  };
                  
                  const isSelected = selectionState.selectedIds.includes(char.id) && selectionState.selectedLevel === 'char';
                  const isMultiSelected = selectionState.selectedIds.length > 1 && selectionState.selectedLevel === 'char' && isSelected;
                  
                  // 複数選択時の左端・右端マーカー判定
                  let isLeftOuterMarker = false;
                  let isRightOuterMarker = false;
                  
                  if (isMultiSelected) {
                    const selectedChars = lyrics.flatMap(p => 
                      p.words.flatMap(w => w.chars)
                    ).filter(c => selectionState.selectedIds.includes(c.id));
                    const leftmostChar = selectedChars.reduce((prev, curr) => 
                      prev.start < curr.start ? prev : curr
                    );
                    const rightmostChar = selectedChars.reduce((prev, curr) => 
                      prev.end > curr.end ? prev : curr
                    );
                    
                    isLeftOuterMarker = char.id === leftmostChar.id;
                    isRightOuterMarker = char.id === rightmostChar.id;
                  }
                  
                  const isActivated = engine?.parameterManager?.isObjectActivated(char.id) || false;
                  
                  return (
                    <HierarchicalMarker
                      key={char.id}
                      unit={char}
                      level="char"
                      duration={duration}
                      timelineWidth={timelineWidth}
                      parentConstraints={parentConstraints}
                      isSelected={isSelected}
                      multiSelected={isMultiSelected}
                      isLeftOuterMarker={isLeftOuterMarker}
                      isRightOuterMarker={isRightOuterMarker}
                      isActivated={isActivated}
                      onUpdate={handleMarkerUpdate('char')}
                      onMultiUpdate={handleMultiUpdate}
                      onSelectionChange={handleSelectionChange}
                      onDragStart={handleDragStart}
                    />
                  );
                })
              )
            )}
          </div>
          
          {/* 時間マーカー */}
          <div className="time-indicators">
            {(() => {
              const markers = [];
              const markerInterval = Math.max(1000, Math.floor(duration / 20));
              for (let time = 0; time <= duration; time += markerInterval) {
                const pixelPosition = (time / duration) * timelineWidth;
                markers.push(
                  <div 
                    key={time}
                    className="time-indicator"
                    style={{ 
                      ...getTimeIndicatorStyle(),
                      left: `${pixelPosition}px`,
                    }}
                  >
                    {formatTime(time)}
                  </div>
                );
              }
              return markers;
            })()}
          </div>
          
          {/* ドラッグ選択範囲表示 */}
          {isDragSelecting && (
            <div
              className="selection-rect"
              style={{
                ...getDragSelectionStyle(),
                left: `${Math.min(dragStart.x, dragEnd.x)}px`,
                top: `${Math.min(dragStart.y, dragEnd.y)}px`,
                width: `${Math.abs(dragEnd.x - dragStart.x)}px`,
                height: `${Math.abs(dragEnd.y - dragStart.y)}px`,
              }}
            />
          )}
          
          {/* 開発用：デバッグボタン */}
          {import.meta.env.DEV && (
            <button 
              onClick={forceUpdate}
              style={{
                position: 'absolute',
                right: '10px',
                top: '10px',
                zIndex: 1000,
                padding: '4px 8px',
                background: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '10px'
              }}
            >
              強制更新
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 時間をmm:ss形式にフォーマット
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default TimelinePanel;