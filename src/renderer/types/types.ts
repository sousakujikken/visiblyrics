import * as PIXI from 'pixi.js';

// アニメーション定義の型を追加
export interface AnimationDefinition {
  type: string;                  // アニメーションタイプ (fade, move, scale, etc.)
  duration: number;              // 持続時間 (ms)
  easing?: string;               // イージング関数
  params?: Record<string, any>;  // アニメーション固有パラメータ
}

// 階層的アニメーションパラメータを追加
export interface HierarchicalAnimationParams extends Record<string, any> {
  // 階層ごとのアニメーション定義
  phraseInAnimation?: AnimationDefinition | null;
  phraseOutAnimation?: AnimationDefinition | null;
  wordInAnimation?: AnimationDefinition | null;
  wordOutAnimation?: AnimationDefinition | null;
  charInAnimation?: AnimationDefinition | null;
  charOutAnimation?: AnimationDefinition | null;
  
  // タイミングパラメータ
  headTime?: number;
  tailTime?: number;
  inDuration?: number;
  outDuration?: number;
  
  // 基本パラメータ
  fontSize?: number;
  fontFamily?: string;
  fill?: string | string[];
  fillActive?: string | string[];
}

export interface CharUnit {
  id: string;           // 例: phrase_0_word_2_char_0
  char: string;
  start: number;
  end: number;
  pixiObj?: PIXI.Text;
  params?: Record<string, any>; // テンプレートパラメータ
  // 文字カウント情報
  charIndex?: number;    // フレーズ内での文字位置（0から開始）
  totalChars?: number;   // フレーズ内の総文字数
  totalWords?: number;   // フレーズ内の総単語数
}

export interface WordUnit {
  id: string;
  word: string;          // 単語のテキスト（textから変更）
  start: number;
  end: number;
  chars: CharUnit[];
  params?: Record<string, any>; // テンプレートパラメータ
}

export interface PhraseUnit {
  id: string;           // 例: phrase_0
  phrase: string;       // フレーズのテキスト（textから変更）
  start: number;
  end: number;
  words: WordUnit[];
  params?: Record<string, any>; // テンプレートパラメータ
}

// テンプレート著作者情報インターフェース
export interface TemplateAuthor {
  name: string;                  // 著作者名
  email?: string;                // 連絡先メールアドレス（任意）
  url?: string;                  // ウェブサイトやプロフィールURL（任意）
  contribution: string;          // 貢献内容の説明
  date: string;                  // 貢献日（YYYY-MM-DD形式）
}

// テンプレートメタデータインターフェース
export interface TemplateMetadata {
  name: string;                  // テンプレート名
  version: string;               // バージョン番号（例: "1.0.0"）
  description: string;           // テンプレートの説明
  license: string;               // ライセンス（例: "CC-BY-4.0"）
  originalAuthor: TemplateAuthor; // 原著作者
  contributors?: TemplateAuthor[]; // 貢献者リスト（改変者など）
  licenseUrl?: string;           // ライセンスの詳細URL
  sourceUrl?: string;            // ソースコードURL（GitHubなど）
}

export interface IAnimationTemplate {
  // テンプレートメタデータ
  metadata?: TemplateMetadata;
  
  // パラメータ設定を取得するメソッド
  getParameterConfig?(): Array<{
    name: string;
    type: 'number' | 'string' | 'color' | 'select' | 'boolean';
    default: any;
    min?: number;
    max?: number;
    step?: number;
    options?: string[] | (() => string[]);
  }>;
  
  // MultiLineText/GlitchText用のヘルパーメソッド
  getOrCalculateLineNumber?(
    phraseId: string,
    params: Record<string, any>,
    startMs: number,
    endMs: number,
    totalLines: number,
    resetInterval: number,
    manualLineNumber: number
  ): number;
  
  getDefaultCharSpacing?(text: string): number;
  
