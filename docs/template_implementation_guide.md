# テンプレート実装手順書 - 2025年6月現行実装版

このドキュメントは、**Lyralive v0.6.0**のElectronベースアプリケーションで新しいアニメーションテンプレートを実装するための詳細な手順を説明します。実装済みのFadeSlideText、MultiLineText、GlitchText、WordSlideTextテンプレートの**実際の実装パターン**を基に、高度な機能（PixiJSフィルタ、テクスチャ操作、文字カウント管理等）を含む統一された方法で高品質なテンプレートを作成できるよう指導します。

## 目次
1. [前提知識と準備](#前提知識と準備)
2. [現行システムアーキテクチャの理解](#現行システムアーキテクチャの理解)
3. [基本構造の実装](#基本構造の実装)
4. [文字・単語カウント管理](#文字・単語カウント管理)
5. [PixiJSフィルタとエフェクト実装](#PixiJSフィルタとエフェクト実装)
6. [テクスチャ操作とRenderTexture活用](#テクスチャ操作とRenderTexture活用)
7. [階層対応のアニメーション実装](#階層対応のアニメーション実装)
8. [FontService統合とフォント管理](#FontService統合とフォント管理)
9. [パフォーマンス最適化技法](#パフォーマンス最適化技法)
10. [エラーハンドリングとデバッグ](#エラーハンドリングとデバッグ)
11. [テンプレートレジストリへの登録](#テンプレートレジストリへの登録)
12. [実装パターン総合ガイド](#実装パターン総合ガイド)

---

## 前提知識と準備

### 必要な知識
1. **PIXI.js の基本概念**
   - Container, Graphics, Text の使い方
   - 親子関係とローカル/グローバル座標
   - イベントシステムとライフサイクル

2. **複数テンプレート対応システム** ✨ **完全実装済み**
   - 階層構造：フレーズ > 単語 > 文字
   - テンプレート継承：親から子への自動継承
   - パラメータ管理：階層的パラメータオーバーライド
   - 一括操作：複数オブジェクトへの同時適用
   - **🆕 Undo/Redo機能：20ステップ履歴管理**
   - **🆕 パラメータ保持：テンプレート変更時の高度な保持ロジック**

3. **実装済みシステムコンポーネント**
   - `TemplateManager`: テンプレート管理と割り当て
   - `ParameterManager`: 階層的パラメータ管理（改善版）
   - `ProjectStateManager`: 状態保存とUndo/Redo機能
   - `InstanceManager`: インスタンス管理と継承
   - `templateRegistry`: テンプレート中央登録

### 準備する要素
1. **型定義の理解**
   ```typescript
   interface IAnimationTemplate {
     metadata: { params: ParameterDefinition[] };
     
     // 🆕 階層対応メイン実装メソッド（必須）
     animateContainer?(container, text, params, nowMs, startMs, endMs, hierarchyType, phase): boolean;
     
     // 🆕 階層構造保持のための要素削除（必須）
     removeVisualElements?(container): void;
     
     // 🆕 階層別レンダリングメソッド（推奨）
     renderPhraseContainer?(container, text, params, nowMs, startMs, endMs, phase, hierarchyType): boolean;
     renderWordContainer?(container, text, params, nowMs, startMs, endMs, phase, hierarchyType): boolean; 
     renderCharContainer?(container, text, params, nowMs, startMs, endMs, phase, hierarchyType): boolean;
     
     // 従来互換性メソッド
     animate?(container, text, x, y, params, nowMs, startMs, endMs): void;
   }
   ```

2. **階層継承システムの理解**
   ```typescript
   // 🆕 実際の継承例（実装済み）
   phrase_0: "FadeSlideText"           // フレーズレベル設定
     └── phrase_0_word_1: (継承)        // 自動継承
         └── phrase_0_word_1_char_2: (継承)  // 自動継承
   
   phrase_1: "MultiLineText"           // 別フレーズ
     └── phrase_1_word_0: "CustomTemplate"  // オーバーライド
         └── phrase_1_word_0_char_0: (継承)    // CustomTemplateを継承
   ```

---

## 現行システムアーキテクチャの理解

### 実装完了アーキテクチャ

#### 1. テンプレート割り当てシステム ✅
```typescript
// Engine.ts での使用例（実装済み）
engine.assignTemplate('phrase_0', 'FadeSlideText');  // フレーズレベル設定
engine.assignTemplate('phrase_0_word_1', 'CustomTemplate');  // 単語レベルオーバーライド

// 🆕 一括割り当て（実装済み）
engine.batchAssignTemplate(['phrase_0', 'phrase_1', 'phrase_2'], 'FadeSlideText', true);
```

#### 2. 階層的パラメータ管理 ✅ **改善版実装済み**
```typescript
// パラメータの優先順位（実装済み）
// 1. オブジェクト固有パラメータ (phrase_0_word_1の個別設定)
// 2. 親オブジェクトパラメータ (phrase_0の設定)  
// 3. グローバルパラメータ (全体設定)
// 4. テンプレートデフォルト (テンプレート標準値)

// 🆕 改善されたパラメータ取得例
const effectiveParams = parameterManager.getEffectiveParams('phrase_0_word_1_char_2', templateId);

// 🆕 テンプレート変更時の高度なパラメータ保持（実装済み）
parameterManager.handleTemplateChange(
  oldTemplateId, 
  newTemplateId, 
  objectId, 
  preserveParams  // 共通パラメータ + 重要パラメータの保持
);
```

#### 3. テンプレート継承ロジック ✅
```typescript
// TemplateManager.ts - getTemplateForObject()（実装済み）
function getTemplateForObject(objectId: string): IAnimationTemplate {
  // 1. 直接割り当てをチェック
  if (assignments.has(objectId)) {
    return templates.get(assignments.get(objectId)!)!;
  }
  
  // 2. 親オブジェクトを再帰的にチェック
  const parentId = getParentObjectId(objectId);
  if (parentId) {
    return getTemplateForObject(parentId); // 再帰的継承
  }
  
  // 3. デフォルトテンプレート
  return templates.get(defaultTemplateId)!;
}
```

#### 4. 🆕 Undo/Redo システム ✅ **完全実装済み**
```typescript
// ProjectStateManager での状態管理（実装済み）
// テンプレート変更前の自動状態保存
engine.assignTemplate(objectId, templateId, preserveParams, saveState: true);

// Undo/Redo操作
const canUndo = engine.canUndo();  // 実装済み
const canRedo = engine.canRedo();  // 実装済み
engine.undo();  // 20ステップ履歴から復元
engine.redo();  // 状態の再適用
```

---

## 基本構造の実装

### ステップ 1: ファイルの作成とインポート

```typescript
import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase } from '../types/types';

/**
 * [テンプレート名] - 複数テンプレート対応・実装完了版準拠
 * [概要説明]
 */
export const [テンプレート名]: IAnimationTemplate = {
  metadata: {
    params: [
      // 🆕 改善されたパラメータ定義（階層継承を考慮）
      // 基本パラメータ
      { name: "fontSize", type: "number", default: 32, min: 12, max: 128, step: 1 },
      { 
        name: "fontFamily", 
        type: "string", 
        default: "Arial",
        // 🆕 選択肢対応（実装済み）
        options: [
          { value: "Arial", label: "Arial" },
          { value: "Helvetica", label: "Helvetica" },
          { value: "Hiragino Sans", label: "Hiragino Sans" },
          // ... 他の選択肢
        ]
      },
      
      // 🆕 状態別色設定パターン（FadeSlideTextで実装済み）
      { name: "defaultTextColor", type: "color", default: "#808080" },
      { name: "activeTextColor", type: "color", default: "#FF0000" },
      { name: "completedTextColor", type: "color", default: "#800000" },
      
      // 🆕 アニメーション制御（実装済みパターン）
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      
      // 🆕 階層別オフセット（継承可能）
      { name: "phraseOffsetX", type: "number", default: 0, min: -200, max: 200, step: 1 },
      { name: "wordOffsetX", type: "number", default: 0, min: -100, max: 100, step: 1 },
      { name: "charOffsetX", type: "number", default: 0, min: -50, max: 50, step: 1 },
      
      // 🆕 パフォーマンス・デバッグ関連
      { name: "debugMode", type: "boolean", default: false }
    ]
  },
  
  // 🆕 階層構造保持のための要素削除メソッド（必須実装）
  removeVisualElements(container) {
    // 実装内容（後述）
  },
  
  // 🆕 階層継承対応のメイン実装メソッド（必須実装）
  animateContainer(container, text, params, nowMs, startMs, endMs, hierarchyType, phase) {
    // 実装内容（後述）
  },
  
  // 🆕 階層別レンダリングメソッド（推奨実装）
  renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
    // フレーズレベルの実装
  },
  
  renderWordContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
    // 単語レベルの実装
  },
  
  renderCharContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
    // 文字レベルの実装
  }
};

export default [テンプレート名];
```

### ステップ 2: テンプレートレジストリへの登録

```typescript
// templates/registry/templateRegistry.ts への追加
export const templateRegistry: TemplateRegistryEntry[] = [
  // 既存のテンプレート
  {
    id: 'fadeslidetext',
    name: 'フェードスライドテキスト',
    template: templates.FadeSlideText
  },
  
  // 🆕 新しいテンプレートを追加
  {
    id: 'yourtemplate',
    name: 'あなたのテンプレート',
    template: templates.YourTemplate
  }
];
```

---

## 文字・単語カウント管理

### 現行実装における文字・単語カウントシステム

#### 1. 基本的なカウント構造（実装済みパターン）

```typescript
// CharUnit の実装構造（types.ts より）
interface CharUnit {
  id: string;           // 例: phrase_0_word_1_char_2
  char: string;         // 実際の文字
  start: number;        // 開始時間（ms）
  end: number;          // 終了時間（ms）
  charIndex?: number;   // フレーズ内での文字位置（0ベース）
  totalChars?: number;  // フレーズ内総文字数
  totalWords?: number;  // フレーズ内総単語数
  pixiObj?: PIXI.Text;  // PIXIオブジェクトの参照
}
```

#### 2. 文字位置計算の実装パターン（WordSlideTextより）

```typescript
// 半角・全角文字の区別と間隔調整
function isHalfWidthChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0020 && code <= 0x007E) ||    // ASCII英数字
         (code >= 0xFF61 && code <= 0xFF9F);       // 半角カタカナ
}

// 文字ごとの位置計算
renderWordContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
  const fontSize = params.fontSize || 32;
  const charSpacing = params.charSpacing || 1.0;
  let cumulativeXOffset = 0;
  
  if (params.chars && Array.isArray(params.chars)) {
    params.chars.forEach((charData, index) => {
      const char = charData.char;
      
      // 半角文字の間隔調整（WordSlideTextパターン）
      const effectiveSpacing = isHalfWidthChar(char) ? charSpacing * 0.6 : charSpacing;
      
      // 文字コンテナの位置設定
      charContainer.position.set(cumulativeXOffset, 0);
      
      // 次の文字用のオフセット更新
      cumulativeXOffset += fontSize * effectiveSpacing;
      
      // charIndexとtotalCharsの活用
      const charIndex = charData.charIndex || 0;
      const totalChars = charData.totalChars || 1;
      const progress = totalChars > 1 ? charIndex / (totalChars - 1) : 0;
    });
  }
}
```

#### 3. 多段レイアウトでの文字カウント（MultiLineTextパターン）

```typescript
// グローバル状態による段管理
const global = (window as any);
if (!global.__MULTILINE_STATE__) {
  global.__MULTILINE_STATE__ = {
    lastPhraseEndMs: -1,
    currentLine: 0,
    phraseLineMap: new Map(),
    lineHistory: []
  };
}

// 段の自動割り当て
renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
  const lineResetInterval = params.lineResetInterval || 5000;
  const maxLines = params.maxLines || 8;
  
  let lineIndex = 0;
  if (global.__MULTILINE_STATE__.phraseLineMap.has(params.id)) {
    lineIndex = global.__MULTILINE_STATE__.phraseLineMap.get(params.id);
  } else {
    // 新しい段の割り当て
    if (nowMs > global.__MULTILINE_STATE__.lastPhraseEndMs + lineResetInterval) {
      global.__MULTILINE_STATE__.currentLine = 0;
    }
    
    lineIndex = global.__MULTILINE_STATE__.currentLine % maxLines;
    global.__MULTILINE_STATE__.phraseLineMap.set(params.id, lineIndex);
    global.__MULTILINE_STATE__.currentLine = (lineIndex + 1) % maxLines;
  }
  
  // 段に基づく縦位置の計算
  const lineSpacing = params.lineSpacing || 60;
  const yOffset = lineIndex * lineSpacing;
  container.position.y = baseY + yOffset;
}
```

#### 4. 文字間隔の詳細制御

```typescript
// 高度な文字間隔制御パラメータ
metadata: {
  params: [
    { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: "halfWidthRatio", type: "number", default: 0.6, min: 0.3, max: 1.0, step: 0.1 },
    { name: "wordSpacing", type: "number", default: 1.2, min: 0.5, max: 2.0, step: 0.1 },
    { name: "lineSpacing", type: "number", default: 60, min: 30, max: 120, step: 5 }
  ]
}

// 実装での活用
const calculateCharacterPosition = (charData, index, params) => {
  const fontSize = params.fontSize || 32;
  const baseSpacing = params.charSpacing || 1.0;
  const halfWidthRatio = params.halfWidthRatio || 0.6;
  
  let xOffset = 0;
  for (let i = 0; i < index; i++) {
    const prevChar = charData[i].char;
    const spacing = isHalfWidthChar(prevChar) ? 
      baseSpacing * halfWidthRatio : baseSpacing;
    xOffset += fontSize * spacing;
  }
  
  return xOffset;
};
```

#### 5. 文字カウントベースのアニメーション

```typescript
// 文字インデックスベースのディレイ計算
renderCharContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
  const charIndex = params.charIndex || 0;
  const totalChars = params.totalChars || 1;
  const staggerDelay = params.charStaggerDelay || 50; // ms
  
  // 文字ごとのアニメーション開始時間
  const charStartMs = startMs + (charIndex * staggerDelay);
  const charEndMs = endMs + (charIndex * staggerDelay);
  
  // 文字位置に基づくエフェクト強度
  const normalizedIndex = totalChars > 1 ? charIndex / (totalChars - 1) : 0;
  const effectIntensity = 1.0 - Math.abs(normalizedIndex - 0.5) * 2; // 中央ほど強い
  
  // アニメーション状態の判定
  let charPhase = 'in';
  if (nowMs >= charStartMs && nowMs <= charEndMs) {
    charPhase = 'active';
  } else if (nowMs > charEndMs) {
    charPhase = 'out';
  }
}
```

#### 6. 単語境界の検出と処理

```typescript
// 単語境界での特殊処理
function isWordBoundary(char: string, nextChar: string): boolean {
  const isSpaceChar = /\s/.test(char);
  const isPunctuation = /[。、！？,.!?]/.test(char);
  const isEnglish = /[a-zA-Z]/.test(char);
  const isNextEnglish = nextChar ? /[a-zA-Z]/.test(nextChar) : false;
  
  return isSpaceChar || isPunctuation || (isEnglish && !isNextEnglish);
}

// 単語境界での間隔調整
renderWordContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
  const wordSpacing = params.wordSpacing || 1.2;
  
  params.chars.forEach((charData, index) => {
    const nextCharData = params.chars[index + 1];
    const isLastInWord = isWordBoundary(charData.char, nextCharData?.char);
    
    if (isLastInWord && nextCharData) {
      // 単語間に追加スペース
      cumulativeXOffset += fontSize * (wordSpacing - charSpacing);
    }
  });
}
```

---

## PixiJSフィルタとエフェクト実装

### 高度なフィルタエフェクトの実装

#### 1. Advanced Bloom Filterの実装（WordSlideTextパターン）

```typescript
// パッケージのインポート
import { AdvancedBloomFilter } from '@pixi/filter-advanced-bloom';

// フィルタパラメータの定義
metadata: {
  params: [
    { name: "enableGlow", type: "boolean", default: false },
    { name: "glowStrength", type: "number", default: 0.5, min: 0.1, max: 2.0, step: 0.1 },
    { name: "glowBrightness", type: "number", default: 1.0, min: 0.5, max: 2.0, step: 0.1 },
    { name: "glowBlur", type: "number", default: 2, min: 1, max: 10, step: 1 },
    { name: "glowQuality", type: "number", default: 4, min: 1, max: 8, step: 1 },
    { name: "glowThreshold", type: "number", default: 0.2, min: 0.0, max: 1.0, step: 0.05 }
  ]
}

// フィルタの適用とFilterArea管理
applyBloomEffect(container: PIXI.Container, params: Record<string, any>): void {
  const enableGlow = params.enableGlow || false;
  
  if (enableGlow) {
    // 既存フィルタの確認
    const hasBloomFilter = container.filters && 
      container.filters.some(filter => filter instanceof AdvancedBloomFilter);
    
    if (!hasBloomFilter) {
      const bloomFilter = new AdvancedBloomFilter({
        threshold: params.glowThreshold || 0.2,
        bloomScale: params.glowStrength || 0.5,
        brightness: params.glowBrightness || 1.0,
        blur: params.glowBlur || 2,
        quality: params.glowQuality || 4
      });
      
      container.filters = container.filters || [];
      container.filters.push(bloomFilter);
      
      // FilterAreaの設定（クリッピング防止）
      const bounds = container.getBounds();
      const padding = params.glowBlur * 10 + 20; // グロー範囲を考慮
      container.filterArea = new PIXI.Rectangle(
        bounds.x - padding,
        bounds.y - padding,
        bounds.width + padding * 2,
        bounds.height + padding * 2
      );
    }
  } else {
    // フィルタの削除
    if (container.filters) {
      container.filters = container.filters.filter(
        filter => !(filter instanceof AdvancedBloomFilter)
      );
      if (container.filters.length === 0) {
        container.filters = null;
        container.filterArea = null;
      }
    }
  }
}
```

#### 2. カスタムフィルタエフェクトの実装

```typescript
// シンプルなアウトラインフィルタ
class OutlineFilter extends PIXI.Filter {
  constructor(thickness: number = 1, color: number = 0x000000) {
    const vertex = `
      attribute vec2 aVertexPosition;
      attribute vec2 aTextureCoord;
      
      uniform mat3 projectionMatrix;
      
      varying vec2 vTextureCoord;
      
      void main(void) {
        gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
        vTextureCoord = aTextureCoord;
      }
    `;
    
    const fragment = `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform float thickness;
      uniform vec3 outlineColor;
      uniform vec2 textureSize;
      
      void main(void) {
        vec4 ownColor = texture2D(uSampler, vTextureCoord);
        vec4 curColor;
        float maxAlpha = 0.0;
        vec2 displaced;
        
        for (float angle = 0.0; angle < 6.28; angle += 1.047) {
          displaced.x = vTextureCoord.x + thickness * cos(angle) / textureSize.x;
          displaced.y = vTextureCoord.y + thickness * sin(angle) / textureSize.y;
          curColor = texture2D(uSampler, displaced);
          maxAlpha = max(maxAlpha, curColor.a);
        }
        
        vec4 resultColor = vec4(outlineColor, maxAlpha);
        gl_FragColor = mix(resultColor, ownColor, ownColor.a);
      }
    `;
    
    super(vertex, fragment);
    
    this.uniforms.thickness = thickness;
    this.uniforms.outlineColor = new Float32Array([
      ((color >> 16) & 0xFF) / 255,
      ((color >> 8) & 0xFF) / 255,
      (color & 0xFF) / 255
    ]);
  }
}

// フィルタの使用
const outlineFilter = new OutlineFilter(2, 0x000000);
container.filters = [outlineFilter];
```

#### 3. フィルタのパフォーマンス最適化

```typescript
// フィルタのキャッシュとプール管理
class FilterPool {
  private bloomFilters: AdvancedBloomFilter[] = [];
  
  getBloomFilter(config: any): AdvancedBloomFilter {
    let filter = this.bloomFilters.pop();
    if (!filter) {
      filter = new AdvancedBloomFilter(config);
    } else {
      // 設定の更新
      Object.assign(filter, config);
    }
    return filter;
  }
  
  returnBloomFilter(filter: AdvancedBloomFilter): void {
    if (this.bloomFilters.length < 5) { // プールサイズ制限
      this.bloomFilters.push(filter);
    } else {
      filter.destroy();
    }
  }
}

// フィルタ適用時のパフォーマンス考慮
applyFiltersOptimized(container: PIXI.Container, params: Record<string, any>): void {
  const enableEffects = params.enableEffects || false;
  
  // 表示範囲外の場合はフィルタを無効化
  if (!container.visible || container.alpha <= 0) {
    container.filters = null;
    return;
  }
  
  // 動的品質調整
  const app = (window as any).__PIXI_APP__;
  const fps = app?.ticker?.FPS || 60;
  const qualityMultiplier = fps > 45 ? 1.0 : 0.5; // FPS低下時に品質を落とす
  
  if (enableEffects) {
    const adjustedQuality = Math.floor((params.glowQuality || 4) * qualityMultiplier);
    // フィルタ設定...
  }
}
```

---

## テクスチャ操作とRenderTexture活用

### RenderTextureを活用した高度な表現

#### 1. GlitchTextでのテクスチャ分割技法

```typescript
// ベーステキストのレンダリング
createBaseTexture(text: string, style: PIXI.TextStyle): PIXI.RenderTexture {
  const app = (window as any).__PIXI_APP__;
  if (!app) throw new Error('PIXIアプリケーションが見つかりません');
  
  // ベーステキストの作成
  const baseText = new PIXI.Text(text, style);
  baseText.anchor.set(0.5, 0.5);
  
  // テクスチャサイズの計算（パディング考慮）
  const bounds = baseText.getBounds();
  const padding = 10;
  const textWidth = bounds.width + padding * 2;
  const textHeight = bounds.height + padding * 2;
  
  // RenderTextureの作成
  const renderTexture = PIXI.RenderTexture.create({
    width: Math.ceil(textWidth),
    height: Math.ceil(textHeight),
    resolution: 1
  });
  
  // テキストを中央に配置してレンダリング
  baseText.position.set(textWidth / 2, textHeight / 2);
  app.renderer.render(baseText, { renderTexture, clear: true });
  
  baseText.destroy(); // メモリリーク防止
  return renderTexture;
}

// テクスチャの分割とグリッチエフェクト
applyGlitchEffect(
  container: PIXI.Container,
  renderTexture: PIXI.RenderTexture,
  params: Record<string, any>
): void {
  const blockCount = params.glitchBlocks || 8;
  const intensity = params.glitchIntensity || 1.0;
  const colorShift = params.colorShift || 0.5;
  
  const textureWidth = renderTexture.width;
  const textureHeight = renderTexture.height;
  const blockHeight = textureHeight / blockCount;
  
  // シード付き乱数生成器（再現可能なグリッチ）
  const random = this.createSeededRandom(params.glitchSeed || 12345);
  
  for (let i = 0; i < blockCount; i++) {
    const y = i * blockHeight;
    const actualBlockHeight = Math.min(blockHeight, textureHeight - y);
    
    if (actualBlockHeight <= 0) break;
    
    // グリッチの発生確率
    if (random() > 0.3) continue;
    
    // フレームの作成（テクスチャの部分切り出し）
    const frame = new PIXI.Rectangle(0, y, textureWidth, actualBlockHeight);
    const blockTexture = new PIXI.Texture(renderTexture.baseTexture, frame);
    
    // スプライトの作成
    const sprite = new PIXI.Sprite(blockTexture);
    sprite.position.set(0, y);
    
    // グリッチエフェクトの適用
    const offsetX = (random() - 0.5) * intensity * 20;
    const scaleX = 1 + (random() - 0.5) * intensity * 0.2;
    
    sprite.position.x += offsetX;
    sprite.scale.x = scaleX;
    
    // カラーマトリックスフィルタでRGBシフト
    if (colorShift > 0) {
      const colorMatrix = new PIXI.filters.ColorMatrixFilter();
      const shift = (random() - 0.5) * colorShift;
      colorMatrix.matrix = [
        1 + shift, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1 - shift, 0, 0,
        0, 0, 0, 1, 0
      ];
      sprite.filters = [colorMatrix];
    }
    
    container.addChild(sprite);
  }
}
```

#### 2. テクスチャベースのマスク処理

```typescript
// 円形マスクテクスチャの作成
createCircularMask(radius: number): PIXI.RenderTexture {
  const size = radius * 2;
  const maskTexture = PIXI.RenderTexture.create({ width: size, height: size });
  
  const graphics = new PIXI.Graphics();
  graphics.beginFill(0xFFFFFF);
  graphics.drawCircle(radius, radius, radius);
  graphics.endFill();
  
  const app = (window as any).__PIXI_APP__;
  app.renderer.render(graphics, { renderTexture: maskTexture, clear: true });
  
  graphics.destroy();
  return maskTexture;
}

// グラデーションマスクの作成
createGradientMask(width: number, height: number, direction: string): PIXI.RenderTexture {
  const maskTexture = PIXI.RenderTexture.create({ width, height });
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  let gradient: CanvasGradient;
  switch (direction) {
    case 'horizontal':
      gradient = ctx.createLinearGradient(0, 0, width, 0);
      break;
    case 'vertical':
      gradient = ctx.createLinearGradient(0, 0, 0, height);
      break;
    case 'radial':
    default:
      gradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
      break;
  }
  
  gradient.addColorStop(0, 'white');
  gradient.addColorStop(1, 'black');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  const texture = PIXI.Texture.from(canvas);
  return PIXI.RenderTexture.from(texture);
}

// マスクの適用
applyTextureBasedMask(target: PIXI.Container, maskTexture: PIXI.RenderTexture): void {
  const maskSprite = new PIXI.Sprite(maskTexture);
  target.mask = maskSprite;
  target.addChild(maskSprite); // マスクもコンテナに追加が必要
}
```

#### 3. テクスチャアトラスの効率的な管理

```typescript
// テクスチャアトラス管理クラス
class TextureAtlasManager {
  private atlas: PIXI.RenderTexture;
  private allocatedAreas: Map<string, PIXI.Rectangle> = new Map();
  private currentX = 0;
  private currentY = 0;
  private rowHeight = 0;
  private atlasSize = 1024;
  
  constructor(size: number = 1024) {
    this.atlasSize = size;
    this.atlas = PIXI.RenderTexture.create({
      width: size,
      height: size,
      resolution: 1
    });
  }
  
  // テクスチャの登録
  addTexture(id: string, sourceTexture: PIXI.Texture): PIXI.Texture | null {
    const width = sourceTexture.width;
    const height = sourceTexture.height;
    
    // 領域の確保
    const area = this.allocateArea(width, height);
    if (!area) return null; // アトラスがフル
    
    // テクスチャのコピー
    const sprite = new PIXI.Sprite(sourceTexture);
    sprite.position.set(area.x, area.y);
    
    const app = (window as any).__PIXI_APP__;
    app.renderer.render(sprite, {
      renderTexture: this.atlas,
      clear: false,
      transform: null
    });
    
    sprite.destroy();
    
    // 新しいテクスチャの作成
    const atlasTexture = new PIXI.Texture(this.atlas.baseTexture, area);
    this.allocatedAreas.set(id, area);
    
    return atlasTexture;
  }
  
  private allocateArea(width: number, height: number): PIXI.Rectangle | null {
    // 行に収まらない場合は次の行へ
    if (this.currentX + width > this.atlasSize) {
      this.currentX = 0;
      this.currentY += this.rowHeight;
      this.rowHeight = 0;
    }
    
    // アトラスに収まらない場合
    if (this.currentY + height > this.atlasSize) {
      return null;
    }
    
    const area = new PIXI.Rectangle(this.currentX, this.currentY, width, height);
    this.currentX += width;
    this.rowHeight = Math.max(this.rowHeight, height);
    
    return area;
  }
}
```

---

## FontService統合とフォント管理

### Electronベースのフォント管理システム

#### 1. FontServiceの統合パターン

```typescript
// FontServiceのインポートと利用
import { FontService } from '../../services/FontService';

// 動的フォントオプションの定義
metadata: {
  params: [
    {
      name: "fontFamily",
      type: "string",
      default: "Arial",
      get options() {
        // 実行時にシステムフォントを取得
        return FontService.getAvailableFonts();
      }
    }
  ]
}

// フォントの検証と フォールバック
validateAndSetFont(style: PIXI.TextStyle, requestedFont: string): void {
  const availableFonts = FontService.getAvailableFonts();
  const fontExists = availableFonts.some(font => font.value === requestedFont);
  
  if (fontExists) {
    style.fontFamily = requestedFont;
  } else {
    console.warn(`フォント '${requestedFont}' が見つかりません。Arialにフォールバックします。`);
    style.fontFamily = 'Arial';
  }
}
```

#### 2. フォント読み込み状態の管理

```typescript
// フォント読み込み確認
async waitForFontLoad(fontFamily: string, timeout: number = 3000): Promise<boolean> {
  if (!document.fonts) return true; // フォントAPIが無い場合はスキップ
  
  try {
    await document.fonts.load(`16px "${fontFamily}"`);
    return document.fonts.check(`16px "${fontFamily}"`);
  } catch (error) {
    console.warn(`フォント読み込みエラー: ${fontFamily}`, error);
    return false;
  }
}

// フォント対応テキスト作成
async createTextWithFont(
  text: string,
  fontFamily: string,
  fontSize: number,
  color: string
): Promise<PIXI.Text> {
  
  // フォント読み込みを待機
  const fontLoaded = await this.waitForFontLoad(fontFamily);
  
  const style = new PIXI.TextStyle({
    fontFamily: fontLoaded ? fontFamily : 'Arial',
    fontSize: fontSize,
    fill: color,
    align: 'center'
  });
  
  const textObject = new PIXI.Text(text, style);
  
  // フォント読み込み完了後の再描画
  if (!fontLoaded) {
    this.waitForFontLoad(fontFamily).then((loaded) => {
      if (loaded) {
        textObject.style.fontFamily = fontFamily;
        textObject.dirty = true; // 再描画フラグ
      }
    });
  }
  
  return textObject;
}
```

#### 3. フォントメトリクス計算

```typescript
// 文字の正確な寸法計算
calculateTextMetrics(text: string, style: PIXI.TextStyle): {
  width: number,
  height: number,
  baseline: number
} {
  const metrics = PIXI.TextMetrics.measureText(text, style);
  
  return {
    width: metrics.width,
    height: metrics.height,
    baseline: metrics.fontProperties.descent
  };
}

// 行高の自動調整
calculateOptimalLineHeight(fontFamily: string, fontSize: number): number {
  const tempStyle = new PIXI.TextStyle({
    fontFamily: fontFamily,
    fontSize: fontSize
  });
  
  // 標準的な文字でメトリクスを測定
  const metrics = PIXI.TextMetrics.measureText('Ajyが', tempStyle);
  const fontProperties = metrics.fontProperties;
  
  // ベースラインと下降部を考慮した行高
  return fontProperties.fontSize + fontProperties.descent * 0.2;
}
```

---

## パフォーマンス最適化技法

### 現行システムで実装済みの最適化パターン

#### 1. シード付き乱数生成（GlitchTextパターン）

```typescript
// 再現可能な乱数生成器
createSeededRandom(seed: number): () => number {
  let state = seed;
  return function() {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// 使用例：毎回同じグリッチパターンを生成
const random = this.createSeededRandom(params.glitchSeed || 12345);
for (let i = 0; i < blockCount; i++) {
  if (random() > 0.3) continue; // 同じパターンでブロックをスキップ
  // グリッチエフェクトの適用...
}
```

#### 2. グローバル状態による効率的な状態管理

```typescript
// グローバル状態の活用（MultiLineTextパターン）
const global = (window as any);
if (!global.__MULTILINE_STATE__) {
  global.__MULTILINE_STATE__ = {
    lastPhraseEndMs: -1,
    currentLine: 0,
    phraseLineMap: new Map(),
    lineHistory: [],
    stateVersion: 1
  };
}

// 状態変更の検出と最適化
checkStateVersion(): boolean {
  const currentVersion = global.__MULTILINE_STATE__.stateVersion;
  if (this.lastKnownVersion !== currentVersion) {
    this.lastKnownVersion = currentVersion;
    return true; // 再計算が必要
  }
  return false; // キャッシュ利用可能
}
```

#### 3. オブジェクトプールパターン

```typescript
// 再利用可能オブジェクトプール
class ObjectPool<T> {
  private objects: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;
  
  constructor(createFn: () => T, resetFn: (obj: T) => void, maxSize: number = 50) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }
  
  get(): T {
    const obj = this.objects.pop();
    if (obj) {
      this.resetFn(obj);
      return obj;
    }
    return this.createFn();
  }
  
  return(obj: T): void {
    if (this.objects.length < this.maxSize) {
      this.objects.push(obj);
    } else {
      // プールが満杯の場合は破棄
      if ((obj as any).destroy) {
        (obj as any).destroy();
      }
    }
  }
}

// 使用例：グラフィックスオブジェクトプール
const graphicsPool = new ObjectPool(
  () => new PIXI.Graphics(),
  (graphics) => graphics.clear(),
  20
);

// テンプレート内での使用
renderCharContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType) {
  const circle = graphicsPool.get();
  circle.lineStyle(lineWidth, color);
  circle.drawCircle(0, 0, radius);
  container.addChild(circle);
  
  // 後でプールに返却
  // cleanup時: graphicsPool.return(circle);
}
```

#### 4. フレームレート適応品質制御

```typescript
// 動的品質調整システム
class AdaptiveQualityManager {
  private targetFPS = 60;
  private qualityLevel = 1.0;
  private frameTimeHistory: number[] = [];
  private maxHistorySize = 30;
  
  updateFrameTime(deltaTime: number): void {
    this.frameTimeHistory.push(deltaTime);
    if (this.frameTimeHistory.length > this.maxHistorySize) {
      this.frameTimeHistory.shift();
    }
    
    // 平均フレーム時間から品質を調整
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    const currentFPS = 1000 / avgFrameTime;
    
    if (currentFPS < this.targetFPS * 0.8) {
      this.qualityLevel = Math.max(0.3, this.qualityLevel - 0.1);
    } else if (currentFPS > this.targetFPS * 0.95) {
      this.qualityLevel = Math.min(1.0, this.qualityLevel + 0.05);
    }
  }
  
  getQualityLevel(): number {
    return this.qualityLevel;
  }
}

// テンプレート内での適用
renderWithAdaptiveQuality(container: PIXI.Container, params: Record<string, any>): void {
  const qualityLevel = this.qualityManager.getQualityLevel();
  
  // 品質に応じてエフェクトパラメータを調整
  const effectIntensity = params.effectIntensity * qualityLevel;
  const particleCount = Math.floor(params.particleCount * qualityLevel);
  const filterQuality = Math.max(1, Math.floor(params.filterQuality * qualityLevel));
  
  // 低品質時は一部エフェクトを無効化
  if (qualityLevel < 0.5) {
    container.filters = null;
  }
}
```

#### 5. 効率的な境界検出と表示範囲最適化

```typescript
// 表示範囲の事前計算
calculateVisibilityBounds(container: PIXI.Container): {
  isVisible: boolean,
  intersectionRatio: number
} {
  const app = (window as any).__PIXI_APP__;
  if (!app) return { isVisible: true, intersectionRatio: 1.0 };
  
  const bounds = container.getBounds();
  const screenBounds = new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height);
  
  // 画面外判定
  if (bounds.right < 0 || bounds.left > screenBounds.width ||
      bounds.bottom < 0 || bounds.top > screenBounds.height) {
    return { isVisible: false, intersectionRatio: 0 };
  }
  
  // 交差率の計算
  const intersectionArea = Math.max(0,
    Math.min(bounds.right, screenBounds.right) - Math.max(bounds.left, screenBounds.left)
  ) * Math.max(0,
    Math.min(bounds.bottom, screenBounds.bottom) - Math.max(bounds.top, screenBounds.top)
  );
  
  const boundsArea = bounds.width * bounds.height;
  const intersectionRatio = boundsArea > 0 ? intersectionArea / boundsArea : 0;
  
  return {
    isVisible: intersectionRatio > 0.01, // 1%以上見えている場合のみ描画
    intersectionRatio
  };
}

// 表示最適化の適用
optimizeVisualElements(container: PIXI.Container, params: Record<string, any>): void {
  const visibility = this.calculateVisibilityBounds(container);
  
  if (!visibility.isVisible) {
    container.visible = false;
    return;
  }
  
  container.visible = true;
  
  // 部分的に見えている場合の詳細度調整
  if (visibility.intersectionRatio < 0.5) {
    // LOD (Level of Detail) の適用
    const simplifiedMode = true;
    this.renderWithLOD(container, params, simplifiedMode);
  } else {
    this.renderWithLOD(container, params, false);
  }
}
```

---

## エラーハンドリングとデバッグ

### 堅牢なエラーハンドリングパターン

#### 1. 段階的フォールバック処理

```typescript
// 高度なレンダリング → 基本レンダリング → 最小限レンダリング
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
  try {
    // 高度なエフェクト付きレンダリング
    return this.renderAdvancedCharacter(container, text, params, nowMs, startMs, endMs, phase);
  } catch (error) {
    console.warn('高度なレンダリングに失敗しました。基本レンダリングにフォールバックします:', error);
    
    try {
      // 基本的なレンダリング
      return this.renderBasicCharacter(container, text, params, nowMs, startMs, endMs, phase);
    } catch (fallbackError) {
      console.error('基本レンダリングも失敗しました。最小限のレンダリングを実行します:', fallbackError);
      
      try {
        // 最小限のテキスト表示
        return this.renderMinimalCharacter(container, text, params);
      } catch (minimalError) {
        console.error('レンダリングが完全に失敗しました:', minimalError);
        return false;
      }
    }
  }
}

// 最小限のレンダリング実装
renderMinimalCharacter(
  container: PIXI.Container,
  text: string,
  params: Record<string, any>
): boolean {
  const fontSize = Math.max(12, Math.min(72, params.fontSize || 32));
  const color = params.activeTextColor || '#FFFFFF';
  
  const style = new PIXI.TextStyle({
    fontFamily: 'Arial', // 確実に存在するフォント
    fontSize: fontSize,
    fill: color
  });
  
  const textObj = new PIXI.Text(text, style);
  textObj.anchor.set(0.5, 0.5);
  container.addChild(textObj);
  
  return true;
}
```

#### 2. リソース管理とメモリリーク防止

```typescript
// リソース管理クラス
class ResourceManager {
  private resources: Set<PIXI.DisplayObject> = new Set();
  private textures: Set<PIXI.Texture> = new Set();
  private renderTextures: Set<PIXI.RenderTexture> = new Set();
  
  register(resource: PIXI.DisplayObject | PIXI.Texture | PIXI.RenderTexture): void {
    if (resource instanceof PIXI.DisplayObject) {
      this.resources.add(resource);
    } else if (resource instanceof PIXI.RenderTexture) {
      this.renderTextures.add(resource);
    } else if (resource instanceof PIXI.Texture) {
      this.textures.add(resource);
    }
  }
  
  cleanup(): void {
    // DisplayObjectsの破棄
    this.resources.forEach(resource => {
      try {
        if (resource.parent) {
          resource.parent.removeChild(resource);
        }
        resource.destroy({ children: true });
      } catch (error) {
        console.warn('リソース破棄エラー:', error);
      }
    });
    
    // RenderTexturesの破棄
    this.renderTextures.forEach(texture => {
      try {
        texture.destroy(true);
      } catch (error) {
        console.warn('RenderTexture破棄エラー:', error);
      }
    });
    
    // 通常のTexturesの破棄
    this.textures.forEach(texture => {
      try {
        if (texture.destroyBase !== false) {
          texture.destroy();
        }
      } catch (error) {
        console.warn('Texture破棄エラー:', error);
      }
    });
    
    this.resources.clear();
    this.textures.clear();
    this.renderTextures.clear();
  }
}

// テンプレート内での使用
export const YourTemplate: IAnimationTemplate = {
  private resourceManager: ResourceManager = new ResourceManager();
  
  removeVisualElements(container: PIXI.Container): void {
    // リソース管理付きの要素削除
    container.children.forEach(child => {
      if (!(child instanceof PIXI.Container) || 
          !(child as any).name?.includes('_container_')) {
        this.resourceManager.register(child);
      }
    });
    
    // 標準的な削除処理
    this.standardRemoveVisualElements(container);
    
    // リソースのクリーンアップ
    this.resourceManager.cleanup();
  }
};
```

#### 3. デバッグ情報の効率的な管理

```typescript
// デバッグログ管理システム
class DebugLogger {
  private static instance: DebugLogger;
  private logBuffer: Array<{timestamp: number, level: string, message: string}> = [];
  private maxBufferSize = 1000;
  private logLevel: 'error' | 'warn' | 'info' | 'debug' = 'warn';
  
  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }
  
  setLogLevel(level: 'error' | 'warn' | 'info' | 'debug'): void {
    this.logLevel = level;
  }
  
  log(level: 'error' | 'warn' | 'info' | 'debug', message: string, data?: any): void {
    if (this.shouldLog(level)) {
      const timestamp = performance.now();
      this.logBuffer.push({ timestamp, level, message });
      
      if (this.logBuffer.length > this.maxBufferSize) {
        this.logBuffer.shift();
      }
      
      console[level](`[${level.toUpperCase()}] ${message}`, data || '');
    }
  }
  
  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(level) <= levels.indexOf(this.logLevel);
  }
  
  exportLogs(): string {
    return this.logBuffer.map(log => 
      `${log.timestamp.toFixed(2)}ms [${log.level}] ${log.message}`
    ).join('\n');
  }
}

// テンプレート内での使用
animateContainer(container, text, params, nowMs, startMs, endMs, hierarchyType, phase) {
  const logger = DebugLogger.getInstance();
  
  logger.log('debug', `アニメーション開始: ${hierarchyType}`, {
    text, nowMs, startMs, endMs, phase
  });
  
  try {
    // アニメーション処理...
    const result = this.performAnimation(container, text, params, nowMs, startMs, endMs, hierarchyType, phase);
    
    logger.log('debug', `アニメーション完了: ${hierarchyType}`);
    return result;
  } catch (error) {
    logger.log('error', `アニメーションエラー: ${hierarchyType}`, error);
    return false;
  }
}
```

#### 4. パフォーマンス監視とアラート

```typescript
// パフォーマンス監視システム
class PerformanceMonitor {
  private frameTimeHistory: number[] = [];
  private maxHistorySize = 60; // 1秒分のフレーム（60FPS想定）
  private alertThreshold = 33.33; // 30FPS以下でアラート
  private memoryUsageHistory: number[] = [];
  
  recordFrameTime(deltaTime: number): void {
    this.frameTimeHistory.push(deltaTime);
    if (this.frameTimeHistory.length > this.maxHistorySize) {
      this.frameTimeHistory.shift();
    }
    
    // メモリ使用量の記録（定期的に）
    if (this.frameTimeHistory.length % 30 === 0) {
      this.recordMemoryUsage();
    }
    
    this.checkPerformanceAlerts();
  }
  
  private recordMemoryUsage(): void {
    if ((performance as any).memory) {
      const memoryInfo = (performance as any).memory;
      const usageRatio = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
      this.memoryUsageHistory.push(usageRatio);
      
      if (this.memoryUsageHistory.length > 20) { // 最新20件のみ保持
        this.memoryUsageHistory.shift();
      }
    }
  }
  
  private checkPerformanceAlerts(): void {
    if (this.frameTimeHistory.length < 10) return;
    
    const recentFrames = this.frameTimeHistory.slice(-10);
    const avgFrameTime = recentFrames.reduce((a, b) => a + b, 0) / recentFrames.length;
    
    if (avgFrameTime > this.alertThreshold) {
      console.warn(`パフォーマンス警告: 平均フレーム時間 ${avgFrameTime.toFixed(2)}ms (${(1000/avgFrameTime).toFixed(1)}FPS)`);
    }
    
    // メモリ使用量チェック
    const currentMemoryUsage = this.memoryUsageHistory[this.memoryUsageHistory.length - 1];
    if (currentMemoryUsage && currentMemoryUsage > 0.85) {
      console.warn(`メモリ使用量警告: ${(currentMemoryUsage * 100).toFixed(1)}%`);
    }
  }
  
  getPerformanceReport(): {
    averageFPS: number,
    memoryUsage: number,
    frameTimeVariance: number
  } {
    if (this.frameTimeHistory.length === 0) {
      return { averageFPS: 0, memoryUsage: 0, frameTimeVariance: 0 };
    }
    
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    const variance = this.frameTimeHistory.reduce((acc, time) => {
      return acc + Math.pow(time - avgFrameTime, 2);
    }, 0) / this.frameTimeHistory.length;
    
    return {
      averageFPS: 1000 / avgFrameTime,
      memoryUsage: this.memoryUsageHistory[this.memoryUsageHistory.length - 1] || 0,
      frameTimeVariance: variance
    };
  }
}
```

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Update template guide header and version info", "status": "completed", "priority": "high"}, {"id": "2", "content": "Add current character/word counting implementation patterns", "status": "completed", "priority": "high"}, {"id": "3", "content": "Add PixiJS filter implementation guidelines", "status": "completed", "priority": "high"}, {"id": "4", "content": "Add texture manipulation and RenderTexture techniques", "status": "completed", "priority": "high"}, {"id": "5", "content": "Update interface definitions to match current types", "status": "in_progress", "priority": "medium"}, {"id": "6", "content": "Add FontService integration patterns", "status": "completed", "priority": "medium"}, {"id": "7", "content": "Add performance optimization techniques", "status": "completed", "priority": "medium"}, {"id": "8", "content": "Add error handling and debugging guidelines", "status": "completed", "priority": "low"}]

### 🆕 改善されたパラメータ設計原則

#### 1. 階層継承を考慮したパラメータ定義（実装済みパターン）
```typescript
metadata: {
  params: [
    // 基本パラメータ（全階層で有効）
    { name: "fontSize", type: "number", default: 32, min: 12, max: 128, step: 1 },
    { name: "fontFamily", type: "string", default: "Arial" },
    
    // 🆕 状態別色設定（FadeSlideTextパターン）
    { name: "defaultTextColor", type: "color", default: "#808080" },     // 非アクティブ時
    { name: "activeTextColor", type: "color", default: "#FF0000" },      // アクティブ時  
    { name: "completedTextColor", type: "color", default: "#800000" },   // 完了時
    
    // 🆕 アニメーション制御（継承可能、実装済み）
    { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
    { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
    { name: "initialSpeed", type: "number", default: 0.1, min: 0.01, max: 1.0, step: 0.01 },
    { name: "activeSpeed", type: "number", default: 0.01, min: 0.001, max: 0.1, step: 0.001 },
    
    // 🆕 階層別オフセット（子要素での微調整用）
    { name: "phraseOffsetX", type: "number", default: 0, min: -200, max: 200, step: 1 },
    { name: "wordOffsetX", type: "number", default: 0, min: -100, max: 100, step: 1 },
    { name: "charOffsetX", type: "number", default: 0, min: -50, max: 50, step: 1 },
    
    // 🆕 視覚要素制御（実装済みパターン）
    { name: "circleSize", type: "number", default: 40, min: 10, max: 200, step: 1 },
    { name: "circleLineWidth", type: "number", default: 8, min: 1, max: 20, step: 1 },
    { name: "circleOpacity", type: "number", default: 1.0, min: 0.0, max: 1.0, step: 0.01 },
    
    // 🆕 レイアウト制御（重要パラメータ - 強制保持対象）
    { name: "charSpacing", type: "number", default: 1.0, min: 0.1, max: 3.0, step: 0.1 },
    { name: "rightOffset", type: "number", default: 100, min: 0, max: 500, step: 10 },
    
    // パフォーマンス関連
    { name: "debugMode", type: "boolean", default: false }
  ]
}
```

#### 2. 🆕 改善された階層継承パラメータのアクセスパターン
```typescript
// テンプレート内でのパラメータ取得（実装済みパターン）
animateContainer(container, text, params, nowMs, startMs, endMs, hierarchyType, phase) {
  // 基本パラメータ（全階層共通）
  const fontSize = params.fontSize || 32;
  const fontFamily = params.fontFamily || 'Arial';
  
  // 🆕 状態別色設定の取得
  const defaultTextColor = params.defaultTextColor || '#808080';
  const activeTextColor = params.activeTextColor || '#FF0000';
  const completedTextColor = params.completedTextColor || '#800000';
  
  // 🆕 階層別オフセット（実装済みパターン）
  let offsetX = 0;
  switch (hierarchyType) {
    case 'phrase':
      offsetX = params.phraseOffsetX || 0;
      break;
    case 'word':
      offsetX = params.wordOffsetX || 0;
      break;
    case 'char':
      offsetX = params.charOffsetX || 0;
      break;
  }
  
  // 🆕 フレーズからの継承情報（実装済み機能）
  const phrasePhase = params.phrasePhase || phase;
  const phraseStartMs = params.phraseStartMs || startMs;
  const phraseEndMs = params.phraseEndMs || endMs;
  
  // 🆕 アニメーション制御パラメータ
  const headTime = params.headTime || 500;
  const tailTime = params.tailTime || 500;
  const initialSpeed = params.initialSpeed || 0.1;
  const activeSpeed = params.activeSpeed || 0.01;
  
  // デバッグ情報（パフォーマンス考慮、制限付きログ）
  if (params.debugMode && nowMs % 1000 < 16) {  // 1秒に1回程度
    console.log(`[${hierarchyType}] Phase: ${phase}, Offset: ${offsetX}, Speed: ${phase === 'active' ? activeSpeed : initialSpeed}`);
  }
}
```

---

## 階層対応のアニメーション実装

### ステップ 1: removeVisualElements メソッドの実装（必須）

**重要**: 階層構造を保持しながら表示要素のみを更新するため必須実装

```typescript
// 🆕 実装済みパターンに基づく標準実装
removeVisualElements(container: PIXI.Container): void {
  const childrenToKeep: PIXI.DisplayObject[] = [];
  const childrenToRemove: PIXI.DisplayObject[] = [];
  
  container.children.forEach(child => {
    // 階層構造コンテナは保持（名前パターンで判定）
    if (child instanceof PIXI.Container && 
        (child as any).name && 
        ((child as any).name.includes('phrase_container_') || 
         (child as any).name.includes('word_container_') || 
         (child as any).name.includes('char_container_'))) {
      childrenToKeep.push(child);
    } else {
      // 表示要素（Graphics, Textなど）は削除対象
      childrenToRemove.push(child);
    }
  });
  
  // 表示要素のみを削除
  childrenToRemove.forEach(child => {
    container.removeChild(child);
    if (child instanceof PIXI.Container) {
      child.destroy({ children: true });
    } else {
      child.destroy();
    }
  });
}
```

### ステップ 2: 🆕 animateContainer メソッドの実装（必須）

```typescript
// 🆕 実装済みパターンに基づく標準実装
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
  
  // テキスト処理
  const textContent = Array.isArray(text) ? text.join('') : text;
  
  // 可視性設定
  container.visible = true;
  
  // 表示要素の削除（階層構造は維持）
  this.removeVisualElements!(container);
  
  // 🆕 階層別処理の分岐（実装済みパターン）
  switch (hierarchyType) {
    case 'phrase':
      return this.renderPhraseContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
    case 'word':
      return this.renderWordContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
    case 'char':
      return this.renderCharContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
    default:
      console.warn(`未知の階層タイプ: ${hierarchyType}`);
      return false;
  }
}
```

### ステップ 3: 階層別レンダリング実装（FadeSlideTextパターンベース）

#### 🆕 フレーズレベルの実装（実装済みパターン）
```typescript
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
  
  // 🆕 フレーズレベルのパラメータ取得（実装済み）
  const headTime = params.headTime || 500;
  const tailTime = params.tailTime || 500;
  const phraseOffsetX = params.phraseOffsetX || 0;
  const initialSpeed = params.initialSpeed || 0.1;
  const activeSpeed = params.activeSpeed || 0.01;
  const rightOffset = params.rightOffset || 100;
  
  // 🆕 PIXIアプリケーション情報の取得（実装済みパターン）
  const app = (window as any).__PIXI_APP__;
  if (!app || !app.renderer) {
    console.warn('PIXIアプリが見つかりません');
    container.position.set(0, 0);
    return true;
  }
  
  const screenWidth = app.renderer.width;
  const screenHeight = app.renderer.height;
  const centerY = screenHeight / 2;
  const startPositionX = screenWidth + rightOffset;
  
  // 🆕 時間計算（拡張アニメーション期間を含む、実装済み）
  const inStartTime = startMs - headTime;
  const outEndTime = endMs + tailTime;
  
  // 🆕 段階的フェーズ判定（実装済み）
  let actualPhase = phase;
  if (nowMs < inStartTime) {
    actualPhase = 'in';
  } else if (nowMs > outEndTime) {
    actualPhase = 'out';
  } else if (nowMs >= startMs && nowMs <= endMs) {
    actualPhase = 'active';
  }
  
  // 🆕 フレーズレベルのアニメーション計算（FadeSlideTextパターン）
  let posX = startPositionX;
  let alpha = 1.0;
  
  if (nowMs < inStartTime) {
    // 入場前：初期位置で非表示
    posX = startPositionX;
    alpha = 0;
  } else if (nowMs < startMs) {
    // 入場アニメーション：右から中央へ（イージング付き）
    const progress = (nowMs - inStartTime) / headTime;
    const easedProgress = this.easeOutCubic(progress);  // イージング関数
    posX = startPositionX - (startPositionX - screenWidth/2) * easedProgress;
    alpha = progress;
  } else if (nowMs <= endMs) {
    // アクティブ時：中央から左へゆっくり移動
    const activeTime = nowMs - startMs;
    posX = screenWidth/2 - activeTime * activeSpeed;
    alpha = 1.0;
  } else if (nowMs < outEndTime) {
    // 退場アニメーション：左方向に加速
    const exitProgress = (nowMs - endMs) / tailTime;
    const easedProgress = this.easeInCubic(exitProgress);  // イージング関数
    const activeTime = endMs - startMs;
    const basePos = screenWidth/2 - activeTime * activeSpeed;
    posX = basePos - easedProgress * activeSpeed * tailTime * (initialSpeed / activeSpeed);
    alpha = 1.0 - exitProgress;
  } else {
    // 退場後：非表示
    alpha = 0;
  }
  
  // フレーズ全体の移動とフェード
  container.position.x = posX + phraseOffsetX;
  container.position.y = centerY;
  container.alpha = alpha;
  
  // 重要: 子コンテナの変換行列を更新
  container.updateTransform();
  
  // 🆕 デバッグ情報（制限付き、実装済みパターン）
  if (params.debugMode && nowMs % 1000 < 16) {
    console.log(`フレーズコンテナ: phase=${actualPhase}, pos=${posX}, alpha=${alpha}`);
  }
  
  return true;
}

// 🆕 イージング関数（実装済み）
private easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

private easeInCubic(t: number): number {
  return t * t * t;
}
```

#### 🆕 単語レベルの実装（実装済みパターン）
```typescript
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
  
  // 🆕 単語レベルのパラメータ（実装済み）
  const wordOffsetX = params.wordOffsetX || 0;
  const wordOffsetY = params.wordOffsetY || 0;
  const fontSize = params.fontSize || 32;
  const charSpacing = params.charSpacing || 1.0;
  
  // 🆕 フレーズフェーズを考慮した表示制御（実装済み）
  const phrasePhase = params.phrasePhase || phase;
  const phraseStartMs = params.phraseStartMs || startMs;
  const phraseEndMs = params.phraseEndMs || endMs;
  const headTime = params.headTime || 500;
  const tailTime = params.tailTime || 500;
  
  // フレーズが表示期間外の場合は非表示
  const phraseInStartTime = phraseStartMs - headTime;
  const phraseOutEndTime = phraseEndMs + tailTime;
  
  if (nowMs < phraseInStartTime || nowMs > phraseOutEndTime) {
    container.visible = false;
    return true;
  }
  
  // 単語コンテナは常にローカル座標の原点に配置
  container.position.set(wordOffsetX, wordOffsetY);
  container.visible = true;
  
  // 🆕 文字コンテナの管理（実装済みパターン）
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
      
      // 🆕 文字アニメーションの適用（階層継承）
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
}
```

#### 🆕 文字レベルの実装（実装済みパターン）
```typescript
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
  
  // 🆕 文字レベルのパラメータ（実装済み）
  const charOffsetX = params.charOffsetX || 0;
  const charOffsetY = params.charOffsetY || 0;
  const fontSize = params.fontSize || 32;
  const fontFamily = params.fontFamily || 'Arial';
  
  // 🆕 状態別色設定（実装済みパターン）
  const defaultTextColor = params.defaultTextColor || '#808080';
  const activeTextColor = params.activeTextColor || '#FF0000';
  const completedTextColor = params.completedTextColor || '#800000';
  
  // 🆕 フレーズ継承情報の活用（実装済み）
  const phrasePhase = params.phrasePhase || phase;
  const headTime = params.headTime || 500;
  const tailTime = params.tailTime || 500;
  const phraseStartMs = params.phraseStartMs || startMs;
  const phraseEndMs = params.phraseEndMs || endMs;
  
  // フレーズが表示期間外の場合は非表示
  const phraseInStartTime = phraseStartMs - headTime;
  const phraseOutEndTime = phraseEndMs + tailTime;
  
  if (nowMs < phraseInStartTime || nowMs > phraseOutEndTime) {
    container.visible = false;
    return true;
  }
  
  container.visible = true;
  
  // 🆕 文字の状態に応じた色決定（実装済み）
  let textColor = defaultTextColor;
  let showSpecialEffect = false;
  
  if (nowMs < startMs) {
    // 文字のイン前
    textColor = defaultTextColor;
    showSpecialEffect = false;
  } else if (nowMs <= endMs) {
    // 文字のアクティブ期間
    textColor = activeTextColor;
    showSpecialEffect = true;
  } else {
    // 文字のアウト後
    textColor = completedTextColor;
    showSpecialEffect = false;
  }
  
  // 🆕 文字テキストの描画（改善版）
  const textStyle = new PIXI.TextStyle({
    fontFamily: fontFamily,
    fontSize: fontSize,
    fill: textColor,  // 状態に応じた色
    align: 'center',
    fontWeight: 'normal'
  });
  
  const textObj = new PIXI.Text(text, textStyle);
  textObj.anchor.set(0.5, 0.5);
  textObj.position.set(charOffsetX, charOffsetY);
  
  container.addChild(textObj);
  
  // 🆕 特殊効果の描画（アクティブ期間のみ、実装済みパターン）
  if (showSpecialEffect) {
    const circleColor = parseInt((params.circleColor || '#FFFFFF').replace('#', '0x'));
    const circleSize = params.circleSize || fontSize + 8;
    const circleLineWidth = params.circleLineWidth || 8;
    const circleOpacity = params.circleOpacity || 1.0;
    
    const circle = new PIXI.Graphics();
    circle.lineStyle(circleLineWidth, circleColor, circleOpacity);
    circle.drawCircle(charOffsetX, charOffsetY, circleSize / 2);
    
    container.addChild(circle);
  }
  
  return true;
}
```

---

## イージング関数の実装参考例

### 基本的なイージング関数の定義

MultiLineTextテンプレートで実装されている方法を参考に、以下のようにイージング関数を定義します：

```typescript
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
 * 四次イージング（アウト）：より滑らかな減速
 */
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * サインカーブイージング：自然な加減速
 */
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
```

### 速度ベースの距離計算

MultiLineTextで実装されている高度な速度制御パターン：

```typescript
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
```

### 入場アニメーションでの使用例

```typescript
// MultiLineTextの入場アニメーション実装例
if (nowMs < startMs) {
  // 入場アニメーション期間：速度ベースの移動
  const elapsedTime = nowMs - inStartTime;
  const distance = calculateDistanceFromSpeed(
    elapsedTime,
    headTime,
    entranceInitialSpeed,  // 高速で開始（例: 2.0 px/ms）
    activeSpeed,           // 低速で終了（例: 0.05 px/ms）
    easeOutCubic          // 減速カーブ
  );
  posX = startPositionX - distance;
  alpha = elapsedTime / headTime;
}
```

### 退場アニメーションでの使用例

```typescript
// 退場アニメーション：activeSpeedから高速へ加速
const elapsedExitTime = nowMs - endMs;
const exitFinalSpeed = 2.0; // 退場終了速度（高速）
const exitDistance = calculateDistanceFromSpeed(
  elapsedExitTime,
  tailTime,
  activeSpeed,      // 低速で開始
  exitFinalSpeed,   // 高速で終了
  easeInCubic      // 加速カーブ
);
posX = basePos - exitDistance;
alpha = 1.0 - (elapsedExitTime / tailTime);
```

### パラメータ定義の推奨例

```typescript
// アニメーション速度とタイミングのパラメータ定義
{ name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },         // 入場アニメーション時間（ms）
{ name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },         // 退場アニメーション時間（ms）
{ name: "entranceInitialSpeed", type: "number", default: 2.0, min: 0.1, max: 5.0, step: 0.1 }, // 入場開始速度（px/ms）
{ name: "activeSpeed", type: "number", default: 0.05, min: 0.01, max: 1.0, step: 0.01 }, // アクティブ時の移動速度（px/ms）
```

### イージング関数の選択ガイド

1. **easeOutCubic**: 入場アニメーション向き。素早く始まり、なめらかに減速
2. **easeInCubic**: 退場アニメーション向き。ゆっくり始まり、加速して消える
3. **easeInOutSine**: 双方向アニメーション向き。自然な加減速
4. **線形（イージングなし）**: 一定速度の動き。機械的な印象

### 実装時の注意点

1. **パフォーマンス**: 数値積分は計算コストが高いため、ステップ数を適切に制限
2. **精度**: 短いアニメーション（< 100ms）では積分ステップ数を調整
3. **互換性**: 既存のアニメーションシステムとの整合性を保つ

---

## デバッグとパフォーマンス最適化

### 🆕 実装済みデバッグシステムの活用

#### 1. DebugManager との連携（実装済み）
```typescript
// Engine.ts での使用例（実装済み）
engine.setDebugEnabled(true);    // デバッグモード有効
engine.setGridVisible(true);     // 方眼目盛り表示

// デバッグマネージャーの取得
const debugManager = engine.getDebugManager();
debugManager.dumpContainerHierarchy(container);  // 階層構造出力
```

#### 2. 🆕 改善されたパフォーマンス最適化パターン
```typescript
// テンプレート内でのログ制限（実装済みパターン）
animateContainer(container, text, params, nowMs, startMs, endMs, hierarchyType, phase) {
  // 🆕 1秒に1回のログ制限（実装済み）
  if (params.debugMode && nowMs % 1000 < 16) {
    console.log(`[${hierarchyType}] ${phase} - Time: ${nowMs}ms`);
  }
  
  // 🆕 表示範囲外の早期リターン（実装済み）
  const headTime = params.headTime || 500;
  const tailTime = params.tailTime || 500;
  const phraseStartMs = params.phraseStartMs || startMs;
  const phraseEndMs = params.phraseEndMs || endMs;
  
  if (nowMs < phraseStartMs - headTime || nowMs > phraseEndMs + tailTime) {
    container.visible = false;
    return true;  // 早期リターンでパフォーマンス向上
  }
  
  // 🆕 必要な場合のみ座標変換を更新（実装済み）
  const targetX = this.calculatePositionX(nowMs, startMs, endMs, params);
  if (Math.abs(container.position.x - targetX) > 0.1) {  // 誤差を考慮
    container.position.x = targetX;
    container.updateTransform();
  }
}
```

#### 3. 🆕 メモリ効率の向上（推奨パターン）
```typescript
// 🆕 オブジェクトプールパターン（推奨実装）
private graphicsPool: PIXI.Graphics[] = [];

getPooledGraphics(): PIXI.Graphics {
  let graphics = this.graphicsPool.pop();
  if (!graphics) {
    graphics = new PIXI.Graphics();
  }
  graphics.clear();  // リセット
  return graphics;
}

returnToPool(graphics: PIXI.Graphics): void {
  if (this.graphicsPool.length < 10) {  // プールサイズ制限
    this.graphicsPool.push(graphics);
  } else {
    graphics.destroy();  // 過剰な場合は破棄
  }
}
```

---

## テンプレートレジストリへの登録

### 新テンプレートの登録手順（実装済みシステム）

#### 1. templates/index.ts への追加
```typescript
// templates/index.ts（実装済み）
export { FadeSlideText } from './FadeSlideText';
export { MultiLineText } from './MultiLineText';
export { GlitchText } from './GlitchText';
export { YourTemplate } from './YourTemplate';  // ✨ 新テンプレート追加
```

#### 2. templateRegistry.ts への登録（実装済みシステム）
```typescript
// templates/registry/templateRegistry.ts（実装済み）
import * as templates from '../index';

export const templateRegistry: TemplateRegistryEntry[] = [
  {
    id: 'fadeslidetext',
    name: 'フェードスライドテキスト',
    template: templates.FadeSlideText
  },
  {
    id: 'multilinetext',
    name: '多段歌詞テキスト',
    template: templates.MultiLineText
  },
  {
    id: 'glitchtext',
    name: 'グリッチテキスト',
    template: templates.GlitchText
  },
  {
    id: 'yourtemplate',      // ✨ 新テンプレート
    name: 'あなたのテンプレート',
    template: templates.YourTemplate
  }
];
```

#### 3. 🆕 テンプレートの動的読み込み（実装済み）
```typescript
// Engine での自動読み込み（実装済み）
import { templateRegistry } from '../templates/registry/templateRegistry';

// テンプレートの自動登録
templateRegistry.forEach(({ id, name, template }) => {
  const defaultParams = {};
  if (template.metadata && template.metadata.params) {
    template.metadata.params.forEach((param) => {
      defaultParams[param.name] = param.default;
    });
  }
  
  engine.addTemplate(id, template, { name }, defaultParams);
});
```

---

## UI統合とベストプラクティス

### 🆕 実装済みUI機能の活用

#### 1. 複数選択対応（実装済み）
```typescript
// TemplateSelector.tsx での使用（実装済み）
interface TemplateSelectorProps {
  templates: Array<{id: string, name: string, description?: string}>;
  selectedTemplateId: string;
  selectedPhraseIds?: string[];  // ✨ 複数選択対応（実装済み）
  onSelect: (templateId: string) => void;
}

// 🆕 一括適用の実装（実装済み）
const handleBatchApply = (templateId: string) => {
  if (selectedPhraseIds && selectedPhraseIds.length > 1) {
    // Engine の一括適用メソッドを使用（実装済み）
    const success = engine.batchAssignTemplate(selectedPhraseIds, templateId, true);
    
    if (success) {
      // 🆕 成功通知の発火（実装済み）
      const event = new CustomEvent('template-batch-applied', {
        detail: {
          templateName: templateName,
          objectIds: selectedPhraseIds,
          objectType: 'フレーズ'
        }
      });
      window.dispatchEvent(event);
    }
  }
};
```

#### 2. 🆕 テンプレート変更時のUX改善（実装済み）
```typescript
// 🆕 パラメータ保持オプションの提供（実装済み）
const handleTemplateChange = (templateId: string, preserveParams: boolean = true) => {
  // ユーザー選択に基づくパラメータ保持（実装済み）
  const success = engine.assignTemplate(objectId, templateId, preserveParams);
  
  if (success) {
    // 🆕 変更結果の通知（実装済み）
    showNotification(`テンプレートを${preserveParams ? 'パラメータ保持で' : ''}変更しました`);
  }
};
```

#### 3. 🆕 Undo/Redo統合（実装済み）
```typescript
// 🆕 Undo/Redo機能のUI統合（実装済み）
const UndoRedoPanel: React.FC = () => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  
  const handleUndo = () => {
    const success = engine.undo();
    if (success) {
      updateUndoRedoState();
      showNotification('操作を元に戻しました');
    }
  };
  
  const handleRedo = () => {
    const success = engine.redo();
    if (success) {
      updateUndoRedoState();
      showNotification('操作をやり直しました');
    }
  };
  
  const updateUndoRedoState = () => {
    setCanUndo(engine.canUndo());
    setCanRedo(engine.canRedo());
  };
  
  // 🆕 履歴情報の取得（実装済み）
  const historyInfo = engine.getUndoRedoHistory();
  
  return (
    <div className="undo-redo-panel">
      <button onClick={handleUndo} disabled={!canUndo}>
        Undo ({historyInfo.currentIndex}/{historyInfo.history.length})
      </button>
      <button onClick={handleRedo} disabled={!canRedo}>
        Redo
      </button>
    </div>
  );
};
```

#### 4. 🆕 パフォーマンス考慮のUI実装（実装済み）
```typescript
// 🆕 リアルタイムプレビューの実装（実装済み）
const handleParameterChange = debounce((params: Record<string, any>) => {
  // デバウンス処理でパフォーマンス向上
  engine.updateGlobalParams(params, false);  // saveState: false for real-time
}, 100);  // 100ms のデバウンス

// パラメータ変更完了時の状態保存
const handleParameterChangeComplete = (params: Record<string, any>) => {
  engine.updateGlobalParams(params, true);  // saveState: true for history
};
```

---

## 実装パターンまとめ

### 1. 🆕 階層継承対応テンプレートの完全パターン（実装済みベース）

```typescript
export const YourTemplate: IAnimationTemplate = {
  metadata: {
    params: [
      // 🆕 階層共通パラメータ（実装済みパターン）
      { name: "fontSize", type: "number", default: 32, min: 12, max: 128, step: 1 },
      { name: "fontFamily", type: "string", default: "Arial" },
      
      // 🆕 状態別色設定（FadeSlideTextパターン）
      { name: "defaultTextColor", type: "color", default: "#808080" },
      { name: "activeTextColor", type: "color", default: "#FF0000" },
      { name: "completedTextColor", type: "color", default: "#800000" },
      
      // 🆕 アニメーション制御（実装済み）
      { name: "headTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "tailTime", type: "number", default: 500, min: 0, max: 2000, step: 50 },
      { name: "initialSpeed", type: "number", default: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: "activeSpeed", type: "number", default: 0.01, min: 0.001, max: 0.1, step: 0.001 },
      
      // 🆕 階層別オフセット（実装済み）
      { name: "phraseOffsetX", type: "number", default: 0, min: -200, max: 200, step: 1 },
      { name: "wordOffsetX", type: "number", default: 0, min: -100, max: 100, step: 1 },
      { name: "charOffsetX", type: "number", default: 0, min: -50, max: 50, step: 1 },
      
      // 🆕 視覚効果制御（実装済み）
      { name: "circleSize", type: "number", default: 40, min: 10, max: 200, step: 1 },
      { name: "circleLineWidth", type: "number", default: 8, min: 1, max: 20, step: 1 },
      { name: "circleOpacity", type: "number", default: 1.0, min: 0.0, max: 1.0, step: 0.01 },
      
      // デバッグ・パフォーマンス
      { name: "debugMode", type: "boolean", default: false }
    ]
  },
  
  // 🆕 階層構造保持のための要素削除（必須実装）
  removeVisualElements(container: PIXI.Container): void {
    const childrenToKeep: PIXI.DisplayObject[] = [];
    const childrenToRemove: PIXI.DisplayObject[] = [];
    
    container.children.forEach(child => {
      if (child instanceof PIXI.Container && 
          (child as any).name && 
          ((child as any).name.includes('_container_'))) {
        childrenToKeep.push(child);
      } else {
        childrenToRemove.push(child);
      }
    });
    
    childrenToRemove.forEach(child => {
      container.removeChild(child);
      child.destroy();
    });
  },
  
  // 🆕 メインの階層対応実装（必須実装）
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
    
    // 共通初期化
    const textContent = Array.isArray(text) ? text.join('') : text;
    container.visible = true;
    this.removeVisualElements!(container);
    
    // 階層別処理
    switch (hierarchyType) {
      case 'phrase':
        return this.renderPhraseContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
      case 'word':
        return this.renderWordContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
      case 'char':  
        return this.renderCharContainer!(container, textContent, params, nowMs, startMs, endMs, phase, hierarchyType);
      default:
        return false;
    }
  },
  
  // 🆕 フレーズレベル実装（実装済みパターンベース）
  renderPhraseContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType): boolean {
    // フレーズ全体制御の実装
    // - 全体移動アニメーション
    // - フェードイン/アウト
    // - 子要素への影響
    // (FadeSlideTextのパターンを参考に実装)
    return true;
  },
  
  // 🆕 単語レベル実装（実装済みパターンベース）
  renderWordContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType): boolean {
    // 単語単位制御の実装
    // - 文字数に応じた視覚要素
    // - 単語レベルのアニメーション
    // - フレーズ状態の継承
    // (FadeSlideTextのパターンを参考に実装)
    return true;
  },
  
  // 🆕 文字レベル実装（実装済みパターンベース）
  renderCharContainer(container, text, params, nowMs, startMs, endMs, phase, hierarchyType): boolean {
    // 文字個別制御の実装
    // - 文字の状態に応じた表示
    // - 色・サイズ変更
    // - 位置調整
    // (FadeSlideTextのパターンを参考に実装)
    return true;
  },
  
  // 🆕 イージング関数（実装済みパターン）
  easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  },
  
  easeInCubic(t: number): number {
    return t * t * t;
  },
  
  // 🆕 速度ベースの距離計算（MultiLineTextパターン）
  calculateDistanceFromSpeed(
    elapsedTime: number,
    duration: number,
    initialSpeed: number,
    finalSpeed: number,
    easingFn: (t: number) => number = this.easeOutCubic
  ): number {
    if (elapsedTime <= 0) return 0;
    if (elapsedTime >= duration) {
      const integralValue = easingFn === this.easeOutCubic ? 0.75 : 0.25;
      return duration * (initialSpeed + (finalSpeed - initialSpeed) * integralValue);
    }
    
    const steps = Math.min(100, Math.ceil(elapsedTime));
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
      distance += (v1 + v2) * dt / 2;
    }
    
    return distance;
  }
};
```

### 2. 🆕 パフォーマンス最適化パターン（実装済み）

```typescript
// 🆕 ログ制限パターン（実装済み）
if (params.debugMode && nowMs % 1000 < 16) {
  console.log(`デバッグ情報: ${hierarchyType}`);
}

// 🆕 早期リターンパターン（実装済み）
const headTime = params.headTime || 500;
const tailTime = params.tailTime || 500;
const phraseStartMs = params.phraseStartMs || startMs;
const phraseEndMs = params.phraseEndMs || endMs;

if (nowMs < phraseStartMs - headTime || nowMs > phraseEndMs + tailTime) {
  container.visible = false;
  return true;
}

// 🆕 変更時のみ更新パターン（実装済み）
const targetX = this.calculatePosition(nowMs, startMs, endMs, params);
if (Math.abs(container.position.x - targetX) > 0.1) {
  container.position.x = targetX;
  container.updateTransform();
}
```

### 3. 🆕 UI統合パターン（実装済み）

```typescript
// 🆕 複数選択対応のイベント処理（実装済み）
const handleBatchApply = (templateId: string) => {
  if (selectedPhraseIds?.length > 1) {
    // 一括適用（実装済み）
    const success = engine.batchAssignTemplate(selectedPhraseIds, templateId, preserveParams);
    
    if (success) {
      // 結果通知（実装済み）
      showNotification(`${selectedPhraseIds.length}個のフレーズに適用しました`);
    }
  } else {
    // 単一適用
    engine.assignTemplate(objectId, templateId, preserveParams);
  }
};

// 🆕 パラメータ変更のデバウンス処理（実装済み）
const handleParameterChange = debounce((params) => {
  engine.updateGlobalParams(params, false);  // リアルタイム更新
}, 100);

// 🆕 Undo/Redo統合（実装済み）
const handleUndoableAction = (action: () => void) => {
  action();  // saveState: true で状態保存される
  updateUndoRedoUI();
};
```

---

## まとめ

### 🆕 実装完了システムでの開発指針（2025年5月版）

1. **階層継承を意識した設計**: フレーズ→単語→文字の継承関係を考慮
2. **実装済みパターンの活用**: FadeSlideText、MultiLineTextの実装パターンを参考
3. **パフォーマンス最適化**: ログ制限、早期リターン、選択的更新
4. **UI統合**: 複数選択、一括操作、Undo/Redo、通知システムの活用
5. **デバッグ機能**: DebugManager、GridOverlay の積極的活用
6. **テンプレートレジストリ**: 中央管理システムでの統一的登録

### 🆕 重要な実装ポイント（実装完了版）

#### 1. 階層継承システムの理解
- **自動継承**: 親で設定したテンプレートが子に自動適用
- **オーバーライド**: 子レベルでの個別テンプレート設定
- **パラメータ継承**: 階層的なパラメータオーバーライド

#### 2. パフォーマンス考慮
- **表示範囲判定**: 必要時のみ更新処理を実行
- **ログ制限**: デバッグ情報の適切な制限（1秒に1回程度）
- **メモリ効率**: オブジェクトプールの活用

#### 3. 保守性の確保
- **統一されたパターン**: removeVisualElements、animateContainer の標準実装
- **階層別処理**: 明確な役割分担（renderPhraseContainer、renderWordContainer、renderCharContainer）
- **デバッグ対応**: トラブルシューティングの容易さ

#### 4. 🆕 改善された機能の活用
- **パラメータ保持システム**: テンプレート変更時の共通パラメータ自動保持
- **Undo/Redo機能**: 全操作の履歴管理（20ステップ）
- **一括操作**: 複数フレーズへの同時テンプレート適用
- **デバッグ統合**: GridOverlay、DebugManager の活用

### 🆕 次世代機能への準備

実装完了システムは以下の拡張に対応可能：

1. **テンプレート合成**: 複数テンプレートの効果重ね合わせ
2. **リアルタイムプレビュー**: 適用前の効果確認
3. **アニメーション曲線編集**: カスタムイージング関数
4. **プリセット管理**: 設定の保存・読み込み
5. **AI支援機能**: 自動テンプレート推奨

この手順書に従って新しいテンプレートを実装することで、**Lyralive v0.6.0**の高度な機能（階層アニメーション、PixiJSフィルタ、テクスチャ操作、文字カウント管理等）を活用した高品質なアニメーションテンプレートを確実に作成できます。実装済みテンプレートの実際のパターンを基にした実践的なガイドとして、安定した開発を支援します。

---

**最終更新**: 2025年6月 - Electronベース現行システム対応版  
**対応システム**: 階層アニメーション、PixiJSフィルタ、RenderTexture、FontService、パフォーマンス最適化完全統合対応  
**実装参考**: FadeSlideText, MultiLineText, GlitchText, WordSlideText の実際の実装パターンベース  
**高度機能**: テクスチャ操作、文字カウント管理、エラーハンドリング、デバッグシステム完全網羅