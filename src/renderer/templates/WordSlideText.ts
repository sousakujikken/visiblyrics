import * as PIXI from 'pixi.js';
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';
import { DropShadowFilter } from 'pixi-filters';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata } from '../types/types';
import { FontService } from '../services/FontService';


/**
 * イージング関数（ユーティリティ）
 */

/**
 * 三次イージング（アウト）：早い→遅い
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 三次イージング（イン）：遅い→早い
 */
function easeInCubic(t: number): number {
  return t * t * t;
}

/**
 * 速度ベースの距離計算
 * 速度の時間積分により移動距離を算出
 * @param elapsedTime 経過時間（ms）
 * @param duration アニメーション総時間（ms）
 * @param initialSpeed 開始速度（px/ms）
 * @param finalSpeed 終了速度（px/ms）
 * @param easingFn イージング関数（デフォルト: easeOutCubic）
 * @returns 移動距離（px）
 */
function calculateDistanceFromSpeed(
  elapsedTime: number,
  duration: number,
  initialSpeed: number,
  finalSpeed: number,
  easingFn: (t: number) => number = easeOutCubic
): number {
  if (elapsedTime <= 0) return 0;
  if (elapsedTime >= duration) {
    // 完全な積分値を計算（イージング関数により異なる）
    // easeOutCubicの場合：3/4、easeInCubicの場合：1/4
    const integralValue = easingFn === easeOutCubic ? 0.75 : 0.25;
    return duration * (initialSpeed + (finalSpeed - initialSpeed) * integralValue);
  }
  
  // 数値積分（台形公式）で正確な距離を計算
  const steps = Math.min(100, Math.ceil(elapsedTime)); // 最大100ステップ
  const dt = elapsedTime / steps;
  let distance = 0;
  
  for (let i = 0; i < steps; i++) {
    const t1 = i * dt;
    const t2 = (i + 1) * dt;
    const progress1 = t1 / duration;
    const progress2 = t2 / duration;
    const eased1 = easingFn(progress1);
    const eased2 = easingFn(progress2);
    const v1 = initialSpeed + (finalSpeed - initialSpeed) * eased1;
    const v2 = initialSpeed + (finalSpeed - initialSpeed) * eased2;
    distance += (v1 + v2) * dt / 2; // 台形公式
  }
  
  return distance;
}

/**
 * 文字が半角文字かどうかを判定
 * @param char 判定する文字
 * @returns 半角文字の場合true
 */
function isHalfWidthChar(char: string): boolean {
  // 半角文字の範囲をチェック
  // ASCII文字（0x0020-0x007E）
  // 半角カナ（0xFF61-0xFF9F）
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) || (code >= 0xFF61 && code <= 0xFF9F);
}

/**
 * 固定オフセット値リストを生成
 * @param seed シード値
 * @param rangeX X方向の範囲
 * @param rangeY Y方向の範囲
 * @param minDistance 最小距離
 * @returns オフセット値の配列
 */