  renderNormalText?(
    container: PIXI.Container,
    text: string,
    fontSize: number,
    fontFamily: string,
    isActive: boolean,
    isCompleted: boolean,
    params: Record<string, any>
  ): void;
  
  renderGlitchText?(
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
  ): void;
  
  calculateDynamicGlitchAmount?(
    nowMs: number,
    baseBlockCount: number,
    threshold: number,
    waveSpeed: number,
    randomness: number,
    params: Record<string, any>
  ): { shouldGlitch: boolean, blockCount: number };
  
  applyGlitchEffect?(
    sprite: PIXI.Sprite,
    originalX: number,
    originalY: number,
    blockWidth: number,
    blockHeight: number,
    intensity: number,
    colorShift: boolean,
    random: () => number,
    params: Record<string, any>
  ): void;
  
  hashString?(str: string): number;
  
  createSeededRandom?(seed: number): () => number;
  // time-based animation
  animate?(
    container: PIXI.Container,
    text: string | string[],
    x: number,
    y: number,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number
  ): boolean;

  // 階層対応のアニメーションメソッド
  animateContainer?(
    container: PIXI.Container,
    text: string | string[],
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: 'phrase' | 'word' | 'char',
    phase: 'in' | 'active' | 'out'
  ): boolean;

  // 互換用の progress-based
  apply?(
    container: PIXI.Container,
    text: string | string[],
    x: number,
    y: number,
    params: Record<string, any>,
    progress: number
  ): boolean;

  // 表示要素管理メソッド
  removeVisualElements?(
    container: PIXI.Container
  ): void;

  // 階層ごとのレンダリングメソッド
  renderPhraseContainer?(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    hierarchyType: HierarchyType
  ): boolean;

  renderWordContainer?(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    hierarchyType: HierarchyType
  ): boolean;

  renderCharContainer?(
    container: PIXI.Container,
    text: string,
    params: Record<string, any>,
    nowMs: number,
    startMs: number,
    endMs: number,
    phase: AnimationPhase,
    hierarchyType: HierarchyType
  ): boolean;
}

export interface AnimationInstanceProps {
  id: string;
  template: IAnimationTemplate;
  text: string;
  x: number;
  y: number;
  params: Record<string, any>;
  startMs: number;
  endMs: number;
}

export interface LyricsData {
  text: string;
  start: number;
  end: number;
  chars: {
    char: string;
    start: number;
    end: number;
  }[];
}

// 階層タイプを表すタイプエイリアス
export type HierarchyType = 'phrase' | 'word' | 'char';

// アニメーションフェーズを表すタイプエイリアス
export type AnimationPhase = 'in' | 'active' | 'out';

// アスペクト比関連の型定義
export type AspectRatio = '16:9' | '4:3' | '1:1';
export type Orientation = 'landscape' | 'portrait';

export interface StageConfig {
  aspectRatio: AspectRatio;
  orientation: Orientation;
  baseWidth: number;  // 基準幅（例: 1920）
  baseHeight: number; // 基準高さ（例: 1080）
}

export interface PreviewAreaConfig {
  containerSize: number; // 固定値: 800
  stageConfig: StageConfig;
}

// ステージの実際のサイズ
export interface StageSize {
  width: number;
  height: number;
  scale: number; // コンテナにフィットさせるためのスケール
}

// 背景関連の型定義
export type BackgroundType = 'color' | 'image' | 'video';
export type BackgroundFitMode = 'cover' | 'contain' | 'stretch';

export interface BackgroundConfig {
  type: BackgroundType;
  backgroundColor?: string;
  imageUrl?: string;
  videoUrl?: string;
  fitMode?: BackgroundFitMode;
  opacity?: number;
}

// 動画出力関連の型定義
export type VideoQuality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CUSTOM';

export interface CustomResolution {
  width: number;
  height: number;
}

export interface VideoExportResolutionOptions {
  aspectRatio: AspectRatio;
  orientation: Orientation;
  quality: VideoQuality;
  customResolution?: CustomResolution;
}
