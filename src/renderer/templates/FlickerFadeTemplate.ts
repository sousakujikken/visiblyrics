import * as PIXI from 'pixi.js';
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata } from '../types/types';
import { FontService } from '../services/FontService';

/**
 * イージング関数（ユーティリティ）
 */

/**
 * 二次イージング（イン・アウト）：滑らかな変化
 */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * 三次イージング（アウト）：早い→遅い
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 線形補間関数
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 文字が半角文字かどうかを判定
 */
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 文字別アニメーション状態インターフェース
 */
interface CharacterAnimationState {
  flickerStartTime: number;    // 点滅開始時刻（ランダム）
  flickerDuration: number;     // 点滅継続時間
  fadeInCompleteTime: number;  // フェードイン完了時刻
  fadeOutStartTime: number;    // フェードアウト開始時刻（ランダム）
  fadeOutDuration: number;     // フェードアウト継続時間（ランダム）
}

/**
 * フレーズ位置管理用のインターフェース
 */
interface PhrasePosition {
  x: number;
  y: number;
  startTime: number;
  endTime: number;
  lineIndex: number;
}

// フレーズ位置履歴マップ
const phrasePositionHistory = new Map<string, PhrasePosition>();

/**
 * フレーズの総幅を計算する関数
 */
function calculatePhraseWidth(text: string, fontSize: number, charSpacing: number): number {
  let totalWidth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
    totalWidth += fontSize * effectiveSpacing;
  }
  return totalWidth;
}

/**
 * 近接フレーズを検出し、適切な行インデックスを決定する関数
 */
function calculateLineIndex(
  currentPhraseId: string,
  currentStartMs: number,
  currentEndMs: number,
  overlapThreshold: number
): number {
  // 既存のフレーズとの時間的重複をチェック
  const overlappingPhrases: PhrasePosition[] = [];
  
  for (const [phraseId, position] of phrasePositionHistory.entries()) {
    if (phraseId === currentPhraseId) continue;
    
    // 時間的重複の判定
    const isOverlapping = !(currentEndMs <= position.startTime || currentStartMs >= position.endTime);
    
    if (isOverlapping) {
      overlappingPhrases.push(position);
    }
  }
  
  // 既存の行インデックスから空いている最小の行を見つける
  const usedLineIndices = overlappingPhrases.map(p => p.lineIndex).sort((a, b) => a - b);
  
  let lineIndex = 0;
  for (const usedIndex of usedLineIndices) {
    if (lineIndex === usedIndex) {
      lineIndex++;
    } else {
      break;
    }
  }
  
  return lineIndex;
}

/**
 * FlickerFade テンプレート
 * フレーズ全体を画面中心に配置し、複数フレーズが近接する場合はY座標をシフト
 * 文字がランダムに点滅しながらフェードイン/アウトするエフェクト
 * 完全表示状態では点滅を停止し、動的周波数制御により滑らかな変化を実現
 */
