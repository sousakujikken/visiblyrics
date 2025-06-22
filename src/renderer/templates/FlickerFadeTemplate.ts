import * as PIXI from 'pixi.js';
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import { DropShadowFilter } from 'pixi-filters';
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
      
      // 段構成設定（MultiLineTextベース）
      { name: "totalLines", type: "number", default: 4, min: 2, max: 8, step: 1 },
      { name: "lineSpacing", type: "number", default: 150, min: 50, max: 400, step: 10 },
      { name: "resetInterval", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
      
      // 手動段指定（-1で自動割り当て、0以上で指定段）
      { name: "manualLineNumber", type: "number", default: -1, min: -1, max: 7, step: 1 },
      
      // フレーズ配置設定（後方互換性のため保持）
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
      { name: "glowPadding", type: "number", default: 50, min: 0, max: 200, step: 10 },
      
      // Shadowエフェクト設定
      { name: "enableShadow", type: "boolean", default: false },
      { name: "shadowBlur", type: "number", default: 6, min: 0, max: 50, step: 0.5 },
      { name: "shadowColor", type: "color", default: "#000000" },
      { name: "shadowAngle", type: "number", default: 45, min: 0, max: 360, step: 15 },
      { name: "shadowDistance", type: "number", default: 8, min: 0, max: 100, step: 1 },
      { name: "shadowAlpha", type: "number", default: 0.8, min: 0, max: 1, step: 0.1 },
      { name: "shadowOnly", type: "boolean", default: false },
      
      // 合成モード設定
      { name: "blendMode", type: "string", default: "normal",
        options: ["normal", "add", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"] }
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
    
    console.log('[FlickerFadeTemplate] animateContainer called:', {
      hierarchyType,
      text: textContent.substring(0, 20) + '...',
      startMs,
      endMs,
      nowMs,
      phase
    });
    
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
    console.log('[FlickerFadeTemplate] renderPhraseContainer called:', {
      text: text.substring(0, 20) + '...',
      startMs,
      endMs,
      nowMs,
      phase
    });
    // パラメータの取得
    // 新しい段管理パラメータ（MultiLineTextベース）
    const totalLines = params.totalLines as number || 4;
    const lineSpacing = params.lineSpacing as number || 150;
    const resetInterval = params.resetInterval as number || 2000;
    const manualLineNumber = params.manualLineNumber as number || -1;
    
    // 従来のパラメータ（後方互換性のため保持）
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
    
    const enableShadow = params.enableShadow as boolean ?? false;
    const shadowBlur = params.shadowBlur as number || 6;
    const shadowColor = params.shadowColor as string || '#000000';
    const shadowAngle = params.shadowAngle as number || 45;
    const shadowDistance = params.shadowDistance as number || 8;
    const shadowAlpha = params.shadowAlpha as number || 0.8;
    const shadowOnly = params.shadowOnly as boolean ?? false;
    
    const blendMode = params.blendMode as string || 'normal';

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

    // 適切な行インデックスを決定（MultiLineTextベースの段管理）
    const lineIndex = this.getOrCalculateLineNumber!(phraseId, params, startMs, endMs, totalLines, resetInterval, manualLineNumber, nowMs);

    // デバッグログ：段ずらし詳細情報（フレーズ初回のみ）
    const global = (window as any);
    if (!global.__FLICKERFADE_STATE__) {
      global.__FLICKERFADE_STATE__ = {
        phraseLineMap: new Map(),
        lineHistory: [],
        usedLines: new Set<number>(),
        loggedPositioning: new Set<string>()
      };
    }
    const state = global.__FLICKERFADE_STATE__;
    const isFirstTimeForPhrase = !state.loggedPositioning.has(phraseId);
    
    if (isFirstTimeForPhrase) {
      state.loggedPositioning.add(phraseId);
      
      const debugBaseCenterY = screenHeight / 2;
      const debugTotalHeight = (totalLines - 1) * lineSpacing;
      const debugFirstLineY = debugBaseCenterY - debugTotalHeight / 2;
      
      console.log('[FlickerFadeTemplate] Phrase positioning DEBUG (MultiLineText-based):', {
        phraseId,
        text: text.substring(0, 20) + '...',
        lineIndex,
        totalLines,
        lineSpacing,
        baseCenterY: debugBaseCenterY,
        firstLineY: debugFirstLineY,
        calculatedY: debugFirstLineY + lineIndex * lineSpacing + phraseOffsetY,
        startMs,
        endMs,
        phase,
        params: { totalLines, lineSpacing, resetInterval, phraseOffsetY }
      });
    }

    // フレーズの基準位置計算（点滅フェードテキスト2と同じ方式）
    let centerX = (screenWidth - phraseWidth) / 2 + phraseOffsetX;
    
    // Y座標の計算（画面中央から上下に段を配置）
    const baseCenterY = screenHeight / 2;
    const totalHeight = (totalLines - 1) * lineSpacing;
    const firstLineY = baseCenterY - totalHeight / 2;
    let centerY = firstLineY + lineIndex * lineSpacing + phraseOffsetY;

    // フィルターの適用
    const needsPadding = enableGlow || enableShadow;
    const maxPadding = Math.max(glowPadding, shadowDistance + shadowBlur);
    
    if (needsPadding) {
      container.filterArea = new PIXI.Rectangle(
        -maxPadding,
        -maxPadding,
        screenWidth + maxPadding * 2,
        screenHeight + maxPadding * 2
      );
    } else {
      container.filterArea = null;
    }
    
    // フィルター配列の初期化
    const filters: PIXI.Filter[] = [];
    
    // Shadowエフェクトの適用
    if (enableShadow) {
      const shadowFilter = new DropShadowFilter({
        blur: shadowBlur,
        color: shadowColor,
        alpha: shadowAlpha,
        angle: shadowAngle, // 度のまま使用
        distance: shadowDistance,
        quality: 4
      });
      // shadowOnlyはプロパティとして後から設定
      (shadowFilter as any).shadowOnly = shadowOnly;
      filters.push(shadowFilter);
    }
    
    // Glowエフェクトの適用
    if (enableGlow) {
      const bloomFilter = new AdvancedBloomFilter({
        threshold: 0.2,
        bloomScale: glowStrength,
        brightness: glowBrightness,
        blur: glowBlur,
        quality: glowQuality,
        kernels: null,
        pixelSize: { x: 1, y: 1 }
      });
      filters.push(bloomFilter);
    }
    
    // フィルターの設定
    container.filters = filters.length > 0 ? filters : null;

    // 合成モードの適用
    const blendModeMap: Record<string, PIXI.BLEND_MODES> = {
      'normal': PIXI.BLEND_MODES.NORMAL,
      'add': PIXI.BLEND_MODES.ADD,
      'multiply': PIXI.BLEND_MODES.MULTIPLY,
      'screen': PIXI.BLEND_MODES.SCREEN,
      'overlay': PIXI.BLEND_MODES.OVERLAY,
      'darken': PIXI.BLEND_MODES.DARKEN,
      'lighten': PIXI.BLEND_MODES.LIGHTEN,
      'color-dodge': PIXI.BLEND_MODES.COLOR_DODGE,
      'color-burn': PIXI.BLEND_MODES.COLOR_BURN,
      'hard-light': PIXI.BLEND_MODES.HARD_LIGHT,
      'soft-light': PIXI.BLEND_MODES.SOFT_LIGHT,
      'difference': PIXI.BLEND_MODES.DIFFERENCE,
      'exclusion': PIXI.BLEND_MODES.EXCLUSION
    };
    
    container.blendMode = blendModeMap[blendMode] || PIXI.BLEND_MODES.NORMAL;
    
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
            chars: wordData.chars,
            phraseEndMs: endMs  // フレーズの終了時刻を追加
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

    // デバッグログを削除（段ずらし以外のログを抑制）

    // 単語インデックスと総単語数を取得
    const wordIndex = params.wordIndex as number || 0;
    const totalWords = params.totalWords as number || 1;

    // フレーズ内での単語の累積X座標オフセットを計算
    let wordOffsetX = 0;
    
    // previousWordsWidthがパラメータで渡されていればそれを使用
    if (params.previousWordsWidth !== undefined) {
      wordOffsetX = params.previousWordsWidth as number;
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
            totalChars: charData.totalChars,
            phraseEndMs: params.phraseEndMs  // フレーズの終了時刻を伝達
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

    // フレーズの終了時刻を取得（なければ単語の終了時刻を使用）
    const phraseEndMs = params.phraseEndMs as number || endMs;

    container.visible = true;

    // 文字アニメーション状態の生成/取得
    const charIndex = params.charIndex as number || 0;
    const stateKey = `charState_${charIndex}_${phraseEndMs}`;  // フレーズ終了時刻も含めてキーを生成
    
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
        fadeOutStartTime: phraseEndMs - rng() * fadeOutVariation,  // フレーズの終了時刻を基準に
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
    } else if (nowMs <= phraseEndMs) {
      // アクティブフェーズ（完全表示）- フレーズ終了時刻まで表示継続
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
  },

  /**
   * フレーズの段番号を取得または計算（MultiLineTextベース）
   */
  getOrCalculateLineNumber(
    phraseId: string,
    params: Record<string, any>,
    startMs: number,
    endMs: number,
    totalLines: number,
    resetInterval: number,
    manualLineNumber: number,
    nowMs: number
  ): number {
    // グローバルな段管理システム（FlickerFade専用）
    const global = (window as any);
    if (!global.__FLICKERFADE_MULTILINE_STATE__) {
      global.__FLICKERFADE_MULTILINE_STATE__ = {
        lastPhraseEndMs: -1,
        currentLine: 0,
        phraseLineMap: new Map(),
        lineHistory: []
      };
    }
    
    const state = global.__FLICKERFADE_MULTILINE_STATE__;
    
    // 既にこのフレーズの段番号が決まっている場合はそれを返す
    if (state.phraseLineMap.has(phraseId)) {
      return state.phraseLineMap.get(phraseId);
    }
    
    // 手動指定がある場合はそれを使用
    if (manualLineNumber >= 0 && manualLineNumber < totalLines) {
      state.phraseLineMap.set(phraseId, manualLineNumber);
      return manualLineNumber;
    }
    
    // 前のフレーズとの間隔をチェック
    if (state.lastPhraseEndMs !== -1 && 
        startMs - state.lastPhraseEndMs > resetInterval) {
      // リセット条件に該当：1段目に戻る
      state.currentLine = 0;
    }
    
    const lineNumber = state.currentLine % totalLines;
    
    // 段番号をキャッシュ
    state.phraseLineMap.set(phraseId, lineNumber);
    
    // 状態更新
    state.lastPhraseEndMs = endMs;
    state.currentLine += 1;
    state.lineHistory.push({
      phraseId,
      startMs,
      endMs,
      lineNumber,
      text: params.text || ''
    });
    
    return lineNumber;
  }
};

export default FlickerFadeTemplate;