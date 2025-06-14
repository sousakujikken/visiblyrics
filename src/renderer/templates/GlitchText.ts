import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata } from '../types/types';
import { FontService } from '../services/FontService';

/**
 * 多角形を描画するためのユーティリティ関数
 */
function drawPolygon(graphics: PIXI.Graphics, x: number, y: number, radius: number, sides: number, rotation: number = 0): void {
  if (sides < 3) sides = 3; // 最低3辺（三角形）
  
  const angles = [];
  
  // 各頂点の角度を計算
  for (let i = 0; i < sides; i++) {
    angles.push(rotation + (i * 2 * Math.PI / sides));
  }
  
  // 最初の点に移動
  graphics.moveTo(
    x + radius * Math.cos(angles[0]),
    y + radius * Math.sin(angles[0])
  );
  
  // 残りの点を線でつなぐ
  for (let i = 1; i < sides; i++) {
    graphics.lineTo(
      x + radius * Math.cos(angles[i]),
      y + radius * Math.sin(angles[i])
    );
  }
  
  // 最初の点に戻って形を閉じる
  graphics.lineTo(
    x + radius * Math.cos(angles[0]),
    y + radius * Math.sin(angles[0])
  );
}

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
 * GlitchText テンプレート
 * MultiLineTextと同様の登場・退場アニメーションに加え、
 * 発声中にピクセルブロック単位でのグリッチ効果を適用
 */