function generateOffsetList(seed: number, rangeX: number, rangeY: number, minDistance: number): Array<{ x: number; y: number }> {
  const offsets: Array<{ x: number; y: number }> = [];
  const targetCount = 100; // 100個のオフセットを生成
  
  // シード値から擬似ランダム生成器を初期化
  let rng = seed + 1; // 0を避けるため+1
  const nextRandom = () => {
    rng = ((rng * 1103515245) + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  
  let attempts = 0;
  const maxAttempts = 10000;
  
  while (offsets.length < targetCount && attempts < maxAttempts) {
    attempts++;
    
    // ランダムな位置を生成
    const x = (nextRandom() - 0.5) * rangeX;
    const y = (nextRandom() - 0.5) * rangeY;
    
    // 既存のオフセットとの距離をチェック
    let valid = true;
    for (const existing of offsets) {
      const distance = Math.sqrt(Math.pow(x - existing.x, 2) + Math.pow(y - existing.y, 2));
      if (distance < minDistance) {
        valid = false;
        break;
      }
    }
    
    if (valid) {
      offsets.push({ x, y });
    }
  }
  
  return offsets;
}

/**
 * キャッシュされたオフセットリストを取得または生成
 */
function getOrCreateOffsetList(seed: number, rangeX: number, rangeY: number, minDistance: number): OffsetList {
  // パラメータが変更されていたら再生成
  if (!cachedOffsetList || 
      cachedOffsetList.seed !== seed ||
      cachedOffsetList.rangeX !== rangeX ||
      cachedOffsetList.rangeY !== rangeY ||
      cachedOffsetList.minDistance !== minDistance) {
    
    cachedOffsetList = {
      seed,
      rangeX,
      rangeY,
      minDistance,
      offsets: generateOffsetList(seed, rangeX, rangeY, minDistance)
    };
  }
  
  return cachedOffsetList;
}

/**
 * WordSlideText テンプレート
 * 単語が段階的にスライドインし、アウト時刻後も表示され続ける
 * フレーズ内の単語数に応じて段を変えて表示
 */
// フレーズ位置履歴を管理するためのマップ（互換性のため残すが、新しい実装では使用しない）
const phrasePositionHistory = new Map<string, { x: number; y: number; timestamp: number }>();

// 固定オフセット値リストを管理
interface OffsetList {
  seed: number;
  rangeX: number;
  rangeY: number;
  minDistance: number;
  offsets: Array<{ x: number; y: number }>;
}
let cachedOffsetList: OffsetList | null = null;

// 静的パラメータ設定
const WORD_SLIDE_TEXT_PARAMS = [
  // 基本パラメータ
  { name: "fontSize", type: "number", default: 120, min: 12, max: 256, step: 1 },
  { 
    name: "fontFamily", 
    type: "string", 
    default: null, // システムフォントが必須
    get options() {
      return FontService.getAvailableFonts();
    }
  },
  
  // 色設定
  { name: "defaultTextColor", type: "color", default: "#808080" },
  { name: "activeTextColor", type: "color", default: "#FFFF80" },
  { name: "completedTextColor", type: "color", default: "#FFF7EB" },
  
  // アニメーション速度とタイミング
  { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
  { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
  { name: "entranceInitialSpeed", type: "number", default: 4.0, min: 0.1, max: 20.0, step: 0.1 },
  { name: "activeSpeed", type: "number", default: 0.10, min: 0.01, max: 2.0, step: 0.01 },
  
  // 文字設定
  { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
  { name: "rightOffset", type: "number", default: 100, min: 0, max: 500, step: 10 },
  
  // フレーズ位置調整
  { name: "phraseOffsetX", type: "number", default: 100, min: -500, max: 500, step: 10 },
  { name: "phraseOffsetY", type: "number", default: 60, min: -500, max: 500, step: 10 },
  
  // ランダム配置設定
  { name: "randomPlacement", type: "boolean", default: true },
  { name: "randomSeed", type: "number", default: 0, min: 0, max: 9999, step: 1 },
  { name: "randomRangeX", type: "number", default: 200, min: 0, max: 800, step: 50 },
  { name: "randomRangeY", type: "number", default: 150, min: 0, max: 600, step: 50 },
  { name: "minDistanceFromPrevious", type: "number", default: 150, min: 50, max: 500, step: 50 },
  
  // グロー効果設定
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

export const WordSlideText: IAnimationTemplate = {
  // テンプレートメタデータ
  metadata: {
    name: "WordSlideText",
    version: "1.0.0",
    description: "単語が段階的にスライドインする歌詞表示テンプレート。ランダム配置とグロー効果を提供します。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Sousakujikken_HIRO",
      contribution: "オリジナルテンプレートの作成",
      date: "2025-06-14"
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
        default: "Arial", // システムフォントが必須
        get options() {
      return FontService.getAvailableFonts();
    }
      },
      
      // 色設定
      { name: "defaultTextColor", type: "color", default: "#808080" },
      { name: "activeTextColor", type: "color", default: "#FFFF80" },
      { name: "completedTextColor", type: "color", default: "#FFF7EB" },
      
      // アニメーション速度とタイミング
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "entranceInitialSpeed", type: "number", default: 4.0, min: 0.1, max: 20.0, step: 0.1 },
      { name: "activeSpeed", type: "number", default: 0.10, min: 0.01, max: 2.0, step: 0.01 },
      
      // 文字設定
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "rightOffset", type: "number", default: 100, min: 0, max: 500, step: 10 },
      
      // フレーズ位置調整
      { name: "phraseOffsetX", type: "number", default: 100, min: -500, max: 500, step: 10 },
      { name: "phraseOffsetY", type: "number", default: 60, min: -500, max: 500, step: 10 },
      
      // ランダム配置設定
      { name: "randomPlacement", type: "boolean", default: true },
      { name: "randomSeed", type: "number", default: 0, min: 0, max: 9999, step: 1 },
      { name: "randomRangeX", type: "number", default: 0, min: 0, max: 800, step: 50 },
      { name: "randomRangeY", type: "number", default: 150, min: 0, max: 600, step: 50 },
      { name: "minDistanceFromPrevious", type: "number", default: 150, min: 50, max: 500, step: 50 },
      
      // グロー効果設定
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
   * 子コンテナは維持しながら、GraphicsやTextなどの表示要素のみを削除
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
   * 画面中央に配置し、各単語のタイミングに応じて上方向にスライド
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
    // デバッグ：受け取ったparamsオブジェクトをログ出力
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WordSlideText] renderPhraseContainer called with params:`, params);
    }
    
    // グロー効果の設定
    const enableGlow = params.enableGlow as boolean ?? true;
    const glowStrength = params.glowStrength as number || 1.5;
    const glowBrightness = params.glowBrightness as number || 1.2;
    const glowBlur = params.glowBlur as number || 6;
    const glowQuality = params.glowQuality as number || 8;
    const glowPadding = params.glowPadding as number || 50;
    
    // Shadowエフェクトの設定
    const enableShadow = params.enableShadow as boolean ?? false;
    const shadowBlur = params.shadowBlur as number || 6;
    const shadowColor = params.shadowColor as string || '#000000';
    const shadowAngle = params.shadowAngle as number || 45;
    const shadowDistance = params.shadowDistance as number || 8;
    const shadowAlpha = params.shadowAlpha as number || 0.8;
    const shadowOnly = params.shadowOnly as boolean ?? false;
    
    const blendMode = params.blendMode as string || 'normal';
    
    // デバッグ：グローパラメータの確認
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WordSlideText] Glow params - enableGlow: ${enableGlow}, strength: ${glowStrength}, brightness: ${glowBrightness}, blur: ${glowBlur}, quality: ${glowQuality}, padding: ${glowPadding}`);
    }
    
    // フィルターの適用
    const needsPadding = enableGlow || enableShadow;
    const maxPadding = Math.max(glowPadding, shadowDistance + shadowBlur);
    
    if (needsPadding) {
      const app = (window as any).__PIXI_APP__;
      if (app && app.renderer) {
        const screenWidth = app.renderer.width;
        const screenHeight = app.renderer.height;
        
        container.filterArea = new PIXI.Rectangle(
          -maxPadding,
          -maxPadding,
          screenWidth + maxPadding * 2,
          screenHeight + maxPadding * 2
        );
      }
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
    // パラメータの取得
    const phraseOffsetX = params.phraseOffsetX as number || 0;
    const phraseOffsetY = params.phraseOffsetY as number || 0;
    const fontSize = params.fontSize as number || 32;
    const headTime = params.headTime as number || 500;
    const randomPlacement = params.randomPlacement as boolean ?? true;
    const randomSeed = params.randomSeed as number || 0;
    const randomRangeX = params.randomRangeX as number || 300;
    const randomRangeY = params.randomRangeY as number || 200;
    const minDistanceFromPrevious = params.minDistanceFromPrevious as number || 150;
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      // console.log('WordSlideText: PIXIアプリが見つかりません');
      container.position.set(0, 0);
      return true;
    }
    
    const screenWidth = app.renderer.width;
    const screenHeight = app.renderer.height;
    
    // フレーズIDの取得
    const phraseText = Array.isArray(text) ? text.join('') : text;
    // params.idが存在する場合はそれを使用、存在しない場合は一貫したIDを生成
    const phraseId = params.phraseId as string || params.id as string || `phrase_${startMs}_${phraseText.substring(0, 10)}`;
    
    // デバッグログ：フレーズIDの確認（ジャンプ問題調査用）
    
    // 基準位置の計算
    let centerX = screenWidth / 2 + phraseOffsetX;
    let centerY = screenHeight / 2 + phraseOffsetY;
    
    // ランダム配置が有効な場合
    if (randomPlacement) {
      // オフセットリストを取得または生成
      const offsetList = getOrCreateOffsetList(randomSeed, randomRangeX, randomRangeY, minDistanceFromPrevious);
      
      // フレーズIDからインデックスを決定論的に計算
      let hash = 0;
      for (let i = 0; i < phraseId.length; i++) {
        const char = phraseId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      
      // オフセットリストからインデックスを選択（0-99の範囲）
      const offsetIndex = Math.abs(hash) % offsetList.offsets.length;
      const offset = offsetList.offsets[offsetIndex];
      
      // オフセットを適用
      if (offset) {
        centerX += offset.x;
        centerY += offset.y;
      }
    }
    
    // 単語データの取得
    const words = params.words as any[] || [];
    
    // デバッグログ：ジャンプ問題調査用のみ
    // console.log(`WordSlideText フレーズ renderPhraseContainer: phraseId=${phraseId}, randomPlacement=${randomPlacement}, centerX=${centerX}, centerY=${centerY}, nowMs=${nowMs}, startMs=${startMs}, endMs=${endMs}, phase=${phase}, words=`, words);
    
    // 各単語のタイミングに応じてY座標を計算
    let totalYOffset = 0;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordStartMs = word.start;
      const wordInStartTime = wordStartMs - headTime;
      
      // 最初の単語（i === 0）の場合はY方向シフトをスキップ
      if (i === 0) {
        continue;
      }
      
      // この単語のアニメーション期間内かチェック
      if (nowMs >= wordInStartTime && nowMs < wordStartMs) {
        // アニメーション進行度を計算（0～1）
        const progress = (nowMs - wordInStartTime) / headTime;
        // イージングを適用した進行度
        const easedProgress = easeOutCubic(progress);
        // この単語の分の部分的なオフセット
        totalYOffset += fontSize * easedProgress;
      } else if (nowMs >= wordStartMs) {
        // この単語のアニメーションが完了している場合、全体のオフセットを加算
        totalYOffset += fontSize;
      }
      // nowMs < wordInStartTime の場合はまだアニメーションが始まっていないので何もしない
    }
    
    // Y座標を上方向に移動（totalYOffsetを減算）
    centerY -= totalYOffset;
    
    // フレーズのアウトアニメーション
    let alpha = 1.0;
    let xOffset = 0;
    
    // フレーズのアウト時刻の計算（最後の単語の終了時刻を使用）
    const lastWord = words.length > 0 ? words[words.length - 1] : null;
    const phraseOutStartMs = lastWord ? lastWord.end : endMs;
    const tailTime = params.tailTime as number || 500; // tailTimeパラメータを使用
    
    if (nowMs > phraseOutStartMs) {
      // フェードアウト期間中
      const fadeProgress = Math.min((nowMs - phraseOutStartMs) / tailTime, 1.0);
      // アルファ値を線形に減少
      alpha = 1.0 - fadeProgress;
      // 左方向へのスライド（イージング適用）
      const slideDistance = 200; // スライド距離（ピクセル）
      xOffset = -slideDistance * easeInCubic(fadeProgress);
    }
    
    // デバッグログ：ジャンプ問題調査用のみ
    // console.log(`WordSlideText フレーズ: totalYOffset=${totalYOffset}, centerY=${centerY}, alpha=${alpha}, xOffset=${xOffset}`);
    
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
    container.position.set(centerX + xOffset, centerY);
    container.alpha = alpha;
    container.visible = alpha > 0;
    container.updateTransform();
    
    // ジャンプ問題調査用の最小限のログ（位置が大きく変化した場合のみ）
    const lastPos = (container as any).__lastPos;
    if (lastPos && (Math.abs(lastPos.x - (centerX + xOffset)) > 50 || Math.abs(lastPos.y - centerY) > 50)) {
    }
    (container as any).__lastPos = { x: centerX + xOffset, y: centerY };
    
    return true;
  },
  
  
  /**
   * 単語コンテナの描画
   * 単語の順番に応じてY座標を設定し、スライドインアニメーションを行う
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
    const fontSize = params.fontSize as number || 32;
    const headTime = params.headTime as number || 500;
    const entranceInitialSpeed = params.entranceInitialSpeed as number || 2.0;
    const activeSpeed = params.activeSpeed as number || 0.05;
    const rightOffset = params.rightOffset as number || 100;
    const charSpacing = params.charSpacing as number || 1.0;
    const enableGlow = params.enableGlow as boolean ?? true;
    const glowPadding = params.glowPadding as number || 50;
    
    // 単語のインデックスと総単語数を取得
    const wordIndex = params.wordIndex as number || 0;
    const totalWords = params.totalWords as number || 1;
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      // console.log('WordSlideText: PIXIアプリが見つかりません');
      container.position.set(0, 0);
      return true;
    }
    
    // 単語の初期位置は右オフセットのみ（フレーズコンテナからの相対位置）
    const startPositionX = rightOffset;
    
    // Y座標の計算（単語インデックスに基づく）
    // フレーズ内の最初の単語を基準（0）として、各単語を文字サイズ分下にシフト
    const yOffset = wordIndex * fontSize;
    
    // デバッグ用ログ：ジャンプ問題調査用のみ
    // console.log(`WordSlideText: 単語 "${text}" - wordIndex: ${wordIndex}, yOffset: ${yOffset}, fontSize: ${fontSize}`);
    
    // 時間計算
    const inStartTime = startMs - headTime;
    
    let posX = startPositionX;
    let alpha = 1.0;
    
    // スライドインアニメーション（アウト時は削除）
    if (nowMs < inStartTime) {
      // 入場前：初期位置で非表示
      posX = startPositionX;
      alpha = 0;
    } else if (nowMs < startMs) {
      // 入場アニメーション期間：速度ベースの移動
      const elapsedTime = nowMs - inStartTime;
      const distance = calculateDistanceFromSpeed(
        elapsedTime,
        headTime,
        entranceInitialSpeed,
        activeSpeed
      );
      posX = startPositionX - distance;
      alpha = elapsedTime / headTime;
    } else {
      // アクティブ時以降：スライドインが完了した位置で停止
      const entranceEndDistance = calculateDistanceFromSpeed(
        headTime,
        headTime,
        entranceInitialSpeed,
        activeSpeed
      );
      posX = startPositionX - entranceEndDistance;
      alpha = 1.0;
    }
    
    // 単語コンテナの位置設定
    container.position.set(posX, yOffset);
    container.alpha = alpha;
    container.visible = true;
    
    // グロー効果が有効な場合、単語コンテナにもフィルターエリアを設定
    if (enableGlow) {
      // 単語のテキストサイズを考慮したフィルターエリア
      // 半角文字と全角文字で異なる幅を計算
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
    
    container.updateTransform();
    
    // 文字コンテナの管理
    if (params.chars && Array.isArray(params.chars)) {
      let cumulativeXOffset = 0; // 累積X座標オフセット
      
      (params.chars as any[]).forEach((charData: any, index: number) => {
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
        
        // 文字コンテナの位置設定（単語内でのオフセット）
        // 半角文字の場合は文字間隔を0.6倍にする
        const char = charData.char;
        const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
        
        // 累積オフセットを使用して位置を設定
        charContainer.position.set(cumulativeXOffset, 0);
        
        // 次の文字のために累積オフセットを更新
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
            wordIndex: wordIndex,
            totalWords: totalWords
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
   * 文字の表示状態に応じて色を変更
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
    const fontSize = params.fontSize as number || 32;
    // Electronネイティブ：システムフォントを直接使用
    const fontFamily = params.fontFamily as string;
    if (!fontFamily) {
      console.error('[WordSlideText] fontFamilyパラメータが指定されていません');
      return false;
    }
    const defaultTextColor = params.defaultTextColor as string || '#808080';
    const activeTextColor = params.activeTextColor as string || '#FF0000';
    const completedTextColor = params.completedTextColor as string || '#800000';
    
    container.visible = true;
    
    // 文字の状態を判定
    let textColor = defaultTextColor;
    
    if (nowMs < startMs) {
      // 文字のイン前
      textColor = defaultTextColor;
    } else if (nowMs <= endMs) {
      // 文字のアクティブ期間
      textColor = activeTextColor;
    } else {
      // 文字のアウト後
      textColor = completedTextColor;
    }
    
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
    
    container.addChild(textObj);
    
    return true;
  }
};

export default WordSlideText;