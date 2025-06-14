import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase, TemplateMetadata } from '../types/types';
import { FontService } from '../services/FontService';

/**
 * 多角形を描画するためのユーティリティ関数
 */
function drawPolygon(graphics: PIXI.Graphics, x: number, y: number, radius: number, sides: number, rotation: number = 0): void {
  if (sides < 3) sides = 3; // 最低3辺（三角形）
  
  // 最初の特別な処理なしに、直接点を描画する
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
 * MultiLineText テンプレート
 * 歌詞表示ラインを4段構成とし、各段はY軸方向に文字サイズ分ずらして配置
 * フレーズごとに順番に1段目、2段目と割り当て、所定の秒数以上間隔が空いた場合は1段目にリセット
 * 手動でのテンプレートパラメータ設定でどの段数に表示するか指定することも可能
 */
export const MultiLineText: IAnimationTemplate = {
  // テンプレートメタデータ
  metadata: {
    name: "MultiLineText",
    version: "1.0.0",
    description: "多段構成の歌詞表示テンプレート。カラオケスタイルのテキストアニメーションを提供します。",
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
      { name: "fontSize", type: "number", default: 100, min: 12, max: 256, step: 1 },
      { 
        name: "fontFamily", 
        type: "string", 
        default: "Arial", // システムフォントが必須
        get options() {
          return FontService.getAvailableFonts();
        }
      },
      
      // 段構成設定
      { name: "totalLines", type: "number", default: 4, min: 2, max: 8, step: 1 },  // 段数
      { name: "lineSpacing", type: "number", default: 50, min: 20, max: 100, step: 5 }, // 段間隔（px）
      { name: "resetInterval", type: "number", default: 2000, min: 500, max: 5000, step: 100 }, // リセット判定時間（ms）
      
      // 手動段指定（-1で自動割り当て、0以上で指定段）
      { name: "manualLineNumber", type: "number", default: -1, min: -1, max: 7, step: 1 },
      
      // 文字色設定
      { name: "inactiveColor", type: "color", default: "#9d016c" },     // アクティブ前後の文字色
      { name: "activeColor", type: "color", default: "#fae0ff" },       // アクティブ時の文字色
      { name: "completedColor", type: "color", default: "#f78dee" },     // 完了後の文字色
      
      // アニメーション速度とタイミング
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },         // イン前のアニメーション開始時間（ms）
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },         // アウト後のアニメーション時間（ms）
      { name: "entranceInitialSpeed", type: "number", default: 2.5, min: 0.1, max: 10.0, step: 0.1 },  // 入場初期速度（px/ms）
      { name: "activeSpeed", type: "number", default: 0.25, min: 0.01, max: 1.0, step: 0.01 },         // 発声中速度（px/ms）
      
      // 文字設定
      { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
      { name: "rightOffset", type: "number", default: -400, min: -500, max: 500, step: 10 },
      
      // 多角形オブジェクト設定
      { name: "shapeSize", type: "number", default: 50, min: 10, max: 200, step: 5 },
      { name: "innerShapeSize", type: "number", default: 30, min: 5, max: 150, step: 5 },
      { name: "shapeSizeGrowSpeed", type: "number", default: 370, min: 0, max: 500, step: 1 },
      { name: "innerShapeSizeGrowSpeed", type: "number", default: 400, min: 0, max: 500, step: 1 },
      { name: "shapeRotationSpeed", type: "number", default: 100, min: -200, max: 200, step: 1 },
      { name: "innerShapeRotationSpeed", type: "number", default: 100, min: -200, max: 200, step: 1 },
      { name: "shapeLineWidth", type: "number", default: 8, min: 1, max: 20, step: 1 },
      { name: "innerShapeLineWidth", type: "number", default: 4, min: 1, max: 15, step: 1 },
      { name: "shapeOffsetX", type: "number", default: 0, min: -100, max: 100, step: 1 },
      { name: "shapeOffsetY", type: "number", default: 0, min: -100, max: 100, step: 1 },
      { name: "shapeStartAngle", type: "number", default: 0, min: 0, max: 360, step: 1 },
      { name: "innerShapeStartAngle", type: "number", default: 0, min: 0, max: 360, step: 1 }
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
   * フレーズコンテナの描画
   * 段の決定と、その段のY座標でのスライドアニメーション
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
    const entranceInitialSpeed = params.entranceInitialSpeed || 2.0;
    const activeSpeed = params.activeSpeed || 0.05;
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
    
    // スライドアニメーションの計算（FadeSlideTextと同様）
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
    } else if (nowMs <= endMs) {
      // アクティブ時：入場終了位置から左へゆっくり移動
      const entranceEndDistance = calculateDistanceFromSpeed(
        headTime,
        headTime,
        entranceInitialSpeed,
        activeSpeed
      );
      const entranceEndPos = startPositionX - entranceEndDistance;
      const activeTime = nowMs - startMs;
      posX = entranceEndPos - activeTime * activeSpeed;
      alpha = 1.0;
    } else if (nowMs < outEndTime) {
      // 退場アニメーション期間：activeSpeedから加速
      const entranceEndDistance = calculateDistanceFromSpeed(
        headTime,
        headTime,
        entranceInitialSpeed,
        activeSpeed
      );
      const entranceEndPos = startPositionX - entranceEndDistance;
      const activeTime = endMs - startMs;
      const basePos = entranceEndPos - activeTime * activeSpeed;
      
      // 退場アニメーション：activeSpeedから高速へ加速
      const elapsedExitTime = nowMs - endMs;
      const exitFinalSpeed = 2.0; // 退場終了速度（高速）
      const exitDistance = calculateDistanceFromSpeed(
        elapsedExitTime,
        tailTime,
        activeSpeed,
        exitFinalSpeed,
        easeInCubic
      );
      posX = basePos - exitDistance;
      alpha = 1.0 - (elapsedExitTime / tailTime);
    } else {
      // 退場後：非表示
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
   * フレーズの段番号を取得または計算
   * 一度計算されたフレーズの段番号はキャッシュして固定する
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
    // グローバルな段管理システム
    const global = (window as any);
    if (!global.__MULTILINE_STATE__) {
      global.__MULTILINE_STATE__ = {
        lastPhraseEndMs: -1,
        currentLine: 0,
        phraseLineMap: new Map(), // フレーズIDと段番号のマッピング
        lineHistory: []
      };
    }
    
    const state = global.__MULTILINE_STATE__;
    
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
   * 単語コンテナの描画（FadeSlideTextと同様）
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
    const charSpacing = params.charSpacing || 1.0;
    
    // フレーズのアニメーション期間を取得
    const phraseStartMs = params.phraseStartMs || startMs;
    const phraseEndMs = params.phraseEndMs || endMs;
    const phrasePhase = params.phrasePhase || phase;
    
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
        const xOffset = charIndex * fontSize * charSpacing;
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
   * 文字コンテナの描画
   * FadeSlideTextと同じアニメーション（文字の状態による色変化 + 円形グラフィック）に
   * 段番号に応じた円色を適用、円のフェードインと線の太さのアニメーションを追加
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
      console.error('[MultiLineText] fontFamilyパラメータが指定されていません');
      return false;
    }
    const currentLineNumber = params.currentLineNumber || 0;
    
    // UIパラメータから色設定を取得
    const defaultTextColor = params.inactiveColor || '#808080';
    const activeTextColor = params.activeColor || '#FF0000';
    const completedTextColor = params.completedColor || '#800000';
    
    // 段番号に応じた円の色（線の色として使用）
    const lineColors = [
      params.line1Color || '#FF0000',
      params.line2Color || '#00FF00',
      params.line3Color || '#0000FF',
      params.line4Color || '#FFFF00',
      params.line5Color || '#FF00FF',
      params.line6Color || '#00FFFF',
      params.line7Color || '#FFFFFF',
      params.line8Color || '#FFA500'
    ];
    
    const lineColor = lineColors[currentLineNumber] || lineColors[0];
    const circleColor = parseInt(lineColor.replace('#', '0x'));
    const maxCircleSize = params.circleSize || 40;
    const maxLineWidth = params.circleLineWidth || 20; // 初期値が20に大きくなりました
    const maxCircleOpacity = params.circleOpacity || 1.0;
    const circleOffsetX = params.circleOffsetX || 0; // 円のX位置オフセット
    const circleOffsetY = params.circleOffsetY || 0; // 円のY位置オフセット
    
    // 多角形グラフィック用の入場・退場時間
    const headTime = params.headTime || 500;
    const tailTime = params.tailTime || 500;
    
    // フレーズの状態を確認
    const phrasePhase = params.phrasePhase || phase;
    const phraseStartMs = params.phraseStartMs || startMs;
    const phraseEndMs = params.phraseEndMs || endMs;
    
    // フレーズがアニメーション期間外の場合は非表示
    const phraseInStartTime = phraseStartMs - headTime;
    const phraseOutEndTime = phraseEndMs + tailTime;
    
    if (nowMs < phraseInStartTime || nowMs > phraseOutEndTime) {
      container.visible = false;
      return true;
    }
    
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
    
    // 文字テキストの描画（状態に応じた色設定）
    const textStyle = new PIXI.TextStyle({
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor,  // 状態に応じた色を適用
      align: 'center',
      fontWeight: 'normal'
    });
    
    const textObj = new PIXI.Text(text, textStyle);
    textObj.anchor.set(0.5, 0.5);
    textObj.position.set(0, 0);
    
    container.addChild(textObj);
    
    // 多角形グラフィックの表示範囲を拡張（文字の入場時間の前から退場時間の後まで）
    const extendedStartMs = startMs - headTime; // 拡張開始時間（文字の開始時間 - headTime）
    const extendedEndMs = endMs + tailTime;     // 拡張終了時間（文字の終了時間 + tailTime）
    
    // 多角形グラフィックを表示するか判定
    const showPolygon = nowMs >= extendedStartMs && nowMs <= extendedEndMs;
    
    // グラフィックの描画（多角形または円）
    if (showPolygon) {
      let duration, elapsed, progress;
      
      // 文字の表示状態に応じた進行度の計算
      if (nowMs < startMs) {
        // 入場アニメーション期間
        duration = headTime;
        elapsed = startMs - nowMs;
        progress = 1 - Math.min(1, Math.max(0, elapsed / duration)); // 0（開始直後）ー1（文字表示直前）
      } else if (nowMs <= endMs) {
        // アクティブ期間
        duration = endMs - startMs;
        elapsed = nowMs - startMs;
        progress = Math.min(1, Math.max(0, elapsed / duration)); // 文字表示中は0～1で進行
      } else {
        // 退場アニメーション期間
        duration = tailTime;
        elapsed = nowMs - endMs;
        progress = Math.min(1, Math.max(0, elapsed / duration)); // 0（文字表示終了直後）～1（完全に退場）
      }
      
      // フェードイン/アウト効果
      let opacity;
      if (nowMs < startMs) {
        // 入場時は時間が経つごとに不透明度を1に近づける
        opacity = maxCircleOpacity * progress;
      } else if (nowMs <= endMs) {
        // 文字表示中は完全不透明
        opacity = maxCircleOpacity;
      } else {
        // 退場時は時間が経つごとに透明にしていく
        opacity = maxCircleOpacity * (1 - progress);
      }
      
      // パラメータの取得
      const shapeSize = params.shapeSize || 50;
      const innerShapeSize = params.innerShapeSize || 30;
      const shapeSizeGrowSpeed = params.shapeSizeGrowSpeed || 10; // px/秒
      const innerShapeSizeGrowSpeed = params.innerShapeSizeGrowSpeed || 30; // px/秒
      const shapeRotationSpeed = params.shapeRotationSpeed || 10; // 度/秒
      const innerShapeRotationSpeed = params.innerShapeRotationSpeed || -30; // 度/秒
      const shapeLineWidth = params.shapeLineWidth || 8;
      const innerShapeLineWidth = params.innerShapeLineWidth || 4;
      const offsetX = params.shapeOffsetX || 0;
      const offsetY = params.shapeOffsetY || 0;
      
      // シードを使って同じ文字は常に同じ形状に
      const charId = params.id || '';
      let charIdHash = 0;
      for (let i = 0; i < charId.length; i++) {
        charIdHash = ((charIdHash << 5) - charIdHash) + charId.charCodeAt(i);
        charIdHash = charIdHash & charIdHash; // 32ビット整数に変換
      }
      
      const shapeTypes = [0, 3, 4, 5, 6]; // 0=円、3=三角形、4=四角形、5=五角形、6=六角形
      const shapeTypeIndex = Math.abs(charIdHash) % shapeTypes.length;
      const shapeType = shapeTypes[shapeTypeIndex];
      
      // 全体の経過時間を計算
      let elapsedSeconds;
      if (nowMs < startMs) {
        // 入場中は正方向の時間経過（大きくなる方向）
        elapsedSeconds = progress * (headTime / 1000);
      } else if (nowMs <= endMs) {
        // アクティブ中は文字の表示時間に応じて大きくなる
        elapsedSeconds = (headTime / 1000) + ((nowMs - startMs) / 1000);
      } else {
        // 退場中はアクティブ最後の大きさから少しだけ大きくなる
        elapsedSeconds = (headTime / 1000) + ((endMs - startMs) / 1000) + (progress * (tailTime / 2000)); // 退場時はあまり大きくしない
      }
      
      // 外側図形のサイズ（初期サイズ + 経過時間 * 成長速度）
      const currentShapeSize = shapeSize + elapsedSeconds * shapeSizeGrowSpeed;
      
      // 内側図形のサイズ（初期サイズ + 経過時間 * 成長速度）
      const currentInnerShapeSize = innerShapeSize + elapsedSeconds * innerShapeSizeGrowSpeed;
      
      // 開始角度パラメータの取得
      const shapeStartAngle = params.shapeStartAngle || 0;          // 外側図形の開始角度（度）
      const innerShapeStartAngle = params.innerShapeStartAngle || 0; // 内側図形の開始角度（度）
      
      // 回転角度計算（開始角度 + 回転アニメーション、度数法をラジアンに変換）
      const outerRotation = ((shapeStartAngle + elapsedSeconds * shapeRotationSpeed) * (Math.PI / 180));
      const innerRotation = ((innerShapeStartAngle + elapsedSeconds * innerShapeRotationSpeed) * (Math.PI / 180));
      
      // グラフィックの描画
      const shape = new PIXI.Graphics();
      
      // 内側が外側より大きくなった場合は何も表示しない
      if (currentInnerShapeSize >= currentShapeSize) {
        // 完全に透明になるため、何も表示しない
        return true;
      }
      
      // フィルター効果（グロー）のためのパディングを設定
      // これにより、グロー効果がクリップされるのを防ぐ
      const glowPadding = 50; // グロー効果用の余白（必要に応じて調整）
      shape.filters = shape.filters || [];
      if (shape.filters.length > 0) {
        // フィルターが適用されている場合、パディングを設定
        shape.filterArea = new PIXI.Rectangle(
          -glowPadding - currentShapeSize / 2 + offsetX,
          -glowPadding - currentShapeSize / 2 + offsetY,
          currentShapeSize + glowPadding * 2,
          currentShapeSize + glowPadding * 2
        );
      }
      
      // 外側の多角形を塗りつぶしで描画
      shape.beginFill(circleColor, opacity); // 色と不透明度で塗りつぶし開始

      if (shapeType === 0) {
        // 円の描画
        shape.drawCircle(offsetX, offsetY, currentShapeSize / 2);
      } else {
        // 多角形の描画 (時計回り)
        const points = [];
        
        // 外側の多角形の点を時計回りに生成
        for (let i = 0; i < shapeType; i++) {
          const angle = outerRotation + (i * 2 * Math.PI / shapeType);
          points.push(
            offsetX + (currentShapeSize / 2) * Math.cos(angle),
            offsetY + (currentShapeSize / 2) * Math.sin(angle)
          );
        }
        
        // 多角形を描画
        shape.drawPolygon(points);
      }
      
      // 内側の多角形を「穴」として描画
      if (shapeType === 0) {
        // 円の描画（内側）
        shape.beginHole();
        shape.drawCircle(offsetX, offsetY, currentInnerShapeSize / 2);
        shape.endHole();
      } else {
        // 多角形の穴を描画 (反時計回り)
        const holePoints = [];
        
        // 内側の多角形の点を反時計回りに生成
        for (let i = shapeType - 1; i >= 0; i--) {
          const angle = innerRotation + (i * 2 * Math.PI / shapeType);
          holePoints.push(
            offsetX + (currentInnerShapeSize / 2) * Math.cos(angle),
            offsetY + (currentInnerShapeSize / 2) * Math.sin(angle)
          );
        }
        
        // 穴を描画
        shape.beginHole();
        shape.drawPolygon(holePoints);
        shape.endHole();
      }
      
      shape.endFill(); // 塗りつぶし終了
      
      container.addChild(shape);
    }
    
    return true;
  }
};

export default MultiLineText;