export const FlickerFadeTemplate: IAnimationTemplate = {
  // テンプレートメタデータ
  metadata: {
    name: "FlickerFadeTemplate",
    version: "1.0.0",
    description: "フレーズ全体を画面中心に配置し、文字がランダムに点滅しながらフェードイン/アウトするテンプレート。動的周波数制御と完全表示状態での点滅停止機能を提供します。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Claude AI Assistant",
      contribution: "FlickerFadeTemplateの初期実装",
      date: "2025-06-15"
    },
    contributors: []
  } as TemplateMetadata,

  // 動的パラメータ取得メソッド
  getParameterConfig(): any[] {
    return [
      // 基本パラメータ
      { name: "fontSize", type: "number", default: 120, min: 12, max: 256, step: 1 },
      { 
        name: "fontFamily", 
        type: "string", 
        default: "Arial",
        get options() {
          return FontService.getAvailableFonts();
        }
      },
      
      // 色設定
      { name: "defaultTextColor", type: "color", default: "#808080" },
      { name: "activeTextColor", type: "color", default: "#FFFF80" },
      { name: "completedTextColor", type: "color", default: "#FFF7EB" },
      
      // フレーズ配置設定
      { name: "phraseOverlapThreshold", type: "number", default: 1000, min: 0, max: 5000, step: 100 },
      { name: "lineHeight", type: "number", default: 150, min: 50, max: 400, step: 10 },
      { name: "phraseOffsetX", type: "number", default: 0, min: -500, max: 500, step: 10 },
      { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 10 },
      
      // 点滅エフェクト設定
      { name: "preInDuration", type: "number", default: 1500, min: 500, max: 5000, step: 100 },
      { name: "flickerMinFrequency", type: "number", default: 2, min: 0.5, max: 10, step: 0.5 },
      { name: "flickerMaxFrequency", type: "number", default: 15, min: 5, max: 30, step: 1 },
      { name: "flickerIntensity", type: "number", default: 0.8, min: 0, max: 1, step: 0.1 },
      { name: "flickerRandomness", type: "number", default: 0.7, min: 0, max: 1, step: 0.1 },
      { name: "frequencyLerpSpeed", type: "number", default: 0.15, min: 0.01, max: 1, step: 0.01 },
      
      // フェード制御
      { name: "fadeInVariation", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "fadeOutVariation", type: "number", default: 800, min: 0, max: 2000, step: 50 },
      { name: "fadeOutDuration", type: "number", default: 1000, min: 200, max: 3000, step: 100 },
      { name: "fullDisplayThreshold", type: "number", default: 0.85, min: 0.5, max: 1, step: 0.05 },
      
      // 文字間隔
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      
      // Glowエフェクト設定
      { name: "enableGlow", type: "boolean", default: true },
      { name: "glowStrength", type: "number", default: 1.5, min: 0, max: 5, step: 0.1 },
      { name: "glowBrightness", type: "number", default: 1.2, min: 0.5, max: 3, step: 0.1 },
      { name: "glowBlur", type: "number", default: 6, min: 0.1, max: 20, step: 0.1 },
      { name: "glowQuality", type: "number", default: 8, min: 0.1, max: 20, step: 0.1 },
      { name: "glowPadding", type: "number", default: 50, min: 0, max: 200, step: 10 }
    ];
  },

  /**
   * 表示要素のみを削除するメソッド
   */
  removeVisualElements(container: PIXI.Container): void {
    const childrenToKeep: PIXI.DisplayObject[] = [];
    const childrenToRemove: PIXI.DisplayObject[] = [];
    
    container.children.forEach(child => {
      if (child instanceof PIXI.Container && 
          (child as any).name && 
          ((child as any).name.includes('phrase_container_') || 
           (child as any).name.includes('word_container_') || 
           (child as any).name.includes('char_container_'))) {
        childrenToKeep.push(child);
      } else {
        childrenToRemove.push(child);
      }
    });
    
    childrenToRemove.forEach(child => {
      container.removeChild(child);
      if (child instanceof PIXI.Container) {
        child.destroy({ children: true });
      } else {
        child.destroy();
      }
    });
  },

  /**
   * 階層対応のアニメーションメソッド
   */
  animateContainer(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,
    phase: AnimationPhase
  ): boolean {
    const textContent = Array.isArray(text) ? text.join('') : text;
    
    container.visible = true;
    this.removeVisualElements!(container);
    
    let rendered = false;
    switch (hierarchyType) {
      case 'phrase':
        rendered = this.renderPhraseContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'word':
        rendered = this.renderWordContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
      case 'char':
        rendered = this.renderCharContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
        break;
    }
    
    return rendered;
  },

  /**
   * フレーズコンテナの描画
   * 画面中央に配置し、複数フレーズが近接している場合はY座標をシフト
   */
  renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    // パラメータの取得
    const phraseOverlapThreshold = params.phraseOverlapThreshold as number || 1000;
    const lineHeight = params.lineHeight as number || 150;
    const phraseOffsetX = params.phraseOffsetX as number || 0;
    const phraseOffsetY = params.phraseOffsetY as number || 0;
    const fontSize = params.fontSize as number || 120;
    const charSpacing = params.charSpacing as number || 1.0;
    const enableGlow = params.enableGlow as boolean ?? true;
    const glowStrength = params.glowStrength as number || 1.5;
    const glowBrightness = params.glowBrightness as number || 1.2;
    const glowBlur = params.glowBlur as number || 6;
    const glowQuality = params.glowQuality as number || 8;
    const glowPadding = params.glowPadding as number || 50;

    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      container.position.set(0, 0);
      return true;
    }

    const screenWidth = app.renderer.width;
    const screenHeight = app.renderer.height;

    // フレーズIDの取得
    const phraseId = params.phraseId as string || params.id as string || `phrase_${startMs}_${text.substring(0, 10)}`;

    // フレーズの総幅を計算
    const phraseWidth = calculatePhraseWidth(text, fontSize, charSpacing);

    // 適切な行インデックスを決定
    const lineIndex = calculateLineIndex(phraseId, startMs, endMs, phraseOverlapThreshold);

    // デバッグログ：行インデックスの確認（初回のみ）
    if (!phrasePositionHistory.has(phraseId)) {
      console.log('[FlickerFadeTemplate] New phrase:', {
        phraseId,
        text: text.substring(0, 20) + '...',
        lineIndex,
        existingPhrases: phrasePositionHistory.size
      });
    }

    // フレーズの基準位置計算（画面中央、幅を考慮して左に半分オフセット）
    let centerX = (screenWidth - phraseWidth) / 2 + phraseOffsetX;
    let centerY = screenHeight / 2 + phraseOffsetY + (lineIndex * lineHeight);

    // フレーズ位置を履歴に記録
    phrasePositionHistory.set(phraseId, { 
      x: centerX, 
      y: centerY, 
      startTime: startMs,
      endTime: endMs,
      lineIndex: lineIndex
    });

    // Glowエフェクトの適用
    if (enableGlow) {
      container.filterArea = new PIXI.Rectangle(
        -glowPadding,
        -glowPadding,
        screenWidth + glowPadding * 2,
        screenHeight + glowPadding * 2
      );

      const hasBloomFilter = container.filters && 
        container.filters.some(filter => filter instanceof AdvancedBloomFilter);

      if (!hasBloomFilter) {
        const bloomFilter = new AdvancedBloomFilter({
          threshold: 0.2,
          bloomScale: glowStrength,
          brightness: glowBrightness,
          blur: glowBlur,
          quality: glowQuality,
          kernels: null,
          pixelSize: { x: 1, y: 1 }
        });

        container.filters = container.filters || [];
        container.filters.push(bloomFilter);
      } else {
        const bloomFilter = container.filters.find(filter => filter instanceof AdvancedBloomFilter) as AdvancedBloomFilter;
        if (bloomFilter) {
          bloomFilter.bloomScale = glowStrength;
          bloomFilter.brightness = glowBrightness;
          bloomFilter.blur = glowBlur;
          bloomFilter.quality = glowQuality;
        }
      }
    } else {
      if (container.filters) {
        container.filters = container.filters.filter(filter => !(filter instanceof AdvancedBloomFilter));
        if (container.filters.length === 0) {
          container.filters = null;
        }
      }
      container.filterArea = null;
    }

    // フレーズコンテナを配置
    container.position.set(centerX, centerY);
    container.alpha = 1.0;
    container.visible = true;
    container.updateTransform();

    // 単語コンテナの管理
    if (params.words && Array.isArray(params.words)) {
      let cumulativeWidth = 0;
      
      (params.words as any[]).forEach((wordData: any, index: number) => {
        // 既存の単語コンテナを検索
        let wordContainer: PIXI.Container | null = null;
        
        container.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && 
              (child as any).name === `word_container_${wordData.id}`) {
            wordContainer = child as PIXI.Container;
          }
        });

        // 存在しない場合は新規作成
        if (!wordContainer) {
          wordContainer = new PIXI.Container();
          (wordContainer as any).name = `word_container_${wordData.id}`;
          container.addChild(wordContainer);
        }

        // 単語の累積幅を計算して位置設定
        const wordWidth = calculatePhraseWidth(wordData.word, fontSize, charSpacing);
        
        // 単語コンテナにメタデータを保存
        (wordContainer as any).__wordOffsetX = cumulativeWidth;
        (wordContainer as any).__wordIndex = index;
        (wordContainer as any).__totalWords = params.words.length;
        
        // 単語アニメーションの適用
        this.animateContainer!(
          wordContainer,
          wordData.word,
          {
            ...params,
            id: wordData.id,
            wordIndex: index,
            totalWords: params.words.length,
            previousWordsWidth: cumulativeWidth,
            chars: wordData.chars
          },
          nowMs,
          wordData.start,
          wordData.end,
          'word',
          phase
        );
        
        // 次の単語のために累積幅を更新
        cumulativeWidth += wordWidth;
      });
    }

    return true;
  },

  /**
   * 単語コンテナの描画
   * 単語間でのX座標連続配置を管理
   */
  renderWordContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    const fontSize = params.fontSize as number || 120;
    const charSpacing = params.charSpacing as number || 1.0;
    const enableGlow = params.enableGlow as boolean ?? true;
    const glowPadding = params.glowPadding as number || 50;

    // デバッグログ：最初の単語のみ確認
    if (params.wordIndex === 0) {
      console.log('[FlickerFadeTemplate] First word params:', {
        text,
        wordIndex: params.wordIndex,
        totalWords: params.totalWords,
        previousWordsWidth: params.previousWordsWidth
      });
    }

    // 単語インデックスと総単語数を取得
    const wordIndex = params.wordIndex as number || 0;
    const totalWords = params.totalWords as number || 1;

    // フレーズ内での単語の累積X座標オフセットを計算
    let wordOffsetX = 0;
    
    // previousWordsWidthがパラメータで渡されていればそれを使用
    if (params.previousWordsWidth !== undefined) {
      wordOffsetX = params.previousWordsWidth as number;
    } else {
      console.warn('[FlickerFadeTemplate] previousWordsWidth not found in params');
    }

    // 単語コンテナの基本設定（フレーズ内での位置）
    container.position.set(wordOffsetX, 0);
    container.alpha = 1.0;
    container.visible = true;

    // Glowエフェクト用のフィルターエリア設定
    if (enableGlow) {
      let totalWidth = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
        totalWidth += fontSize * effectiveSpacing;
      }
      const wordWidth = totalWidth + glowPadding * 2;
      const wordHeight = fontSize + glowPadding * 2;

      container.filterArea = new PIXI.Rectangle(
        -glowPadding,
        -glowPadding,
        wordWidth,
        wordHeight
      );
    } else {
      container.filterArea = null;
    }

    // 文字コンテナの管理
    if (params.chars && Array.isArray(params.chars)) {
      let cumulativeXOffset = 0;

      (params.chars as any[]).forEach((charData: any) => {
        // 既存の文字コンテナを検索
        let charContainer: PIXI.Container | null = null;
        
        container.children.forEach((child: any) => {
          if (child instanceof PIXI.Container && 
              (child as any).name === `char_container_${charData.id}`) {
            charContainer = child as PIXI.Container;
          }
        });

        // 存在しない場合は新規作成
        if (!charContainer) {
          charContainer = new PIXI.Container();
          (charContainer as any).name = `char_container_${charData.id}`;
          container.addChild(charContainer);
        }

        // 文字コンテナの位置設定
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
        
        charContainer.position.set(cumulativeXOffset, 0);
        cumulativeXOffset += fontSize * effectiveSpacing;

        // 文字アニメーションの適用
        this.animateContainer!(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars
          },
          nowMs,
          charData.start,
          charData.end,
          'char',
          phase
        );
      });
    }

    container.updateTransform();
    return true;
  },

  /**
   * 文字コンテナの描画
   * 動的周波数制御による点滅エフェクトと完全表示状態での点滅停止
   */
  renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, unknown>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    _hierarchyType: HierarchyType
  ): boolean {
    const fontSize = params.fontSize as number || 120;
    const fontFamily = params.fontFamily as string;
    if (!fontFamily) {
      console.error('[FlickerFadeTemplate] fontFamilyパラメータが指定されていません');
      return false;
    }

    // パラメータの取得
    const preInDuration = params.preInDuration as number || 1500;
    const flickerMinFrequency = params.flickerMinFrequency as number || 2;
    const flickerMaxFrequency = params.flickerMaxFrequency as number || 15;
    const flickerIntensity = params.flickerIntensity as number || 0.8;
    const flickerRandomness = params.flickerRandomness as number || 0.7;
    const frequencyLerpSpeed = params.frequencyLerpSpeed as number || 0.15;
    const fadeInVariation = params.fadeInVariation as number || 500;
    const fadeOutVariation = params.fadeOutVariation as number || 800;
    const fadeOutDuration = params.fadeOutDuration as number || 1000;
    const fullDisplayThreshold = params.fullDisplayThreshold as number || 0.85;
    const defaultTextColor = params.defaultTextColor as string || '#808080';
    const activeTextColor = params.activeTextColor as string || '#FFFF80';
    const completedTextColor = params.completedTextColor as string || '#FFF7EB';

    container.visible = true;

    // 文字アニメーション状態の生成/取得
    const charIndex = params.charIndex as number || 0;
    const stateKey = `charState_${charIndex}`;
    
    if (!(container as any)[stateKey]) {
      // 擬似ランダム生成器（charIndexベース）
      const seedRandom = (seed: number) => {
        let state = seed + 1;
        return () => {
          state = ((state * 1103515245) + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };
      };

      const rng = seedRandom(charIndex);
      
      (container as any)[stateKey] = {
        flickerStartTime: startMs - preInDuration + rng() * fadeInVariation * flickerRandomness,
        flickerDuration: preInDuration + rng() * fadeInVariation,
        fadeInCompleteTime: startMs - rng() * fadeInVariation * 0.2,
        fadeOutStartTime: endMs - rng() * fadeOutVariation,
        fadeOutDuration: fadeOutDuration + rng() * fadeOutVariation * 0.5
      } as CharacterAnimationState;
    }

    const charState = (container as any)[stateKey] as CharacterAnimationState;

    // アニメーションフェーズの判定
    let currentAlpha = 0;
    let textColor = defaultTextColor;

    if (nowMs < charState.flickerStartTime) {
      // 隠れ状態
      currentAlpha = 0;
      textColor = defaultTextColor;
    } else if (nowMs < startMs) {
      // フェードイン（点滅）フェーズ
      const elapsed = nowMs - charState.flickerStartTime;
      const progress = Math.min(elapsed / charState.flickerDuration, 1);
      
      // ベースアルファ値（徐々にフェードイン）
      const baseAlpha = easeInOutQuad(progress);
      
      // 完全表示に近い場合は点滅を停止
      if (baseAlpha >= fullDisplayThreshold) {
        currentAlpha = baseAlpha;
      } else {
        // 動的周波数制御
        const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
        
        // 前フレームの周波数を取得/初期化
        const prevFreq = (container as any).__prevFrequency || targetFreq;
        const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
        (container as any).__prevFrequency = currentFreq;
        
        // 点滅計算
        const flickerPhase = nowMs * currentFreq * Math.PI * 2;
        const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
        
        currentAlpha = baseAlpha * (1 - flickerIntensity + flickerIntensity * flickerValue);
      }
      
      textColor = defaultTextColor;
    } else if (nowMs <= endMs) {
      // アクティブフェーズ（完全表示）
      currentAlpha = 1.0;
      textColor = activeTextColor;
    } else if (nowMs < charState.fadeOutStartTime + charState.fadeOutDuration) {
      // フェードアウト（点滅）フェーズ
      const elapsed = nowMs - charState.fadeOutStartTime;
      const progress = Math.min(elapsed / charState.fadeOutDuration, 1);
      
      // ベースアルファ値（徐々にフェードアウト）
      const baseAlpha = 1 - easeInOutQuad(progress);
      
      // 完全表示に近い場合は点滅を停止
      if (baseAlpha >= fullDisplayThreshold) {
        currentAlpha = baseAlpha;
      } else {
        // 動的周波数制御（アルファが下がるほど周波数も下がる）
        const targetFreq = lerp(flickerMinFrequency, flickerMaxFrequency, baseAlpha);
        
        // 滑らかな周波数変化
        const prevFreq = (container as any).__prevFrequency || targetFreq;
        const currentFreq = lerp(prevFreq, targetFreq, frequencyLerpSpeed);
        (container as any).__prevFrequency = currentFreq;
        
        // 点滅計算
        const flickerPhase = nowMs * currentFreq * Math.PI * 2;
        const flickerValue = Math.sin(flickerPhase) * 0.5 + 0.5;
        
        currentAlpha = baseAlpha * (1 - flickerIntensity + flickerIntensity * flickerValue);
      }
      
      textColor = completedTextColor;
    } else {
      // 完全に消失
      currentAlpha = 0;
      textColor = completedTextColor;
    }

    // アルファ値の範囲制限
    currentAlpha = Math.max(0, Math.min(1, currentAlpha));

    // 文字テキストの描画
    const textStyle = new PIXI.TextStyle({
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor,
      align: 'center',
      fontWeight: 'normal'
    });

    const textObj = new PIXI.Text(text, textStyle);
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    textObj.alpha = currentAlpha;

    container.addChild(textObj);
    container.visible = currentAlpha > 0;

    return true;
  }
};

export default FlickerFadeTemplate;