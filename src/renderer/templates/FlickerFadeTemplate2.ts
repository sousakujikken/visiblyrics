import * as PIXI from 'pixi.js';
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
 * FlickerFadeTemplate2 - 点滅フェードテキスト（改良版）
 * MultiLineTextベースの多段配置システムに点滅フェード効果を組み合わせ
 */
export const FlickerFadeTemplate2: IAnimationTemplate = {
  // テンプレートメタデータ
  metadata: {
    name: "FlickerFadeTemplate2",
    version: "2.0.0",
    description: "多段配置システムを持つ点滅フェードテキストテンプレート。MultiLineTextをベースに点滅フェード効果を追加。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Sousakujikken_HIRO",
      contribution: "FlickerFadeTemplate2の作成",
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
      
      // 段構成設定
      { name: "totalLines", type: "number", default: 4, min: 2, max: 8, step: 1 },
      { name: "lineSpacing", type: "number", default: 120, min: 50, max: 200, step: 10 },
      { name: "resetInterval", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
      
      // 手動段指定（-1で自動割り当て、0以上で指定段）
      { name: "manualLineNumber", type: "number", default: -1, min: -1, max: 7, step: 1 },
      
      // 文字色設定
      { name: "defaultTextColor", type: "color", default: "#808080" },
      { name: "activeTextColor", type: "color", default: "#FFFF80" },
      { name: "completedTextColor", type: "color", default: "#FFF7EB" },
      
      // フレーズオフセット
      { name: "phraseOffsetX", type: "number", default: 0, min: -500, max: 500, step: 10 },
      { name: "phraseOffsetY", type: "number", default: 0, min: -500, max: 500, step: 10 },
      
      // 点滅エフェクト設定
      { name: "preInDuration", type: "number", default: 1500, min: 500, max: 5000, step: 100 },
      { name: "flickerMinFrequency", type: "number", default: 2, min: 0.5, max: 10, step: 0.5 },
      { name: "flickerMaxFrequency", type: "number", default: 15, min: 5, max: 30, step: 1 },
      { name: "flickerIntensity", type: "number", default: 0.8, min: 0, max: 1, step: 0.1 },
      { name: "flickerRandomness", type: "number", default: 0.7, min: 0, max: 1, step: 0.1 },
      { name: "frequencyLerpSpeed", type: "number", default: 0.15, min: 0.01, max: 1, step: 0.01 },
      
      // フレーズ単位フェードイン制御
      { name: "phraseBasedFadeIn", type: "boolean", default: true },
      { name: "charInRandomVariation", type: "number", default: 300, min: 0, max: 1000, step: 50 },
      
      // フェード制御
      { name: "fadeInVariation", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "fadeOutVariation", type: "number", default: 800, min: 0, max: 2000, step: 50 },
      { name: "fadeOutDuration", type: "number", default: 1000, min: 200, max: 3000, step: 100 },
      { name: "fullDisplayThreshold", type: "number", default: 0.85, min: 0.5, max: 1, step: 0.05 },
      
      // 文字間隔
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      
      // フレーズ重複処理
      { name: "phraseOverlapThreshold", type: "number", default: 1000, min: 100, max: 3000, step: 100 }
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
    params: Record<string, any>,
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
   * フレーズコンテナの描画（固定位置表示）
   */
  renderPhraseContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    hierarchyType: HierarchyType
  ): boolean {
    
    const totalLines = params.totalLines || 4;
    const lineSpacing = params.lineSpacing || 120;
    const resetInterval = params.resetInterval || 2000;
    const manualLineNumber = params.manualLineNumber || -1;
    const phraseOffsetX = params.phraseOffsetX || 0;
    const phraseOffsetY = params.phraseOffsetY || 0;
    const fontSize = params.fontSize || 120;
    const charSpacing = params.charSpacing || 1.0;
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      container.position.set(0, 0);
      return true;
    }
    
    const screenWidth = app.renderer.width;
    const screenHeight = app.renderer.height;
    
    // フレーズの段番号を取得または計算
    const phraseId = params.id || 'unknown';
    let lineNumber = this.getOrCalculateLineNumber!(phraseId, params, startMs, endMs, totalLines, resetInterval, manualLineNumber, nowMs);
    
    // 固定位置の計算
    const phraseWidth = calculatePhraseWidth(text, fontSize, charSpacing);
    const centerX = screenWidth / 2 - phraseWidth / 2 + phraseOffsetX;
    
    // Y座標の計算（画面中央から上下に段を配置）
    const centerY = screenHeight / 2;
    const totalHeight = (totalLines - 1) * lineSpacing;
    const firstLineY = centerY - totalHeight / 2;
    const targetY = firstLineY + lineNumber * lineSpacing + phraseOffsetY;
    
    // 固定位置に配置
    container.position.set(centerX, targetY);
    container.alpha = 1.0;
    container.visible = true;
    container.updateTransform();
    
    // 段番号とフレーズ終了時刻をパラメータとして子に渡す
    params.currentLineNumber = lineNumber;
    params.phraseEndMs = endMs;
    
    // フレーズ単位フェードイン制御の設定
    const phraseBasedFadeIn = params.phraseBasedFadeIn ?? true;
    const charInRandomVariation = params.charInRandomVariation || 300;
    
    // フレーズ全体の文字情報を収集してランダム順序を生成
    if (phraseBasedFadeIn && params.words && Array.isArray(params.words)) {
      // フレーズの文字インデックス収集
      const phraseCharIndices: number[] = [];
      (params.words as any[]).forEach((wordData: any) => {
        if (wordData.chars && Array.isArray(wordData.chars)) {
          wordData.chars.forEach((charData: any) => {
            if (charData.charIndex !== undefined) {
              phraseCharIndices.push(charData.charIndex);
            }
          });
        }
      });
      
      // フレーズIDを基準にした擬似ランダム順序生成
      const phraseId = params.id || 'unknown';
      const phraseStateKey = `phraseCharOrder_${phraseId}`;
      
      if (!(container as any)[phraseStateKey] && phraseCharIndices.length > 0) {
        // フレーズIDベースの擬似ランダム生成器
        const seedRandom = (seed: string) => {
          let hash = 0;
          for (let i = 0; i < seed.length; i++) {
            const char = seed.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit integer
          }
          let state = Math.abs(hash) + 1;
          return () => {
            state = ((state * 1103515245) + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
          };
        };
        
        const rng = seedRandom(phraseId);
        
        // Fisher-Yates shuffle アルゴリズムで文字順序をシャッフル
        const shuffledIndices = [...phraseCharIndices];
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
        }
        
        // 各文字インデックスに対する出現順序（0から始まる）を生成
        const charOrderMap = new Map();
        shuffledIndices.forEach((charIndex, order) => {
          charOrderMap.set(charIndex, order);
        });
        
        (container as any)[phraseStateKey] = {
          charOrderMap,
          totalChars: phraseCharIndices.length
        };
      }
      
      // ランダム順序情報をパラメータに追加
      const phraseCharOrder = (container as any)[phraseStateKey];
      if (phraseCharOrder) {
        params.phraseCharOrderMap = phraseCharOrder.charOrderMap;
        params.phraseTotalChars = phraseCharOrder.totalChars;
        params.phraseStartMs = startMs; // フレーズ開始時刻も渡す
      }
    }
    
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
        
        // 単語コンテナの位置設定
        wordContainer.position.set(cumulativeWidth, 0);
        
        // 単語アニメーションの適用
        this.animateContainer!(
          wordContainer,
          wordData.word,
          {
            ...params,
            id: wordData.id,
            wordIndex: index,
            totalWords: params.words.length,
            chars: wordData.chars,
            phraseEndMs: endMs
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
   * フレーズの段番号を取得または計算（MultiLineTextと同じロジック）
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
    // グローバルな段管理システム（FlickerFade2専用）
    const global = (window as any);
    if (!global.__FLICKERFADE2_STATE__) {
      global.__FLICKERFADE2_STATE__ = {
        lastPhraseEndMs: -1,
        currentLine: 0,
        phraseLineMap: new Map(),
        lineHistory: []
      };
    }
    
    const state = global.__FLICKERFADE2_STATE__;
    
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
  },
  
  /**
   * 単語コンテナの描画
   */
  renderWordContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    hierarchyType: HierarchyType
  ): boolean {
    
    const fontSize = params.fontSize || 120;
    const charSpacing = params.charSpacing || 1.0;
    
    // 単語コンテナは常にローカル座標の原点に配置
    container.position.set(0, 0);
    container.visible = true;
    
    // 文字コンテナの管理
    if (params.chars && Array.isArray(params.chars)) {
      params.chars.forEach((charData, index) => {
        // 既存の文字コンテナを検索
        let charContainer: PIXI.Container | null = null;
        
        container.children.forEach(child => {
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
        const charIndex = charData.charIndex || 0;
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
        const xOffset = charIndex * fontSize * effectiveSpacing;
        charContainer.position.set(xOffset, 0);
        
        // 文字アニメーションの適用
        this.animateContainer!(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars,
            totalWords: charData.totalWords
          },
          nowMs,
          charData.start,
          charData.end,
          'char',
          phase
        );
      });
    }
    
    return true;
  },
  
  /**
   * 文字コンテナの描画
   * 動的周波数制御による点滅エフェクトと完全表示状態での点滅停止
   */
  renderCharContainer(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    hierarchyType: HierarchyType
  ): boolean {
    const fontSize = params.fontSize || 120;
    const fontFamily = params.fontFamily;
    if (!fontFamily) {
      console.error('[FlickerFadeTemplate2] fontFamilyパラメータが指定されていません');
      return false;
    }

    // パラメータの取得
    const preInDuration = params.preInDuration || 1500;
    const flickerMinFrequency = params.flickerMinFrequency || 2;
    const flickerMaxFrequency = params.flickerMaxFrequency || 15;
    const flickerIntensity = params.flickerIntensity || 0.8;
    const flickerRandomness = params.flickerRandomness || 0.7;
    const frequencyLerpSpeed = params.frequencyLerpSpeed || 0.15;
    const fadeInVariation = params.fadeInVariation || 500;
    const fadeOutVariation = params.fadeOutVariation || 800;
    const fadeOutDuration = params.fadeOutDuration || 1000;
    const fullDisplayThreshold = params.fullDisplayThreshold || 0.85;
    const defaultTextColor = params.defaultTextColor || '#808080';
    const activeTextColor = params.activeTextColor || '#FFFF80';
    const completedTextColor = params.completedTextColor || '#FFF7EB';

    // フレーズ単位フェードイン制御の取得
    const phraseBasedFadeIn = params.phraseBasedFadeIn ?? true;
    const charInRandomVariation = params.charInRandomVariation || 300;
    const phraseCharOrderMap = params.phraseCharOrderMap;
    const phraseTotalChars = params.phraseTotalChars || 1;
    const phraseStartMs = params.phraseStartMs || startMs;

    // フレーズの終了時刻を取得
    const phraseEndMs = params.phraseEndMs || endMs;

    container.visible = true;

    // 文字アニメーション状態の生成/取得
    const charIndex = params.charIndex || 0;
    const stateKey = `charState_${charIndex}_${phraseEndMs}`;
    
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
      
      let flickerStartTime, flickerDuration;
      
      if (phraseBasedFadeIn && phraseCharOrderMap && phraseCharOrderMap.has(charIndex)) {
        // フレーズ単位フェードイン：全文字が同じタイミングで点滅開始
        // ランダム順序で少しずつ時差をつけて出現
        const charOrder = phraseCharOrderMap.get(charIndex) || 0;
        const orderRatio = charOrder / Math.max(1, phraseTotalChars - 1); // 0-1の範囲
        const randomDelay = orderRatio * charInRandomVariation; // ランダム順序による時差
        
        flickerStartTime = phraseStartMs - preInDuration;
        flickerDuration = preInDuration + randomDelay;
      } else {
        // 従来の文字別個別フェードイン
        flickerStartTime = startMs - preInDuration + rng() * fadeInVariation * flickerRandomness;
        flickerDuration = preInDuration + rng() * fadeInVariation;
      }
      
      (container as any)[stateKey] = {
        flickerStartTime,
        flickerDuration,
        fadeInCompleteTime: phraseBasedFadeIn ? phraseStartMs : startMs - rng() * fadeInVariation * 0.2,
        fadeOutStartTime: phraseEndMs - rng() * fadeOutVariation,
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
    } else if (nowMs < (phraseBasedFadeIn ? phraseStartMs : startMs)) {
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
      // アクティブフェーズ（完全表示）
      // フレーズ単位フェードインの場合は各文字のタイミングを無視してフレーズタイミングで表示
      if (phraseBasedFadeIn) {
        // フレーズ単位制御：フレーズが始まったら個別の文字タイミングに関係なく表示
        if (nowMs >= startMs) {
          currentAlpha = 1.0;
          textColor = activeTextColor;
        } else {
          // まだ文字のアクティブ時間ではない場合は少し暗めに表示
          currentAlpha = 0.7;
          textColor = defaultTextColor;
        }
      } else {
        // 従来の文字別制御：個別の文字タイミングで判定
        if (nowMs >= startMs && nowMs <= endMs) {
          currentAlpha = 1.0;
          textColor = activeTextColor;
        } else {
          currentAlpha = 0.7;
          textColor = defaultTextColor;
        }
      }
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

    return true;
  }
};

export default FlickerFadeTemplate2;