export const GlitchText: IAnimationTemplate = {
  // テンプレートメタデータ
  metadata: {
    name: "GlitchText",
    version: "1.0.0",
    description: "グリッチエフェクト付きの歌詞表示テンプレート。デジタルノイズのような視覚効果を提供します。",
    license: "CC-BY-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    originalAuthor: {
      name: "Sousakujikken_HIRO",
      contribution: "オリジナルテンプレートの作成",
      date: "2025-06-14"
    },
    contributors: []
  } as TemplateMetadata,
  // パラメータ設定取得メソッド
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
      { name: "lineSpacing", type: "number", default: 50, min: 20, max: 100, step: 5 },
      { name: "resetInterval", type: "number", default: 2000, min: 500, max: 5000, step: 100 },
      { name: "manualLineNumber", type: "number", default: -1, min: -1, max: 7, step: 1 },
      
      // 文字色設定
      { name: "inactiveColor", type: "color", default: "#FFA500" },
      { name: "activeColor", type: "color", default: "#FFA500" },
      
      // アニメーション速度とタイミング
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "initialSpeed", type: "number", default: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: "activeSpeed", type: "number", default: 0.01, min: 0.001, max: 1.0, step: 0.001 },
      
      // 文字設定
      { name: "charSpacing", type: "number", default: 1.2, min: 0.1, max: 3.0, step: 0.1 },
      { name: "rightOffset", type: "number", default: 100, min: 0, max: 500, step: 10 },
      
      // グリッチ効果設定
      { name: "enableGlitch", type: "boolean", default: true },
      { name: "glitchBlockSize", type: "number", default: 8, min: 2, max: 32, step: 1 },
      { name: "glitchBlockCount", type: "number", default: 10, min: 1, max: 50, step: 1 },
      { name: "glitchUpdateInterval", type: "number", default: 100, min: 50, max: 1000, step: 10 },
      { name: "glitchIntensity", type: "number", default: 0.5, min: 0.0, max: 1.0, step: 0.1 },
      { name: "glitchColorShift", type: "boolean", default: true },
      { name: "glitchThreshold", type: "number", default: 0.3, min: 0.0, max: 1.0, step: 0.1 },
      { name: "glitchWaveSpeed", type: "number", default: 2.0, min: 0.1, max: 10.0, step: 0.1 },
      { name: "glitchRandomness", type: "number", default: 0.5, min: 0.0, max: 1.0, step: 0.1 },
      
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
   * フレーズコンテナの描画（MultiLineTextと同様）
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
    
    const headTime = params.headTime || 500;
    const tailTime = params.tailTime || 500;
    const initialSpeed = params.initialSpeed || 0.1;
    const activeSpeed = params.activeSpeed || 0.01;
    const rightOffset = params.rightOffset || 100;
    const totalLines = params.totalLines || 4;
    const lineSpacing = params.lineSpacing || 50;
    const resetInterval = params.resetInterval || 2000;
    const manualLineNumber = params.manualLineNumber || -1;
    
    // アプリケーションサイズの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      container.position.set(0, 0);
      return true;
    }
    
    const screenWidth = app.renderer.width;
    const screenHeight = app.renderer.height;
    const startPositionX = screenWidth + rightOffset;
    
    // このフレーズの段番号を取得または計算（一度だけ）
    const phraseId = params.id || 'unknown';
    let lineNumber = this.getOrCalculateLineNumber!(phraseId, params, startMs, endMs, totalLines, resetInterval, manualLineNumber);
    
    // Y座標の計算（画面中央から上下に段を配置）
    const centerY = screenHeight / 2;
    const totalHeight = (totalLines - 1) * lineSpacing;
    const firstLineY = centerY - totalHeight / 2;
    const targetY = firstLineY + lineNumber * lineSpacing;
    
    // 時間計算
    const inStartTime = startMs - headTime;
    const outEndTime = endMs + tailTime;
    
    let posX = startPositionX;
    let posY = targetY;
    let alpha = 1.0;
    
    // スライドアニメーションの計算（MultiLineTextと同様）
    if (nowMs < inStartTime) {
      posX = startPositionX;
      alpha = 0;
    } else if (nowMs < startMs) {
      const progress = (nowMs - inStartTime) / headTime;
      const easedProgress = easeOutCubic(progress);
      posX = startPositionX - (startPositionX - screenWidth/2) * easedProgress;
      alpha = progress;
    } else if (nowMs <= endMs) {
      const activeTime = nowMs - startMs;
      posX = screenWidth/2 - activeTime * activeSpeed;
      alpha = 1.0;
    } else if (nowMs < outEndTime) {
      const exitProgress = (nowMs - endMs) / tailTime;
      const easedProgress = easeInCubic(exitProgress);
      const activeTime = endMs - startMs;
      const basePos = screenWidth/2 - activeTime * activeSpeed;
      posX = basePos - easedProgress * activeSpeed * tailTime * (initialSpeed / activeSpeed);
      alpha = 1.0 - exitProgress;
    } else {
      alpha = 0;
    }
    
    // コンテナの設定
    container.position.set(posX, posY);
    container.alpha = alpha;
    container.updateTransform();
    
    // 段番号とライン色をパラメータとして子に渡す
    params.currentLineNumber = lineNumber;
    
    return true;
  },
  
  /**
   * フレーズの段番号を取得または計算（MultiLineTextと同様）
   */
  getOrCalculateLineNumber(
    phraseId: string,
    params: Record<string, any>,
    startMs: number,
    endMs: number,
    totalLines: number,
    resetInterval: number,
    manualLineNumber: number
  ): number {
    // グローバルな段管理システム（GlitchText専用）
    const global = (window as any);
    if (!global.__GLITCH_TEXT_STATE__) {
      global.__GLITCH_TEXT_STATE__ = {
        lastPhraseEndMs: -1,
        currentLine: 0,
        phraseLineMap: new Map(),
        lineHistory: []
      };
    }
    
    const state = global.__GLITCH_TEXT_STATE__;
    
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
   * 単語コンテナの描画（MultiLineTextと同様）
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
    
    const fontSize = params.fontSize || 32;
    
    // 文字間隔を文字種別に応じて動的に設定
    let charSpacing = params.charSpacing;
    
    // charSpacingが未設定または0以下の場合は動的に設定
    if (charSpacing === undefined || charSpacing === null || charSpacing <= 0) {
      charSpacing = this.getDefaultCharSpacing!(text);
    } else {
    }
    
    // 最終的なフォールバックチェック
    if (charSpacing <= 0 || isNaN(charSpacing)) {
      charSpacing = 1.2;
      console.warn(`GlitchText: charSpacingが不正な値のためデフォルト値を使用: ${charSpacing}`);
    }
    
    const phraseStartMs = params.phraseStartMs || startMs;
    const phraseEndMs = params.phraseEndMs || endMs;
    const phrasePhase = params.phrasePhase || phase;
    
    container.position.set(0, 0);
    container.visible = true;
    
    // 文字コンテナの管理
    if (params.chars && Array.isArray(params.chars)) {
      params.chars.forEach((charData, index) => {
        let charContainer: PIXI.Container | null = null;
        
        container.children.forEach(child => {
          if (child instanceof PIXI.Container && 
              (child as any).name === `char_container_${charData.id}`) {
            charContainer = child as PIXI.Container;
          }
        });
        
        if (!charContainer) {
          charContainer = new PIXI.Container();
          (charContainer as any).name = `char_container_${charData.id}`;
          container.addChild(charContainer);
        }
        
        const charIndex = charData.charIndex || 0;
        const xOffset = charIndex * fontSize * charSpacing;
        charContainer.position.set(xOffset, 0);
        
        
        this.animateContainer!(
          charContainer,
          charData.char,
          {
            ...params,
            id: charData.id,
            charIndex: charData.charIndex,
            totalChars: charData.totalChars,
            totalWords: charData.totalWords,
            phrasePhase: phrasePhase,
            phraseStartMs: phraseStartMs,
            phraseEndMs: phraseEndMs
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
   * 文字コンテナの描画（グリッチ効果付き）✨ 新機能
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
    
    const fontSize = params.fontSize || 32;
    // Electronネイティブ：システムフォントを直接使用
    const fontFamily = params.fontFamily;
    if (!fontFamily) {
      console.error('[GlitchText] fontFamilyパラメータが指定されていません');
      return false;
    }
    const currentLineNumber = params.currentLineNumber || 0;
    
    // フレーズの状態を確認
    const phrasePhase = params.phrasePhase || phase;
    const phraseStartMs = params.phraseStartMs || startMs;
    const phraseEndMs = params.phraseEndMs || endMs;
    
    const headTime = params.headTime || 500;
    const tailTime = params.tailTime || 500;
    
    const phraseInStartTime = phraseStartMs - headTime;
    const phraseOutEndTime = phraseEndMs + tailTime;
    
    if (nowMs < phraseInStartTime || nowMs > phraseOutEndTime) {
      container.visible = false;
      return true;
    }
    
    container.visible = true;
    
    // 文字の状態を判定
    const isActive = nowMs >= startMs && nowMs <= endMs;
    const isCompleted = nowMs > endMs;
    
    // グリッチ効果パラメータ
    const glitchBlockSize = params.glitchBlockSize || 8;
    const glitchBlockCount = params.glitchBlockCount || 10;
    const glitchUpdateInterval = params.glitchUpdateInterval || 100;
    const glitchIntensity = params.glitchIntensity || 0.5;
    const glitchColorShift = params.glitchColorShift || true;
    const glitchThreshold = params.glitchThreshold || 0.3;
    const glitchWaveSpeed = params.glitchWaveSpeed || 2.0;
    const glitchRandomness = params.glitchRandomness || 0.5;
    
    // グリッチ効果を適用するか判定（enableGlitchパラメータとアクティブ時以外にグリッチを適用）
    const enableGlitch = params.enableGlitch !== undefined ? params.enableGlitch : true;
    const shouldApplyGlitch = enableGlitch && !isActive && nowMs >= phraseStartMs && nowMs <= phraseEndMs;
    
    // デバッグログ（開発時のみ）
    if (process.env.NODE_ENV === 'development') {
      console.log(`[GlitchText Debug] enableGlitch: ${enableGlitch}, isActive: ${isActive}, shouldApplyGlitch: ${shouldApplyGlitch}`);
    }
    
    if (shouldApplyGlitch && text && text.trim() !== '') {
      // グリッチ効果付きで文字を描画
      // 動的グリッチ量を計算
      const dynamicGlitchAmount = this.calculateDynamicGlitchAmount!(
        nowMs,
        glitchBlockCount,
        glitchThreshold,
        glitchWaveSpeed,
        glitchRandomness,
        params
      );
      
      // グリッチ量が閾値を超えた場合のみグリッチを適用
      if (dynamicGlitchAmount.shouldGlitch) {
        this.renderGlitchText!(
          container,
          text,
          fontSize,
          fontFamily,
          nowMs,
          glitchBlockSize,
          dynamicGlitchAmount.blockCount,
          glitchUpdateInterval,
          glitchIntensity,
          glitchColorShift,
          params
        );
      } else {
        // グリッチなしで通常描画
        this.renderNormalText!(
          container,
          text,
          fontSize,
          fontFamily,
          isActive,
          isCompleted,
          params
        );
      }
    } else {
      // 通常の文字描画
      this.renderNormalText!(
        container,
        text,
        fontSize,
        fontFamily,
        isActive,
        isCompleted,
        params
      );
    }
    
    return true;
  },
  
  /**
   * 通常の文字描画（グリッチ効果なし）
   */
  renderNormalText(
    container: PIXI.Container,
    text: string,
    fontSize: number,
    fontFamily: string,
    isActive: boolean,
    isCompleted: boolean,
    params: Record<string, any>
  ): void {
    
    // 文字の色を状態とパラメータに応じて決定
    let textColor = params.inactiveColor || '#FFFFFF'; // デフォルト
    if (isActive) {
      textColor = params.activeColor || '#FFFFFF'; // アクティブ時
    } else if (isCompleted) {
      // 完了時は内部的にinactiveColorと同じ色を使用（グリッチ効果のちらつき防止）
      textColor = params.inactiveColor || '#FFFFFF'; 
    }
    
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
  },
  
  /**
   * 文字種別に応じたデフォルト文字間隔を取得 ✨ 新機能
   */
  getDefaultCharSpacing(text: string): number {
    if (!text || text.length === 0) {
      return 1.2;
    }
    
    // 文字列の中の文字をサンプリングして判定
    let halfWidthCount = 0;
    let fullWidthCount = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);
      
      // 半角文字の判定（ASCII範囲）
      if (charCode >= 0x20 && charCode <= 0x7E) {
        halfWidthCount++;
      }
      // 全角文字の判定（ひらがな、カタカナ、漢字など）
      else if (
        (charCode >= 0x3040 && charCode <= 0x309F) || // ひらがな
        (charCode >= 0x30A0 && charCode <= 0x30FF) || // カタカナ
        (charCode >= 0x4E00 && charCode <= 0x9FAF) || // 漢字
        (charCode >= 0xFF01 && charCode <= 0xFF5E)    // 全角英数字記号
      ) {
        fullWidthCount++;
      }
    }
    
    // 全角文字が多い場合は1.0、半角文字が多い場合は0.6
    if (fullWidthCount > halfWidthCount) {
      return 1.0; // 全角文字主体
    } else if (halfWidthCount > 0) {
      return 0.7; // 半角文字主体（少し大きめに）
    } else {
      return 1.2; // デフォルト
    }
  },
  
  /**
   * 動的グリッチ発生量を計算 ✨ 新機能
   */
  calculateDynamicGlitchAmount(
    nowMs: number,
    baseBlockCount: number,
    threshold: number,
    waveSpeed: number,
    randomness: number,
    params: Record<string, any>
  ): { shouldGlitch: boolean, blockCount: number } {
    
    // 時間ベースの波動関数（サイン波）
    const time = nowMs / 1000; // 秒に変換
    const waveValue = Math.sin(time * waveSpeed) * 0.5 + 0.5; // 0-1の範囲
    
    // ランダム要素を追加
    const updatePhase = Math.floor(nowMs / 100); // 100msごとに更新
    const seed = updatePhase * 1000 + (params.id ? this.hashString!(params.id) : 0);
    const random = this.createSeededRandom!(seed);
    const randomValue = random();
    
    // 波動関数とランダム要素を組み合わせ
    const combinedValue = waveValue * (1 - randomness) + randomValue * randomness;
    
    // 閾値と比較してグリッチ発生を判定
    const shouldGlitch = combinedValue > threshold;
    
    // グリッチ量を動的に計算（組み合わせ値に基づいて）
    const intensityMultiplier = Math.max(0.1, combinedValue);
    const dynamicBlockCount = Math.floor(baseBlockCount * intensityMultiplier);
    
    return {
      shouldGlitch,
      blockCount: Math.max(1, dynamicBlockCount)
    };
  },
  
  /**
   * グリッチ効果付き文字描画 ✨ 新機能
   */
  renderGlitchText(
    container: PIXI.Container,
    text: string,
    fontSize: number,
    fontFamily: string,
    nowMs: number,
    blockSize: number,
    blockCount: number,
    updateInterval: number,
    intensity: number,
    colorShift: boolean,
    params: Record<string, any>
  ): void {
    
    // アプリケーションの取得
    const app = (window as any).__PIXI_APP__;
    if (!app || !app.renderer) {
      console.error('GlitchText: PIXIアプリが見つかりません');
      return;
    }
    
    try {
      // ベーステキストを作成（パラメータから色を取得）
      const baseTextStyle = new PIXI.TextStyle({
        fontFamily: fontFamily,
        fontSize: fontSize,
        fill: params.inactiveColor || '#FFFFFF', // パラメータから色を取得
        align: 'center',
        fontWeight: 'normal'
      });
      
      const baseText = new PIXI.Text(text, baseTextStyle);
      baseText.anchor.set(0.5, 0.5);
      
      // テキストのサイズを取得
      const textWidth = baseText.width;
      const textHeight = baseText.height;
      
      if (textWidth <= 0 || textHeight <= 0) {
        // サイズが無効な場合は通常描画
        container.addChild(baseText);
        return;
      }
      
      // RenderTextureの作成（テキストをテクスチャ化）
      const renderTexture = PIXI.RenderTexture.create({
        width: Math.ceil(textWidth),
        height: Math.ceil(textHeight),
        resolution: 1
      });
      
      // ベーステキストをテクスチャに描画
      baseText.position.set(textWidth / 2, textHeight / 2);
      app.renderer.render(baseText, { renderTexture, clear: true });
      
      // グリッチ更新のタイミング計算
      const updatePhase = Math.floor(nowMs / updateInterval);
      const seed = updatePhase * 1000 + (params.id ? this.hashString!(params.id) : 0);
      
      // 擬似乱数生成器（シードベース）
      const random = this.createSeededRandom!(seed);
      
      // ブロック分割の計算
      const blocksX = Math.ceil(textWidth / blockSize);
      const blocksY = Math.ceil(textHeight / blockSize);
      const totalBlocks = blocksX * blocksY;
      
      // グリッチするブロックを選択（同じ行内でのみ置き換え）
      const glitchBlocks = new Map<number, number>(); // 元ブロック -> 置き換え先ブロック
      const actualBlockCount = Math.min(blockCount, totalBlocks);
      
      // 各行ごとにグリッチブロックを処理
      for (let row = 0; row < blocksY; row++) {
        const rowBlocks: number[] = [];
        for (let col = 0; col < blocksX; col++) {
          rowBlocks.push(row * blocksX + col);
        }
        
        // この行でグリッチするブロック数を決定
        const rowGlitchCount = Math.floor(actualBlockCount / blocksY) + 
          (row < actualBlockCount % blocksY ? 1 : 0);
        
        // 行内でランダムにブロックを選択し、同じ行内の別のブロックと入れ替え
        const shuffledIndices = [...Array(rowBlocks.length).keys()];
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
        }
        
        // 行内でペアを作成して入れ替え
        for (let i = 0; i < Math.min(rowGlitchCount * 2, rowBlocks.length - 1); i += 2) {
          if (i + 1 < rowBlocks.length) {
            const sourceBlock = rowBlocks[shuffledIndices[i]];
            const targetBlock = rowBlocks[shuffledIndices[i + 1]];
            
            glitchBlocks.set(sourceBlock, targetBlock);
            glitchBlocks.set(targetBlock, sourceBlock);
          }
        }
      }
      
      // ブロックごとにスプライトを作成
      for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex++) {
        const blockX = blockIndex % blocksX;
        const blockY = Math.floor(blockIndex / blocksX);
        
        const startX = blockX * blockSize;
        const startY = blockY * blockSize;
        const endX = Math.min(startX + blockSize, textWidth);
        const endY = Math.min(startY + blockSize, textHeight);
        
        const blockWidth = endX - startX;
        const blockHeight = endY - startY;
        
        if (blockWidth <= 0 || blockHeight <= 0) continue;
        
        let sourceStartX = startX;
        let sourceStartY = startY;
        let sourceEndX = endX;
        let sourceEndY = endY;
        
        // グリッチブロックの場合は置き換え先のテクスチャを使用
        if (glitchBlocks.has(blockIndex)) {
          const targetBlockIndex = glitchBlocks.get(blockIndex)!;
          const targetBlockX = targetBlockIndex % blocksX;
          const targetBlockY = Math.floor(targetBlockIndex / blocksX);
          
          sourceStartX = targetBlockX * blockSize;
          sourceStartY = targetBlockY * blockSize;
          sourceEndX = Math.min(sourceStartX + blockSize, textWidth);
          sourceEndY = Math.min(sourceStartY + blockSize, textHeight);
        }
        
        // テクスチャの一部を切り出し
        const frame = new PIXI.Rectangle(sourceStartX, sourceStartY, sourceEndX - sourceStartX, sourceEndY - sourceStartY);
        const blockTexture = new PIXI.Texture(renderTexture.baseTexture, frame);
        
        const sprite = new PIXI.Sprite(blockTexture);
        
        if (glitchBlocks.has(blockIndex)) {
          // グリッチ効果を適用（位置はそのまま、元の位置に正確に配置）
          sprite.position.set(startX - textWidth / 2, startY - textHeight / 2);
        } else {
          // 通常位置に配置
          sprite.position.set(startX - textWidth / 2, startY - textHeight / 2);
        }
        
        container.addChild(sprite);
      }
      
    } catch (error) {
      console.error('GlitchText: グリッチ効果の描画中にエラーが発生:', error);
      // エラーの場合は通常描画にフォールバック
      this.renderNormalText!(container, text, fontSize, fontFamily, false, false, params);
    }
  },
  
  /**
   * グリッチ効果をスプライトに適用
   */
  applyGlitchEffect(
    sprite: PIXI.Sprite,
    originalX: number,
    originalY: number,
    blockWidth: number,
    blockHeight: number,
    intensity: number,
    colorShift: boolean,
    random: () => number,
    params: Record<string, any>
  ): void {
    
    const textWidth = sprite.texture.frame.width;
    const textHeight = sprite.texture.frame.height;
    
    // 位置のズレを計算（強度に応じて、ただし最小限に）
    const maxOffsetX = blockWidth * intensity * 0.3; // 係数を小さく
    const maxOffsetY = blockHeight * intensity * 0.1; // Y方向のズレはさらに小さく
    
    const offsetX = (random() - 0.5) * maxOffsetX;
    const offsetY = (random() - 0.5) * maxOffsetY;
    
    // 最終位置を計算
    const finalX = (originalX - textWidth / 2) + offsetX;
    const finalY = (originalY - textHeight / 2) + offsetY;
    
    sprite.position.set(finalX, finalY);
    
    // 色は元の文字色を使用（グリッチ専用色は使わない）
    if (colorShift) {
      // 元の文字色を取得
      const baseColor = params.inactiveColor || '#FFFFFF';
      const colorValue = parseInt(baseColor.replace('#', '0x'));
      
      // 色調は元の色のまま、透明度は変更しない
      sprite.tint = colorValue;
      sprite.alpha = 1.0; // 透明度は変更しない
    }
    
    // スケール効果（わずかに変形、効果を控えめに）
    const scaleVariation = 0.05 * intensity;
    const scaleX = 1 + (random() - 0.5) * scaleVariation;
    const scaleY = 1 + (random() - 0.5) * scaleVariation;
    
    sprite.scale.set(scaleX, scaleY);
    
    // 回転効果なし（位置ズレのみに限定）
  },
  
  /**
   * 文字列のハッシュ値を計算
   */
  hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32ビット整数に変換
    }
    return Math.abs(hash);
  },
  
  /**
   * シードベースの擬似乱数生成器
   */
  createSeededRandom(seed: number): () => number {
    let state = seed;
    return function() {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  },
  
  /**
   * 従来のanimateメソッド（互換性のため）
   */
  animate(
    container: PIXI.Container,
    text: string | string[],
    x: number,
    y: number,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number
  ): boolean {
    // 階層タイプを判定
    let hierarchyType: HierarchyType = 'char';
    
    if (params.id) {
      if (params.id.includes('phrase')) {
        hierarchyType = 'phrase';
      } else if (params.id.includes('word')) {
        hierarchyType = 'word';
      }
    }
    
    // フェーズを判定
    let phase: AnimationPhase = 'active';
    if (nowMs < startMs) {
      phase = 'in';
    } else if (nowMs > endMs) {
      phase = 'out';
    }
    
    return this.animateContainer!(
      container,
      text,
      params,
      nowMs,
      startMs,
      endMs,
      hierarchyType,
      phase
    );
  }
};

export default GlitchText;