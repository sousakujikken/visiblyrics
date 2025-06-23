import * as PIXI from 'pixi.js';
import { InstanceManager } from './InstanceManager';
import { PhraseUnit, CharUnit, WordUnit, LyricsData, AspectRatio, Orientation, StageConfig, BackgroundConfig, BackgroundFitMode } from '../types/types';
import { IAnimationTemplate } from '../types/types';
import { VideoExporter } from '../export/video/VideoExporter';
import { Howl } from 'howler';
import { ParamService } from '../services/ParamService';
import { GridOverlay } from '../utils/GridOverlay';
import { DebugManager } from '../utils/debug';
import { TemplateManager } from './TemplateManager';
import { ParameterManager } from './ParameterManager';
import { ProjectStateManager } from './ProjectStateManager';
import { calculateStageSize, getDefaultStageConfig } from '../utils/stageCalculator';
import { persistenceService } from '../services/PersistenceService';
import { calculateCharacterIndices } from '../utils/characterIndexCalculator';

export class Engine {
  // パラメータカテゴリ分類
  private static readonly LAYOUT_AFFECTING_PARAMS = new Set([
    'fontSize', 'letterSpacing', 'lineHeight',
    'phraseOffsetX', 'phraseOffsetY', 'wordOffsetX', 'wordOffsetY', 
    'charOffsetX', 'charOffsetY', 'offsetX', 'offsetY',
    'textAlign', 'verticalAlign', 'maxLines', 'lineCount'
  ]);

  app: PIXI.Application;
  instanceManager: InstanceManager;
  canvasContainer: HTMLElement;
  phrases: PhraseUnit[] = [];
  isRunning: boolean = false;
  currentTime: number = 0;
  charPositions: Map<string, {x: number, y: number}> = new Map();
  lastUpdateTime: number = 0;
  private updateFn: (delta: number) => void;
  
  // パラメータ管理サービス（後方互換性のため残す）
  private paramService: ParamService;
  
  // 複数テンプレート対応のためのマネージャークラス
  templateManager: TemplateManager;
  parameterManager: ParameterManager;
  projectStateManager: ProjectStateManager;
  
  // テンプレート
  template: IAnimationTemplate;
  
  // 音声関連のプロパティ
  audioPlayer?: Howl;
  audioDuration: number = 10000; // デフォルト10秒
  audioURL?: string;
  audioFileName?: string; // 音楽ファイル名

  // 方眼目盛りと座標表示用のオーバーレイ
  private gridOverlay?: GridOverlay;
  
  // デバッグマネージャー
  private debugManager: DebugManager;
  
  // 動画エクスポーター
  videoExporter: VideoExporter;
  
  // ステージ設定
  private stageConfig: StageConfig;
  
  // 背景レイヤー関連
  private backgroundLayer: PIXI.Container;
  private backgroundSprite?: PIXI.Sprite;
  private backgroundVideo?: HTMLVideoElement;
  private backgroundVideoSprite?: PIXI.Sprite;
  private backgroundConfig: BackgroundConfig = {
    type: 'color',
    backgroundColor: '#000000'
  };
  
  // 背景動画ファイル名を保存（復元用）
  private backgroundVideoFileName: string | null = null;
  
  // 自動保存関連
  private autoSaveTimer?: number;
  private lastAutoSaveTime: number = 0;
  private autoSaveEnabled: boolean = true;
  private static readonly AUTO_SAVE_INTERVAL = 30000; // 30秒
  private static readonly AUTO_SAVE_EXPIRY = 24 * 60 * 60 * 1000; // 24時間

  constructor(
    containerId: string, 
    template: IAnimationTemplate,
    defaultParams: Record<string, any> = {},
    templateId: string = 'fadeslidetext'
  ) {
    // テンプレートの保存
    this.template = template;
    
    // 各マネージャーの初期化
    this.templateManager = new TemplateManager();
    this.templateManager.registerTemplate(templateId, template, {name: templateId}, true);
    
    this.parameterManager = new ParameterManager();
    this.parameterManager.setTemplateDefaultParams(templateId, defaultParams);
    this.parameterManager.updateGlobalParams(defaultParams);
    
    // プロジェクト状態マネージャーの初期化
    this.projectStateManager = new ProjectStateManager({
      id: `state_${Date.now()}`,
      timestamp: Date.now(),
      label: '初期状態',
      templateAssignments: {},
      globalParams: { ...defaultParams },
      objectParams: {},
      defaultTemplateId: templateId
    });
    
    // パラメータサービスの初期化（後方互換性のため）
    this.paramService = new ParamService(defaultParams);
    
    // ステージ設定の初期化（まずはデフォルト値で開始）
    this.stageConfig = getDefaultStageConfig();
    console.log('Engine: デフォルトステージ設定で初期化:', this.stageConfig);
    
    // コンテナの取得
    this.canvasContainer = document.getElementById(containerId) as HTMLElement;
    if (!this.canvasContainer) {
      throw new Error(`Container element with ID "${containerId}" not found`);
    }

    // デフォルトのステージサイズを計算
    const { width, height } = calculateStageSize(this.stageConfig.aspectRatio, this.stageConfig.orientation);

    // PIXIアプリケーションの初期化
    this.app = new PIXI.Application({
      width: width,
      height: height,
      backgroundColor: 0x000000,
      resolution: 1, // 常に1で固定（スケーリングはCSSで行う）
      antialias: true,
    });

    // グローバル参照として保存（テンプレートからアクセスできるように）
    (window as any).__PIXI_APP__ = this.app;
    console.log('PIXIアプリケーションをグローバルにセットしました');

    // PIXIキャンバスをDOMに追加
    this.canvasContainer.innerHTML = ''; // 既存の内容をクリア
    this.canvasContainer.appendChild(this.app.view as HTMLCanvasElement);
    
    // CSSスケーリングを適用
    this.applyCSSScaling();

    // 背景レイヤーを初期化（mainContainerより先に追加）
    this.backgroundLayer = new PIXI.Container();
    this.backgroundLayer.name = 'backgroundLayer';
    this.app.stage.addChild(this.backgroundLayer);

    // インスタンスマネージャーの初期化
    this.instanceManager = new InstanceManager(this.app, template, defaultParams);
    
    // インスタンスマネージャーにテンプレートマネージャーとパラメータマネージャーを設定
    this.instanceManager.updateTemplateAssignments(this.templateManager, this.parameterManager);

    // ステージの原点を明示的に設定 (左上を(0, 0)にする)
    this.app.stage.position.set(0, 0);
    console.log(`ステージ位置を設定: (${this.app.stage.position.x}, ${this.app.stage.position.y})`);

    // 方眼目盛りオーバーレイを初期化
    this.gridOverlay = new GridOverlay(this.app);
    this.gridOverlay.setVisible(false); // デフォルトは非表示
    
    // デバッグマネージャーを初期化
    this.debugManager = new DebugManager(this.app, {
      enabled: false, // デフォルトで無効
      showGrid: false, // 方眼目盛りも無効
      logToConsole: true // コンソールログは有効
    });
    
    // 動画エクスポーターを初期化
    this.videoExporter = new VideoExporter(this);

    // ウィンドウリサイズイベントの処理
    window.addEventListener('resize', this.handleResize.bind(this));
    
    // updateFn をプロパティに保存して、ticker.remove 時に参照できるようにする
    this.updateFn = this.update.bind(this);
    
    // アニメーションフレームハンドラの設定
    this.app.ticker.add(this.updateFn);
    this.app.ticker.start();

    // デバッグ出力
    console.log(`Canvas size: ${this.app.renderer.width}x${this.app.renderer.height}`);
    
    // 自動保存機能を初期化
    this.setupAutoSave();
    
    // 起動時に自動保存データの復元を試みる（少し遅延させて確実にIPCが準備されるようにする）
    setTimeout(async () => {
      try {
        console.log('Engine: ===== 自動保存データ確認開始 =====');
        
        // まずステージ設定だけを先に適用
        await this.initializeStageConfigFromAutoSave();
        
        // 自動復元を実行（ダイアログなし）
        await this.silentAutoRestore();
        
        console.log('Engine: ===== 自動保存データ確認完了 =====');
      } catch (error) {
        console.error('Engine: 自動保存データの確認でエラーが発生しました:', error);
      }
    }, 100);
  }

  // 歌詞データをロード (PhraseUnit[] を受け入れる)
  loadLyrics(data: PhraseUnit[]) {
    console.log('Engine: 歌詞データのロード開始', data);
    
    // まず各オブジェクトに固有のIDが付与されているか確認し、なければ設定する
    const dataWithIds = this.ensureUniqueIds(data);
    
    // 文字インデックスを計算
    this.phrases = calculateCharacterIndices(dataWithIds);
    
    // 歌詞データから最大時間を計算してaudioDurationを更新
    this.calculateAndSetAudioDuration();
    
    this.charPositions.clear();

    // パラメータサービスにフレーズデータをセット
    this.paramService.setPhrases(this.phrases);
    
    // 既存の文字タイミングを保持するため、再計算は行わない

    // ステージ上に歌詞配置を初期化
    this.arrangeCharsOnStage();
    
    // インスタンスマネージャーにロード
    this.instanceManager.loadPhrases(this.phrases, this.charPositions);
    
    // 初期表示（0ms時点）を設定
    this.instanceManager.update(0);
    
    // タイムライン更新イベントを発火してUIコンポーネントに通知
    this.dispatchTimelineUpdatedEvent();
    
    // フレーズコンテナの位置設定はテンプレート側に任せる
    // 強制位置設定のコードを削除
    console.log(`Engine: 歌詞データのロード完了 - ${this.phrases.length}個のフレーズを処理`);
    
    // 歌詞データロード後に自動保存
    if (this.autoSaveEnabled) {
      this.autoSaveToLocalStorage();
    }
  }

  // 全てのフレーズ、単語、文字にユニークIDが設定されていることを確認する
  private ensureUniqueIds(data: PhraseUnit[]): PhraseUnit[] {
    return data.map((phrase, pi) => {
      // フレーズにIDがない場合は設定
      if (!phrase.id) {
        phrase.id = `phrase_${pi}`;
      }
      
      // 全ての単語を処理
      const words = phrase.words.map((word, wi) => {
        // 単語にIDがない場合は設定
        if (!word.id) {
          word.id = `${phrase.id}_word_${wi}`;
        }
        
        // 全ての文字を処理
        const chars = word.chars.map((char, ci) => {
          // 文字にIDがない場合は設定
          if (!char.id) {
            char.id = `${word.id}_char_${ci}`;
          }
          return char;
        });
        
        return { ...word, chars };
      });
      
      return { ...phrase, words };
    });
  }
  
  // 歌詞データと音楽データから最大時間を計算してaudioDurationを設定する
  private calculateAndSetAudioDuration(): void {
    let lyricsMaxTime = 0;
    
    // 歌詞データから最大時間を計算
    if (this.phrases.length > 0) {
      lyricsMaxTime = Math.max(...this.phrases.map(phrase => phrase.end));
    }
    
    // 音楽データの長さを取得
    let musicMaxTime = 0;
    if (this.audioPlayer) {
      const state = this.audioPlayer.state();
      const duration = this.audioPlayer.duration ? this.audioPlayer.duration() : 0;
      console.log(`Engine: 音楽データ状態確認 - state: ${state}, duration: ${duration}秒, audioPlayer存在: ${!!this.audioPlayer}`);
      
      if (this.audioPlayer.duration && duration > 0) {
        musicMaxTime = duration * 1000; // ミリ秒に変換
      }
    } else {
      console.log('Engine: audioPlayerが存在しません');
    }
    
    // 歌詞データと音楽データの長い方を選択
    const maxTime = Math.max(lyricsMaxTime, musicMaxTime);
    
    // 最大時間にバッファ（0.2秒）を追加して設定
    // ただし、最小でも10秒は確保する
    this.audioDuration = Math.max(maxTime + 200, 10000);
    
    console.log(`Engine: タイムライン長さ計算完了: ${this.audioDuration}ms (歌詞: ${lyricsMaxTime}ms, 音楽: ${musicMaxTime}ms)`);
  }
  
  // 文字カウント情報を追加する
  // 旧メソッドは削除（calculateCharacterIndicesを使用するため）
  // private addCharCountInfo(phrases: PhraseUnit[]): void { ... }
  
  // 全角判定ヘルパー関数 - 文字コードで判定
  private isFullWidthChar(char: string): boolean {
    // ASCII文字（半角）の範囲外か判定
    // 半角カタカナやロシア文字など一部例外があるが、英数字や一般的な半角記号はASCII範囲内
    const code = char.charCodeAt(0);
    if (code <= 0x7F) {  // ASCII範囲
      return false;
    }
    
    // 一般的な全角文字：日本語、中国語、韓国語、全角英数字など
    return true;
  }

  // 文字をステージ上に配置する
  /**
   * パラメータ変更が文字配置に影響するかを判定
   */
  private isLayoutAffectingChange(params: Record<string, any>): boolean {
    return Object.keys(params).some(key => Engine.LAYOUT_AFFECTING_PARAMS.has(key));
  }

  /**
   * 座標のみを再計算（文字カウント情報は保持）
   */
  private recalculateCharPositionsOnly() {
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;
    
    // charPositionsの座標のみクリア（Mapは既存のままで値のみ更新）
    this.phrases.forEach((phrase, phraseIndex) => {
      // フレーズのy座標を計算（垂直方向に配置）
      const phraseY = centerY - 50 + phraseIndex * 120; // フレーズ間の間隔を広げる
      
      // フレーズレベルのパラメータを取得
      const fontSize = phrase.params?.fontSize || this.instanceManager.getDefaultParams().fontSize || 42;
      const letterSpacing = phrase.params?.letterSpacing !== undefined ? 
                           phrase.params.letterSpacing : 
                           this.instanceManager.getDefaultParams().letterSpacing !== undefined ? 
                           this.instanceManager.getDefaultParams().letterSpacing : 1;
      
      // フレーズ全体の幅を計算
      let totalPhraseWidth = 0;
      
      // 各単語の幅を計算して配列に格納
      const wordWidths: number[] = [];
      phrase.words.forEach(word => {
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                 word.params.letterSpacing : letterSpacing;
        
        // 各文字の幅と間隔を計算
        let wordWidth = 0;
        word.chars.forEach((char, i) => {
          const charFontSize = char.params?.fontSize || wordFontSize;
          wordWidth += charFontSize * this.getCharWidthRatio(char.char);
          // 文字間にスペースを追加（最後の文字を除く）
          if (i < word.chars.length - 1) {
            wordWidth += wordLetterSpacing;
          }
        });
        
        wordWidths.push(wordWidth);
        totalPhraseWidth += wordWidth;
      });
      
      // 単語間のスペースを追加
      if (phrase.words.length > 1) {
        totalPhraseWidth += (phrase.words.length - 1) * letterSpacing * 3; // 単語間は文字間の3倍空ける
      }
      
      // フレーズ全体を中央揃えするための開始X座標
      let currentX = centerX - totalPhraseWidth / 2;
      
      // 各単語を配置
      phrase.words.forEach((word, wordIndex) => {
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                word.params.letterSpacing : letterSpacing;
        const wordOffsetX = word.params?.offsetX || 0;
        const wordOffsetY = word.params?.offsetY || 0;
        
        // 単語の開始X座標を記録
        const wordStartX = currentX;
        
        // 各文字を配置
        let charX = wordStartX;
        word.chars.forEach((char, charIndex) => {
          // 文字固有のパラメータを取得
          const charFontSize = char.params?.fontSize || wordFontSize;
          const charOffsetX = char.params?.offsetX || 0;
          const charOffsetY = char.params?.offsetY || 0;
          
          // 文字の幅を計算
          const charWidth = charFontSize * this.getCharWidthRatio(char.char);
          
          // 既存の文字IDの座標のみ更新
          this.charPositions.set(char.id, {
            x: charX + charWidth / 2 + wordOffsetX + charOffsetX,
            y: phraseY + wordOffsetY + charOffsetY
          });
          
          // 次の文字のために位置を更新
          charX += charWidth + wordLetterSpacing;
        });
        
        // 次の単語のために位置を更新
        currentX += wordWidths[wordIndex] + letterSpacing * 3; // 単語間のスペース
      });
    });
  }

  /**
   * 文字幅の比率を取得するヘルパーメソッド
   */
  private getCharWidthRatio(char: string): number {
    // 全角判定
    if (this.isFullWidthChar(char)) {
      return 1.0; // 全角文字はフォントサイズに対して同等幅
    }
    return 0.6; // 半角文字はフォントサイズの60%程度
  }

  arrangeCharsOnStage() {
    console.log('Engine: arrangeCharsOnStage開始', { 
      phrasesCount: this.phrases.length,
      screenSize: { width: this.app.screen.width, height: this.app.screen.height }
    });
    
    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;
    
    // フレーズごとに縦に配置
    this.phrases.forEach((phrase, phraseIndex) => {
      // フレーズIDがない場合は設定する
      if (!phrase.id) {
        phrase.id = `phrase_${phraseIndex}`;
        console.warn(`フレーズIDが未設定でした。生成します: ${phrase.id}`);
      }
      
      // フレーズのy座標を計算（垂直方向に配置）
      const phraseY = centerY - 50 + phraseIndex * 120; // フレーズ間の間隔を広げる
      
      // フレーズレベルのパラメータを取得
      const fontSize = phrase.params?.fontSize || this.instanceManager.getDefaultParams().fontSize || 42;
      const letterSpacing = phrase.params?.letterSpacing !== undefined ? 
                           phrase.params.letterSpacing : 
                           this.instanceManager.getDefaultParams().letterSpacing !== undefined ? 
                           this.instanceManager.getDefaultParams().letterSpacing : 1;
      
      // フレーズ全体の幅を計算
      let totalPhraseWidth = 0;
      
      // 各単語の幅を計算して配列に格納
      const wordWidths: number[] = [];
      phrase.words.forEach(word => {
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                 word.params.letterSpacing : letterSpacing;
        
        // 各文字の幅と間隔を計算
        let wordWidth = 0;
        word.chars.forEach((char, i) => {
          const charFontSize = char.params?.fontSize || wordFontSize;
          wordWidth += charFontSize * this.getCharWidthRatio(char.char);
          // 文字間にスペースを追加（最後の文字を除く）
          if (i < word.chars.length - 1) {
            wordWidth += wordLetterSpacing;
          }
        });
        
        wordWidths.push(wordWidth);
        totalPhraseWidth += wordWidth;
      });
      
      // 単語間のスペースを追加
      if (phrase.words.length > 1) {
        totalPhraseWidth += (phrase.words.length - 1) * letterSpacing * 3; // 単語間は文字間の3倍空ける
      }
      
      // フレーズ全体を中央揃えするための開始X座標
      let currentX = centerX - totalPhraseWidth / 2;
      
      // 各単語を配置
      phrase.words.forEach((word, wordIndex) => {
        // 単語IDがない場合は設定する
        if (!word.id) {
          word.id = `${phrase.id}_word_${wordIndex}`;
          console.warn(`単語IDが未設定でした。生成します: ${word.id}`);
        }
        
        // 単語のパラメータを取得
        const wordFontSize = word.params?.fontSize || fontSize;
        const wordLetterSpacing = word.params?.letterSpacing !== undefined ? 
                                word.params.letterSpacing : letterSpacing;
        const wordOffsetX = word.params?.offsetX || 0;
        const wordOffsetY = word.params?.offsetY || 0;
        
        // 単語の開始X座標を記録
        const wordStartX = currentX;
        
        // 各文字を配置
        let charX = wordStartX;
        word.chars.forEach((char, charIndex) => {
          // 文字IDがない場合は設定する
          if (!char.id) {
            char.id = `${word.id}_char_${charIndex}`;
            console.warn(`文字IDが未設定でした。生成します: ${char.id}`);
          }
          
          // 文字固有のパラメータを取得
          const charFontSize = char.params?.fontSize || wordFontSize;
          const charOffsetX = char.params?.offsetX || 0;
          const charOffsetY = char.params?.offsetY || 0;
          
          // 文字の幅を計算
          const charWidth = charFontSize * this.getCharWidthRatio(char.char);
          
          // 文字の座標を計算して設定（文字の中心が指定位置に来るようにする）
          this.charPositions.set(char.id, {
            x: charX + charWidth / 2 + wordOffsetX + charOffsetX,
            y: phraseY + wordOffsetY + charOffsetY
          });
          
          // console.log(`Char position [${char.id}]: ${charX + charWidth / 2}, ${phraseY}, "${char.char}", width: ${charWidth}`);
          
          // 次の文字のために位置を更新
          charX += charWidth + wordLetterSpacing;
        });
        
        // 次の単語のために位置を更新
        currentX += wordWidths[wordIndex] + letterSpacing * 3; // 単語間のスペース
      });
    });
    
    console.log('Engine: arrangeCharsOnStage完了', { 
      charPositionsSize: this.charPositions.size 
    });
  }

  // ウィンドウリサイズハンドラ
  private handleResize() {
    try {
      const width = this.canvasContainer.clientWidth || 800;
      const height = this.canvasContainer.clientHeight || 400;
      
  
      
      // キャンバスサイズの更新
      if (this.app && this.app.renderer) {
        this.app.renderer.resize(width, height);
        
        // 歌詞配置の再調整
        this.arrangeCharsOnStage();
        
        // インスタンス位置を更新
        if (this.instanceManager) {
          this.instanceManager.updatePositions(this.charPositions);
        
          // 現在の時間で更新
          this.instanceManager.update(this.currentTime);
        }
      }
    } catch (error) {
      console.error(`Resize error: ${error}`);
    }
  }

  // アニメーションフレーム更新
  private update(delta: number) {
    if (!this.isRunning) return;
    
    // 擬似的な時間進行（実際のアプリでは音楽と同期させる）
    const now = performance.now();
    const elapsed = now - this.lastUpdateTime;
    
    // 前回の更新から16ms以上経過している場合のみ更新（約60FPS）
    if (elapsed > 16 || this.lastUpdateTime === 0) {
      const newTime = this.currentTime + (elapsed || this.app.ticker.deltaMS);
      
      // 終了時刻チェック - タイムライン終端で自動停止
      if (newTime >= this.audioDuration) {
        this.currentTime = this.audioDuration;
        this.pause();
        console.log(`タイムライン終了 - 自動停止: ${this.audioDuration}ms`);
        this.dispatchCustomEvent('timeline-ended', { endTime: this.audioDuration });
        return;
      }
      
      this.currentTime = newTime;
      this.lastUpdateTime = now;
      
      // インスタンスマネージャーの更新
      this.instanceManager.update(this.currentTime);
      
      // デバッグ情報の更新（座標情報など）
      this.updateDebugInfo();
    }
  }

  // 再生制御メソッド
  play() {
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    console.log("再生開始: " + this.currentTime + "ms");
    
    // 音声がある場合は再生
    if (this.audioPlayer && this.audioPlayer.state() === 'loaded') {
      console.log(`Engine: 音楽再生開始 - ${this.audioFileName}, シーク位置: ${this.currentTime / 1000}秒`);
      this.audioPlayer.seek(this.currentTime / 1000); // 秒単位に変換
      this.audioPlayer.play();
    } else {
      const state = this.audioPlayer ? this.audioPlayer.state() : 'none';
      console.warn(`Engine: 音声ファイルが読み込まれていないため、アニメーションのみ再生します (audioPlayer: ${this.audioPlayer ? '存在' : 'null'}, state: ${state})`);
    }
    
    // 背景動画がある場合は再生
    if (this.backgroundVideo) {
      this.backgroundVideo.currentTime = this.currentTime / 1000;
      this.backgroundVideo.play().catch(console.error);
    }
  }

  pause() {
    this.isRunning = false;
    console.log("一時停止: " + this.currentTime + "ms");
    
    // 音声がある場合は一時停止
    if (this.audioPlayer) {
      this.audioPlayer.pause();
    }
    
    // 背景動画がある場合は一時停止
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
    }
  }

  reset() {
    this.currentTime = 0;
    this.lastUpdateTime = 0;
    this.instanceManager.update(this.currentTime);
    console.log("リセット");
    
    // 音声がある場合はシーク
    if (this.audioPlayer) {
      this.audioPlayer.stop();
    }
    
    // 背景動画がある場合はリセット
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
      this.backgroundVideo.currentTime = 0;
    }
  }

  /**
   * 統一シーク処理（プレビュー機能と動画エクスポートで共通）
   * 背景動画・アニメーション一括同期を実現
   */
  async seek(timeMs: number): Promise<void> {
    const seekTimestamp = Date.now();
    console.log(`[${seekTimestamp}] Engine: ===== Engine.seek開始（統一シーク処理） =====`);
    console.log(`[${seekTimestamp}] Engine: Seek to ${timeMs}ms`);
    console.log(`[${seekTimestamp}] Engine: 現在のthis.currentTime: ${this.currentTime}ms`);
    console.log(`[${seekTimestamp}] Engine: this.isRunning: ${this.isRunning}`);
    
    this.currentTime = timeMs;
    this.lastUpdateTime = performance.now();
    console.log(`[${seekTimestamp}] Engine: this.currentTime更新完了: ${this.currentTime}ms`);
    
    console.log(`[${seekTimestamp}] Engine: instanceManager.update実行開始`);
    this.instanceManager.update(this.currentTime);
    console.log(`[${seekTimestamp}] Engine: instanceManager.update実行完了`);
    
    // 音声がある場合は再生中でなくてもシークを実行
    if (this.audioPlayer) {
      console.log(`[${seekTimestamp}] Engine: audioPlayer.seek実行開始: ${timeMs / 1000}秒`);
      // 一時停止中でも音声の位置を更新
      this.audioPlayer.seek(timeMs / 1000); // 秒単位に変換
      console.log(`[${seekTimestamp}] Engine: audioPlayer.seek実行完了`);
    } else {
      console.log(`[${seekTimestamp}] Engine: audioPlayerが存在しないため音声シークをスキップ`);
    }
    
    // 背景動画がある場合はシーク
    if (this.backgroundVideo) {
      this.backgroundVideo.currentTime = timeMs / 1000;
    }
    
    // シーク操作後にタイムライン更新イベントを発火
    console.log(`[${seekTimestamp}] Engine: dispatchTimelineUpdatedEvent実行開始`);
    this.dispatchTimelineUpdatedEvent();
    console.log(`[${seekTimestamp}] Engine: dispatchTimelineUpdatedEvent実行完了`);
    
    // シークイベントを発火
    console.log(`[${seekTimestamp}] Engine: engine-seekedイベント発火開始`);
    const seekEvent = new CustomEvent('engine-seeked', {
      detail: {
        currentTime: timeMs,
        totalDuration: this.audioDuration,
        timestamp: seekTimestamp,
        source: 'Engine'
      }
    });
    window.dispatchEvent(seekEvent);
    console.log(`[${seekTimestamp}] Engine: engine-seekedイベント発火完了`);
    
    // プレビュー機能と動画エクスポートで統一の待機処理
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        console.log(`[${seekTimestamp}] Engine: ===== Engine.seek完了（統一シーク処理） =====`);
        resolve();
      });
    });
  }

  /**
   * 精密なシーク（動画エクスポート用）
   * リアルタイム再生に依存しない正確なタイムライン制御
   */
  async seekToExactTime(timeMs: number): Promise<void> {
    try {
      console.log(`Engine: Seeking to exact time ${timeMs}ms for video export`);
      
      // 時間を設定
      this.currentTime = timeMs;
      this.lastUpdateTime = performance.now();
      
      // インスタンスマネージャーを更新
      this.instanceManager.update(this.currentTime);
      
      // 背景動画のシークは VideoExporter 側で処理するため、ここではスキップ
      // NOTE: Engine.seekToExactTimeは背景動画以外の要素（アニメーションテンプレート等）のみを更新
      
      // 強制的にレンダリングを実行して状態を安定化
      this.app.render();
      
      console.log(`Engine: Exact seek completed to ${timeMs}ms`);
      
    } catch (error) {
      console.error(`Engine: Error in seekToExactTime to ${timeMs}ms:`, error);
      throw error;
    }
  }

  // テンプレートの更新（歌詞データを保持）
  updateTemplate(template: IAnimationTemplate, params: Record<string, any> = {}) {
    console.log('Engine: updateTemplateが呼び出されました', params);
    this.template = template; // templateプロパティを更新
    this.instanceManager.updateTemplate(template, params);
    
    // 現在の時刻で再度描画を更新して結果を反映
    this.instanceManager.update(this.currentTime);
    
    // タイムライン更新イベントを発火して関連UIを更新
    this.dispatchTimelineUpdatedEvent();
  }
  
  // テンプレートのみを変更（歌詞データを保持）
  changeTemplate(template: IAnimationTemplate, params: Record<string, any> = {}, templateId?: string): boolean {
    try {
      console.log('Engine: changeTemplateが呼び出されました - 歌詞データを保持したままテンプレートを変更');
      
      // 現在の歌詞データと状態を保持
      const currentLyrics = JSON.parse(JSON.stringify(this.phrases)); // ディープコピー
      const currentTime = this.currentTime;
      const isCurrentlyPlaying = this.isRunning;
      
      // テンプレートのパラメータ設定からデフォルトパラメータを取得
      const defaultParams = {};
      if (typeof template.getParameterConfig === 'function') {
        const params = template.getParameterConfig();
        params.forEach((param) => {
          defaultParams[param.name] = param.default;
        });
      } else {
        throw new Error(`Template ${template.constructor?.name || 'Unknown'} must implement getParameterConfig() method`);
      }
      
      // パラメータをマージ（引数のparamsが優先）
      const mergedParams = { ...defaultParams, ...params };
      
      // テンプレートIDを決定（指定がなければ現在のデフォルトIDを使用）
      const actualTemplateId = templateId || this.templateManager.getDefaultTemplateId();
      
      // テンプレートマネージャーを更新
      this.templateManager.registerTemplate(actualTemplateId, template, {name: actualTemplateId}, true);
      this.parameterManager.setTemplateDefaultParams(actualTemplateId, mergedParams);
      this.parameterManager.updateGlobalParams(mergedParams);
      
      // メインテンプレートを更新
      this.template = template;
      
      // パラメータサービスも更新（後方互換性のため）
      this.paramService.updateParams('global', null, mergedParams);
      
      // インスタンスマネージャーのテンプレートを更新（歌詞データの再読み込みは行わない）
      this.instanceManager.updateTemplate(template, mergedParams);
      
      // 現在の時刻でアニメーションを更新
      this.instanceManager.update(currentTime);
      
      // 再生状態を復元
      if (isCurrentlyPlaying) {
        this.isRunning = true;
        this.lastUpdateTime = performance.now();
      }
      
      console.log('Engine: テンプレート変更完了 - 歌詞データと再生状態を保持');
      return true;
    } catch (error) {
      console.error('Engine: テンプレート変更エラー:', error);
      return false;
    }
  }

  // タイムライン関連データ取得用メソッド
  getTimelineData() {
    console.log('Engine: getTimelineData 呼び出し - 現在の歌詞データ:', this.phrases);
    return {
      lyrics: this.phrases,
      duration: this.audioDuration
    };
  }
  
  // マーカー操作の結果を反映するメソッド（Undo対応）
  updateLyricsData(updatedLyrics: PhraseUnit[], saveState: boolean = true, changeType: string = '歌詞タイミング変更') {
    console.log('Engine: updateLyricsData呼び出し開始', { 
      changeType, 
      phrasesCount: updatedLyrics.length,
      currentTime: this.currentTime 
    });
    
    // 状態保存（Undo操作時はスキップ）
    if (saveState) {
      // 変更前の状態を保存
      const paramExport = this.parameterManager.exportParameters();
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)), // 現在の歌詞データを保存
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        globalParams: this.parameterManager.getGlobalParams(),
        objectParams: paramExport.objects || {},
        activatedObjects: paramExport.activatedObjects || [],
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      this.projectStateManager.saveBeforeLyricsChange(changeType);
    }
    
    // 文字インデックスを計算してから更新（一度だけ実行）
    this.phrases = calculateCharacterIndices(updatedLyrics);
    console.log('Engine: 歌詞データ更新完了（文字インデックス再計算済み）');
    
    // 変更タイプに応じた最適化処理
    if (changeType === '単語分割編集') {
      console.log('Engine: 単語分割編集 - 完全な位置再計算とインスタンス再構築');
      // 単語分割の場合は文字位置が変わるため完全な再構築が必要
      this.charPositions.clear();
      this.arrangeCharsOnStage();
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
    } else {
      console.log('Engine: デフォルト処理 - 完全な再計算');
      // デフォルトの全体更新（タイミング変更も含む）
      this.charPositions.clear();
      this.arrangeCharsOnStage();
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
    }
    
    // 現在の時間位置でアニメーションを更新
    this.instanceManager.update(this.currentTime);
    console.log('Engine: アニメーション更新完了');
    
    // タイムライン更新イベント発火
    this.dispatchTimelineUpdatedEvent();
    
    // 新しい歌詞データをProjectStateManagerの現在状態に反映
    const paramExport = this.parameterManager.exportParameters();
    this.projectStateManager.updateCurrentState({
      lyricsData: JSON.parse(JSON.stringify(this.phrases)),
      activatedObjects: paramExport.activatedObjects || []
    });
    console.log('Engine: updateLyricsData処理完了');
    
    return this.phrases;
  }

  // オブジェクト固有のパラメータを設定
  updateObjectParams(objectId: string, type: 'phrase' | 'word' | 'char' | 'global', params: Record<string, any>) {
    try {
      console.log('Engine: updateObjectParamsが呼び出されました', type, objectId, params);
      // パラメータサービスを使用してパラメータを更新
      this.paramService.updateParams(type, objectId, params);
      
      // パラメータマネージャーにも個別パラメータを更新
      this.parameterManager.updateObjectParams(objectId, params);
      
      // ① デフォルト＋オブジェクトパラメータを反映
      if (!this.template || !this.instanceManager) {
        console.error('Engine: templateまたはinstanceManagerがnull/undefinedです');
        return false;
      }
      
      if (type === 'global') {
        // グローバルパラメータのみを更新
        this.instanceManager.updateTemplate(this.template, this.paramService.getGlobalParams());
      } else {
        // オブジェクト固有のパラメータマージの場合は、グローバルパラメータもマージする
        this.instanceManager.updateTemplate(this.template, {
          ...this.paramService.getGlobalParams(),
          ...this.paramService.getObjectParams(type as 'phrase' | 'word' | 'char', objectId)
        });
      }
      
      // ② パラメータ変更に応じた更新処理
      const isLayoutChange = this.isLayoutAffectingChange(params);
      
      if (isLayoutChange) {
        // 文字配置に影響するパラメータ変更時のみ座標を再計算
        this.recalculateCharPositionsOnly();
        // CSS スケーリングも更新
        this.applyCSSScaling();
        // インスタンスを完全再構築
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      } else {
        // 配置に影響しないパラメータ変更時は既存インスタンスを更新のみ
        this.instanceManager.updateExistingInstances();
      }
      
      // 現在の時間位置でアニメーションを更新
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      return true;
    } catch (error) {
      console.error('Engine: updateObjectParamsの処理中にエラーが発生しました', error);
      return false;
    }
  }
  
  // グローバルパラメータを更新（Undo対応）
  updateGlobalParams(params: Record<string, any>, saveState: boolean = true) {
    try {
      console.log('Engine: updateGlobalParamsが呼び出されました', params);
      
      // 状態保存（Undo操作時はスキップ）
      if (saveState) {
        this.projectStateManager.updateCurrentState({
          lyricsData: JSON.parse(JSON.stringify(this.phrases)),
          currentTime: this.currentTime,
          templateAssignments: this.templateManager.exportAssignments(),
          globalParams: this.parameterManager.getGlobalParams(),
          objectParams: this.parameterManager.exportParameters().objects || {},
          defaultTemplateId: this.templateManager.getDefaultTemplateId(),
          activatedObjects: this.parameterManager.getActivatedObjects()
        });
        this.projectStateManager.saveBeforeParameterChange('グローバルパラメータ');
      }
      
      // パラメータサービスを使用してグローバルパラメータを更新
      this.paramService.updateParams('global', null, params);
      
      // パラメータマネージャーも更新
      this.parameterManager.updateGlobalParams(params);
      
      // ① デフォルトパラメータを更新
      if (this.template && this.instanceManager) {
        this.instanceManager.updateTemplate(this.template, this.paramService.getGlobalParams());
      } else {
        console.error('Engine: templateまたはinstanceManagerがnull/undefinedです');
        return false;
      }
      
      // ② パラメータ変更に応じた更新処理
      const isLayoutChange = this.isLayoutAffectingChange(params);
      
      if (isLayoutChange) {
        // レイアウト変更時、アクティブ化されたオブジェクトのパラメータを保持
        const activatedObjectParams = this.preserveActivatedObjectParams();
        
        // 文字配置に影響するパラメータ変更時のみ座標を再計算
        this.recalculateCharPositionsOnly();
        // CSS スケーリングも更新
        this.applyCSSScaling();
        // インスタンスを完全再構築
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
        
        // アクティブ化されたオブジェクトのパラメータを復元
        this.restoreActivatedObjectParams(activatedObjectParams);
      } else {
        // 配置に影響しないパラメータ変更時は既存インスタンスを更新のみ
        this.instanceManager.updateExistingInstances();
      }
      
      // 現在の時間位置でアニメーションを更新
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      return true;
    } catch (error) {
      console.error('Engine: updateGlobalParamsの処理中にエラーが発生しました', error);
      return false;
    }
  }

  // 選択されたオブジェクトの個別パラメータをクリア
  clearSelectedObjectParams(objectIds: string[]): boolean {
    try {
      console.log('Engine: clearSelectedObjectParamsが呼び出されました', objectIds);
      
      // パラメータマネージャーで個別パラメータをクリア
      this.parameterManager.clearMultipleObjectParams(objectIds);
      
      // テンプレートマネージャーで個別テンプレート割り当てもクリア
      objectIds.forEach(id => {
        this.templateManager.unassignTemplate(id);
      });
      
      // パラメータサービスからもクリア（もし必要なら）
      objectIds.forEach(id => {
        // オブジェクトタイプを判定
        const parts = id.split('_');
        let type: 'phrase' | 'word' | 'char' | null = null;
        
        if (parts.includes('char')) {
          type = 'char';
        } else if (parts.includes('word')) {
          type = 'word';
        } else if (parts.includes('phrase')) {
          type = 'phrase';
        }
        
        if (type) {
          // パラメータサービスをリセット（グローバルパラメータのみ適用）
          this.paramService.updateParams(type, id, {});
        }
      });
      
      // インスタンスを更新
      if (this.template && this.instanceManager) {
        // 各オブジェクトのインスタンスを更新
        objectIds.forEach(objectId => {
          this.updateObjectInstance(objectId);
        });
        
        // 現在の時間位置でアニメーションを更新
        this.instanceManager.update(this.currentTime);
      }
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      console.log(`Engine: ${objectIds.length}個のオブジェクトの個別パラメータとテンプレート割り当てをクリアしました`);
      return true;
    } catch (error) {
      console.error('Engine: clearSelectedObjectParamsの処理中にエラーが発生しました', error);
      return false;
    }
  }

  // 全ての個別オブジェクトパラメータとアクティベーション状態を強制クリア
  forceCleanAllObjectData(): boolean {
    try {
      console.log('Engine: 全ての個別オブジェクトデータの強制クリア開始');
      
      // パラメータマネージャーで全データクリア
      this.parameterManager.forceCleanAllObjectData();
      
      // テンプレートマネージャーで全ての個別テンプレート割り当てをクリア
      this.templateManager.clearAllAssignments();
      
      // パラメータサービスを初期化（グローバルパラメータのみ残す）
      const globalParams = this.parameterManager.getGlobalParams();
      this.paramService = new ParamService(globalParams);
      
      // インスタンスマネージャーを完全に再構築
      if (this.template && this.instanceManager) {
        // 全ての文字位置を再計算
        this.charPositions.clear();
        this.arrangeCharsOnStage();
        
        // インスタンスを再読み込み
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
        
        // 現在の時間位置でアニメーションを更新
        this.instanceManager.update(this.currentTime);
      }
      
      // タイムライン更新イベント発火
      this.dispatchTimelineUpdatedEvent();
      
      // アクティベーション状態変更イベント発火
      const event = new CustomEvent('objects-deactivated', {
        detail: {
          objectIds: [],
          objectType: 'all'
        }
      });
      window.dispatchEvent(event);
      
      console.log('Engine: 全ての個別オブジェクトデータの強制クリア完了');
      return true;
    } catch (error) {
      console.error('Engine: forceCleanAllObjectDataの処理中にエラーが発生しました', error);
      return false;
    }
  }

  // 音声ファイル読み込み用メソッド
  loadAudioURL(url: string, fileName?: string) {
    console.log('Engine: 音声ファイル読み込み:', url, fileName);
    console.log('Engine: 背景動画の状態:', this.backgroundVideo ? `存在 (muted: ${this.backgroundVideo.muted})` : '存在しない');
    
    // Howlerで音声を読み込む（フォーマットを明示的に指定）
    this.audioURL = url;
    this.audioFileName = fileName;
    this.audioPlayer = new Howl({
      src: [url],
      format: ['mp3', 'wav', 'ogg', 'm4a'], // フォーマットを明示的に指定
      html5: true,
      preload: true,
      onload: () => {
        if (this.audioPlayer) {
          const audioDuration = this.audioPlayer.duration() * 1000; // ミリ秒に変換
          console.log(`Engine: 音声ロード完了: 長さ ${audioDuration}ms`);
          
          // 歌詞データと音楽データの両方を考慮してタイムライン長さを再計算
          this.calculateAndSetAudioDuration();
          
          // ProjectStateManagerに音楽ファイル情報を保存
          this.projectStateManager.updateCurrentState({
            audioFileName: this.audioFileName,
            audioFileDuration: audioDuration
          });
          
          // タイムライン更新イベントを発火
          this.dispatchTimelineUpdatedEvent();
          
          console.log('Engine: 音声ファイルの読み込みが完了しました。再生可能です。');
          
          // 音声ファイルロード後に自動保存
          if (this.autoSaveEnabled) {
            this.autoSaveToLocalStorage();
          }
         }
       },
       onloaderror: (id: number, error: unknown) => {
         console.error(`Engine: 音声ロードエラー (ID: ${id}):`, error);
         // エラー時はエラーメッセージをより明確にする
         if (error === 'No codec support for selected audio sources.') {
           console.error('Engine: このファイル形式はサポートされていません。MP3、WAV、OGGファイルを使用してください。');
         }
       },
       onend: () => {
         console.log('Engine: 音声再生終了 - 自動停止');
         this.pause();
         this.dispatchCustomEvent('audio-ended', { 
           currentTime: this.currentTime,
           audioFileName: this.audioFileName 
         });
       }
    });
  }
  
  /**
   * HTMLAudioElement/HTMLVideoElementから音声を読み込み（Electron用）
   */
  loadAudioElement(audioElement: HTMLAudioElement | HTMLVideoElement, fileName?: string) {
    console.log('Engine: HTMLAudioElement/HTMLVideoElementから音声読み込み:', fileName);
    console.log('Engine: 背景動画の状態:', this.backgroundVideo ? `存在 (muted: ${this.backgroundVideo.muted})` : '存在しない');
    
    // AudioElementからHowlを作成
    this.audioFileName = fileName || 'electron-audio';
    this.audioPlayer = new Howl({
      src: [audioElement.src],
      format: ['mp3', 'wav', 'ogg', 'm4a'],
      html5: true,
      preload: true, // Howlerでも確実にロード
      onload: () => {
        if (this.audioPlayer) {
          const audioDuration = this.audioPlayer.duration() * 1000; // ミリ秒に変換
          console.log(`Engine: HTMLAudioElement音声ロード完了: 長さ ${audioDuration}ms`);
          
          // 歌詞データと音楽データの両方を考慮してタイムライン長さを再計算
          this.calculateAndSetAudioDuration();
          
          // ProjectStateManagerに音楽ファイル情報を保存
          this.projectStateManager.updateCurrentState({
            audioFileName: this.audioFileName,
            audioFileDuration: audioDuration
          });
          
          // タイムライン更新イベントを発火
          this.dispatchTimelineUpdatedEvent();
          
          console.log('Engine: HTMLAudioElement音声ファイルの読み込みが完了しました。再生可能です。');
          
          // 音声ファイルロード後に自動保存
          if (this.autoSaveEnabled) {
            this.autoSaveToLocalStorage();
          }
         }
       },
       onloaderror: (id: number, error: unknown) => {
         console.error(`Engine: HTMLAudioElement音声ロードエラー (ID: ${id}):`, error);
       },
       onend: () => {
         console.log('Engine: HTMLAudioElement音声再生終了 - 自動停止');
         this.pause();
         this.dispatchCustomEvent('audio-ended', { 
           currentTime: this.currentTime,
           audioFileName: this.audioFileName 
         });
       }
    });
    
    console.log('Engine: Howlerのonloadコールバック待機中...');
  }
  
  // タイムライン更新イベントを発火
  public dispatchTimelineUpdatedEvent() {
    // タイムラインイベントログを制限
    try {
      console.log('Engine: timeline-updatedイベント発火開始', {
        phrasesCount: this.phrases.length,
        currentTime: this.currentTime
      });
      
      const event = new CustomEvent('timeline-updated', {
        detail: { 
          lyrics: JSON.parse(JSON.stringify(this.phrases)), // ディープコピーで確実に新しいオブジェクトを渡す
          duration: this.audioDuration 
        }
      });
      window.dispatchEvent(event);
      console.log('Engine: timeline-updatedイベント発火完了');
      
      // マーカー関連データが更新されたのでアニメーションも更新
      this.instanceManager.update(this.currentTime);
    } catch (error) {
      console.error('Engine: イベント発火エラー:', error);
    }
  }

  
  // クリーンアップ
  destroy() {
    try {
      // 自動保存タイマーをクリア
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
      }
      
      // リサイズイベントリスナーを削除
      window.removeEventListener('resize', this.handleResize.bind(this));
      
      // インスタンスマネージャーをクリーンアップ
      if (this.instanceManager) {
        this.instanceManager.clearAllInstances();
      }
      
      // Ticker からアップデート関数を削除
      if (this.app && this.app.ticker) {
        this.app.ticker.remove(this.updateFn);
      }
      
      // 音声プレイヤーをクリーンアップ
      if (this.audioPlayer) {
        this.audioPlayer.unload();
      }
      
      // デバッグマネージャーをクリーンアップ
      if (this.debugManager) {
        this.debugManager.destroy();
      }
      
      // PIXI アプリケーションを破棄
      if (this.app) {
        this.app.destroy(true, {children: true, texture: true, baseTexture: true});
      }
      
      // HTML要素をクリア
      if (this.canvasContainer) {
        this.canvasContainer.innerHTML = '';
      }
    } catch (error) {
      console.error('Engine destroy error:', error);
    }
  }
  
  // エンジンの状態をチェック
  isReady(): boolean {
    return !!(this.template && this.instanceManager && this.app);
  }
  
  // テンプレートの追加
  addTemplate(
    id: string,
    template: IAnimationTemplate,
    config: { name: string, description?: string, thumbnailUrl?: string } = {},
    defaultParams: Record<string, any> = {},
    isDefault: boolean = false
  ): boolean {
    try {
      this.templateManager.registerTemplate(id, template, config, isDefault);
      this.parameterManager.setTemplateDefaultParams(id, defaultParams);
      
      // もしデフォルトテンプレートとして設定された場合
      if (isDefault) {
        this.template = template;
        this.updateGlobalParams(defaultParams);
      }
      
      return true;
    } catch (error) {
      console.error(`Engine: テンプレート追加エラー:`, error);
      return false;
    }
  }
  
  // 現在のテンプレートIDを取得するヘルパーメソッド
  private getCurrentTemplateId(objectId: string): string {
    // 直接割り当てられたテンプレートを確認
    const assignments = this.templateManager.getAssignments();
    if (assignments.has(objectId)) {
      return assignments.get(objectId)!;
    }
    
    // 親オブジェクトのテンプレートを確認
    const parentId = this.getParentObjectId(objectId);
    if (parentId && assignments.has(parentId)) {
      return assignments.get(parentId)!;
    }
    
    // デフォルトテンプレートID
    return this.templateManager.getDefaultTemplateId();
  }
  
  // 親オブジェクトIDを取得するヘルパーメソッド
  private getParentObjectId(objectId: string): string | null {
    // IDの形式: phrase_0_word_1_char_2
    const parts = objectId.split('_');
    
    if (parts.length >= 4 && parts[parts.length - 2] === 'char') {
      // 文字の場合、親は単語
      return parts.slice(0, parts.length - 2).join('_');
    } else if (parts.length >= 4 && parts[parts.length - 2] === 'word') {
      // 単語の場合、親はフレーズ
      return parts.slice(0, parts.length - 2).join('_');
    }
    
    return null;
  }
  
  // テンプレート割り当て（Undo対応版）
  assignTemplate(
    objectId: string,
    templateId: string,
    preserveParams: boolean = true,
    saveState: boolean = true,
    forceReapply: boolean = false
  ): boolean {
    try {
      console.log(`Engine: テンプレート割り当て開始 - ${objectId} -> ${templateId} (forceReapply: ${forceReapply})`);
      
      // 現在のテンプレートID取得
      const currentTemplateId = this.getCurrentTemplateId(objectId);
      console.log(`現在のテンプレートID: ${currentTemplateId}`);
      
      // 同じテンプレートの場合の処理
      if (currentTemplateId === templateId) {
        if (!forceReapply) {
          console.log(`Engine: 同じテンプレートのため割り当てをスキップ`);
          return true;
        } else {
          console.log(`Engine: 同じテンプレートですが、forceReapply=trueのため再更新を実行`);
          // テンプレート割り当てはスキップするが、インスタンス更新は実行する
          this.performInstanceUpdate(objectId, templateId);
          return true;
        }
      }
      
      // 状態保存（Undo操作時はスキップ）
      if (saveState) {
        this.projectStateManager.updateCurrentState({
          lyricsData: JSON.parse(JSON.stringify(this.phrases)),
          currentTime: this.currentTime,
          templateAssignments: this.templateManager.exportAssignments(),
          globalParams: this.parameterManager.getGlobalParams(),
          objectParams: this.parameterManager.exportParameters().objects || {},
          defaultTemplateId: this.templateManager.getDefaultTemplateId()
        });
        this.projectStateManager.saveBeforeTemplateChange(objectId, currentTemplateId);
      }
      
      // パラメータ保持処理
      if (preserveParams) {
        console.log(`パラメータ保持処理実行: ${currentTemplateId} -> ${templateId}`);
        this.parameterManager.handleTemplateChange(
          currentTemplateId,
          templateId,
          objectId,
          preserveParams
        );
      }
      
      // テンプレート割り当て
      const result = this.templateManager.assignTemplate(objectId, templateId);
      console.log(`テンプレート割り当て結果: ${result}`);
      
      if (result) {
        // 統合されたインスタンス更新処理
        this.performInstanceUpdate(objectId, templateId);
        console.log(`Engine: テンプレート割り当て完了`);
      } else {
        console.error(`テンプレート割り当てに失敗しました`);
      }
      
      return result;
    } catch (error) {
      console.error(`テンプレート割り当てエラー: ${objectId} -> ${templateId}`, error);
      return false;
    }
  }
  
  // フレーズIDかどうかを判定するヘルパー
  private isPhraseId(id: string): boolean {
    return id.startsWith('phrase_') && id.split('_').length === 2;
  }

  // 統合されたインスタンス更新処理
  private performInstanceUpdate(objectId: string, templateId: string): void {
    console.log(`インスタンス更新処理開始: ${objectId} -> ${templateId}`);
    
    try {
      // インスタンスマネージャーにテンプレートマネージャーの最新情報を設定
      this.instanceManager.updateTemplateAssignments(this.templateManager, this.parameterManager);
      
      if (this.isPhraseId(objectId)) {
        // フレーズレベルの場合は完全再構築
        console.log(`フレーズレベル更新 - 完全再構築処理`);
        const targetPhrase = this.phrases.find(p => p.id === objectId);
        if (targetPhrase) {
          this.reconstructSpecificPhrase(targetPhrase);
        } else {
          console.error(`対象フレーズが見つかりません: ${objectId}`);
          return;
        }
      } else {
        // 非フレーズレベルの場合は部分更新
        console.log(`非フレーズレベル更新 - 部分更新処理`);
        this.instanceManager.updateInstanceAndChildren(objectId);
      }
      
      // 現在の時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベントを発火
      this.dispatchTimelineUpdatedEvent();
      
      console.log(`インスタンス更新処理完了: ${objectId}`);
    } catch (error) {
      console.error(`インスタンス更新処理エラー: ${objectId}`, error);
    }
  }
  
  
  // デフォルトテンプレート変更メソッド
  setDefaultTemplate(templateId: string, preserveParams: boolean = true): boolean {
    try {
      // 現在のデフォルトテンプレートID
      const currentDefaultId = this.templateManager.getDefaultTemplateId();
      
      // 同じテンプレートなら何もしない
      if (currentDefaultId === templateId) {
        return true;
      }
      
      // テンプレート変更前に状態を保存
      this.projectStateManager.saveBeforeTemplateChange(null, currentDefaultId);
      
      // パラメータ保持処理
      if (preserveParams) {
        this.parameterManager.handleTemplateChange(
          currentDefaultId,
          templateId,
          undefined, // グローバルパラメータ
          preserveParams
        );
      }
      
      // デフォルトテンプレートを設定
      const result = this.templateManager.setDefaultTemplateId(templateId);
      if (result) {
        // メインテンプレートも更新
        const template = this.templateManager.getTemplateById(templateId);
        if (template) {
          this.template = template;
        }
        
        // インスタンスマネージャーの更新 - 影響を受ける全インスタンスを更新
        this.instanceManager.updateTemplateAssignments(
          this.templateManager, 
          this.parameterManager
        );
      }
      
      return result;
    } catch (error) {
      console.error(`デフォルトテンプレート変更エラー: ${templateId}`, error);
      return false;
    }
  }
  
  /**
   * 複数オブジェクトへのテンプレート一括割り当て
   * @param objectIds 割り当て対象のオブジェクトID配列
   * @param templateId 適用するテンプレートID
   * @param preserveParams パラメータを保持するかどうか
   * @returns 成功したかどうか
   */
  batchAssignTemplate(
    objectIds: string[],
    templateId: string,
    preserveParams: boolean = true,
    forceReapply: boolean = false
  ): boolean {
    try {
      if (objectIds.length === 0) return false;
      
      // 現在の状態を保存（一括操作として一つの履歴エントリにする）
      this.projectStateManager.saveBeforeTemplateChange(`テンプレート一括変更: ${objectIds.length}個のオブジェクト`);
      
      // テンプレートマネージャーで一括割り当て
      const successfulIds = this.templateManager.batchAssignTemplate(objectIds, templateId);
      
      // パラメータ処理と更新
      for (const objectId of successfulIds) {
        // 現在のテンプレートIDを取得
        const currentTemplateId = Array.from(this.templateManager.getAssignments().entries())
          .find(([id, tmpl]) => id === objectId)?.[1] || this.templateManager.getDefaultTemplateId();
        
        // パラメータ保持処理
        if (currentTemplateId !== templateId && preserveParams) {
          this.parameterManager.handleTemplateChange(
            currentTemplateId,
            templateId,
            objectId,
            preserveParams
          );
        }
        
        // オブジェクトのインスタンスを更新
        this.updateObjectInstance(objectId);
      }
      
      return successfulIds.length > 0;
    } catch (error) {
      console.error(`Engine: テンプレート一括割り当てエラー:`, error);
      return false;
    }
  }
  
  // 特定フレーズの完全再構築（タイミング情報保持）
  private reconstructSpecificPhrase(phrase: PhraseUnit): void {
    try {
      console.log(`特定フレーズ再構築開始: ${phrase.id}`);
      
      // フレーズの文字位置情報を再計算
      this.recalculateCharPositionsForPhrase(phrase);
      
      // 全体の歌詞データを再ロード（効率的でないが確実）
      // 将来的には特定フレーズのみの再構築メソッドをInstanceManagerに実装
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      
      console.log(`特定フレーズ再構築完了: ${phrase.id}`);
    } catch (error) {
      console.error(`特定フレーズ再構築エラー: ${phrase.id}`, error);
    }
  }
  
  // 特定フレーズの文字位置を再計算
  private recalculateCharPositionsForPhrase(phrase: PhraseUnit): void {
    console.log(`フレーズ文字位置再計算: ${phrase.id}`);
    
    // 該当フレーズの文字位置のみを削除
    phrase.words.forEach(word => {
      word.chars.forEach(char => {
        this.charPositions.delete(char.id);
      });
    });
    
    // 全体の配置を再計算（効率化の余地あり）
    this.arrangeCharsOnStage();
  }
  
  // 特定オブジェクトのインスタンスを更新（改善版）
  private updateObjectInstance(objectId: string): void {
    console.log(`Engine: オブジェクトインスタンス更新 - ${objectId}`);
    
    try {
      // インスタンスマネージャーにテンプレートマネージャーの最新情報を設定
      this.instanceManager.updateTemplateAssignments(this.templateManager, this.parameterManager);
      
      // 階層的な更新を実行
      this.instanceManager.updateInstanceAndChildren(objectId);
      
      // 現在時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      console.log(`オブジェクトインスタンス更新完了: ${objectId}`);
    } catch (error) {
      console.error(`オブジェクトインスタンス更新エラー: ${objectId}`, error);
    }
  }
  
  // プロジェクト保存
  saveProject(): any {
    return {
      name: 'Visiblyrics Project',
      version: '1.0.0',
      timestamp: Date.now(),
      defaultTemplateId: this.templateManager.getDefaultTemplateId(),
      templates: Object.fromEntries(
        this.templateManager.getAllTemplates().map(({id, config}) => [id, config])
      ),
      templateAssignments: this.templateManager.exportAssignments(),
      globalParams: this.parameterManager.getGlobalParams(),
      objectParams: Object.fromEntries(
        Array.from(this.parameterManager.exportParameters().objects || {})
      ),
      lyrics: this.phrases
    };
  }

  // 現在時刻を設定するメソッド（動画出力用）
  setCurrentTime(timeMs: number): void {
    this.currentTime = timeMs;
    this.instanceManager.update(timeMs);
  }
  
  /**
   * 動画出力用のスケーリングを設定
   * メインコンテナにスケーリングを適用し、文字サイズを逆スケーリング
   * @param scale スケール係数
   */
  setOutputScale(scale: number): void {
    console.log(`Engine: 出力スケーリング設定 (${scale})`);    
    
    // スケールが1の場合はリセット処理
    if (scale === 1.0) {
      this.resetOutputScale();
      return;
    }
    
    // メインコンテナにスケーリングを適用
    this.instanceManager.setMainContainerScale(scale);
    
    // 文字コンテナを逆スケーリング
    this.applyInverseScalingToText(scale);
  }
  
  /**
   * 出力スケーリングをリセット
   */
  private resetOutputScale(): void {
    console.log(`Engine: 出力スケーリングをリセット`);    
    
    // メインコンテナのスケールをリセット
    this.instanceManager.setMainContainerScale(1.0);
    
    // フレーズコンテナの逆スケーリングをリセット
    const phraseInstances = this.instanceManager.getPhraseInstances();
    let resetCount = 0;
    
    for (const [id, instance] of phraseInstances) {
      if (instance && instance.container && (instance.container as any).__inverseScaled) {
        // スケールを元に戻す
        instance.container.scale.set(1, 1);
        // フラグをリセット
        (instance.container as any).__inverseScaled = false;
        resetCount++;
      }
    }
    
    console.log(`Engine: ${resetCount}個のフレーズコンテナの逆スケーリングをリセット`);    
    
    // 現在の時刻で再描画
    this.instanceManager.update(this.currentTime);
  }
  
  /**
   * 文字コンテナへの逆スケーリングを適用
   * @param scale スケール係数
   */
  private applyInverseScalingToText(scale: number): void {
    // 逆スケール係数（例: スケールが2なら0.5）
    const inverseScale = 1 / scale;
    
    console.log(`Engine: フレーズコンテナへの逆スケーリング適用 (${inverseScale})`);    
    
    // フレーズレベルのインスタンスを取得し、そのコンテナに逆スケーリングを適用
    const phraseInstances = this.instanceManager.getPhraseInstances();
    let updatedCount = 0;
    
    for (const [id, instance] of phraseInstances) {
      // フレーズコンテナに逆スケーリングを適用
      if (instance && instance.container) {
        // コンテナの現在のスケールを取得
        const currentScaleX = instance.container.scale.x;
        const currentScaleY = instance.container.scale.y;
        
        // 逆スケーリングを適用
        instance.container.scale.set(currentScaleX * inverseScale, currentScaleY * inverseScale);
        
        // 逆スケーリングフラグを設定
        (instance.container as any).__inverseScaled = true;
        
        updatedCount++;
      }
    }
    
    console.log(`Engine: ${updatedCount}個のフレーズコンテナに逆スケーリングを適用`);    
    
    // 現在の時刻で再描画
    this.instanceManager.update(this.currentTime);
  }
  
  // 最大時間を取得するメソッド
  getMaxTime(): number {
    return this.audioDuration;
  }
  
  // 現在時刻を取得するメソッド（動画出力用）
  getCurrentTime(): number {
    return this.currentTime;
  }
  
  // =============================================================================
  // Undo/Redo 機能
  // =============================================================================
  
  /**
   * Undo 操作を実行
   * @returns 成功したかどうか
   */
  undo(): boolean {
    try {
      console.log('Engine: Undo操作開始');
      
      if (!this.projectStateManager.canUndo()) {
        console.log('Engine: Undoできる状態がありません');
        return false;
      }
      
      // 現在の状態を更新してからUndoを実行
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)),
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        globalParams: this.parameterManager.getGlobalParams(),
        objectParams: this.parameterManager.exportParameters().objects || {},
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      
      // Undoを実行
      const success = this.projectStateManager.undo();
      
      if (success) {
        // 状態を復元
        const restoredState = this.projectStateManager.getCurrentState();
        this.restoreProjectState(restoredState);
        console.log('Engine: Undo操作完了');
      }
      
      return success;
    } catch (error) {
      console.error('Engine: Undo操作エラー:', error);
      return false;
    }
  }
  
  /**
   * Redo 操作を実行
   * @returns 成功したかどうか
   */
  redo(): boolean {
    try {
      console.log('Engine: Redo操作開始');
      
      if (!this.projectStateManager.canRedo()) {
        console.log('Engine: Redoできる状態がありません');
        return false;
      }
      
      // Redoを実行
      const success = this.projectStateManager.redo();
      
      if (success) {
        // 状態を復元
        const restoredState = this.projectStateManager.getCurrentState();
        this.restoreProjectState(restoredState);
        console.log('Engine: Redo操作完了');
      }
      
      return success;
    } catch (error) {
      console.error('Engine: Redo操作エラー:', error);
      return false;
    }
  }
  
  /**
   * Undoが可能かどうかを返す
   * @returns Undoが可能かどうか
   */
  canUndo(): boolean {
    return this.projectStateManager.canUndo();
  }
  
  /**
   * Redoが可能かどうかを返す
   * @returns Redoが可能かどうか
   */
  canRedo(): boolean {
    return this.projectStateManager.canRedo();
  }
  
  /**
   * プロジェクト状態を復元する
   * @param state 復元する状態
   */
  private restoreProjectState(state: import('./ProjectStateManager').ProjectState): void {
    try {
      console.log('Engine: プロジェクト状態復元開始', state.label);
      
      // 歌詞データの復元
      if (state.lyricsData) {
        this.phrases = JSON.parse(JSON.stringify(state.lyricsData));
        this.charPositions.clear();
        this.arrangeCharsOnStage();
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      }
      
      // テンプレート割り当ての復元
      if (state.templateAssignments) {
        this.templateManager.importAssignments(state.templateAssignments);
      }
      
      // パラメータの完全復元（改善版）
      if (state.globalParams || state.objectParams) {
        // ParameterManagerの完全復元メソッドを使用
        this.parameterManager.restoreCompleteState({
          global: state.globalParams,
          objects: state.objectParams
        });
        
        // ParamServiceも更新
        if (state.globalParams) {
          this.paramService.updateParams('global', null, state.globalParams);
        }
        
        console.log('Engine: パラメータ復元完了 - グローバル:', !!state.globalParams, 'オブジェクト:', !!state.objectParams);
      }
      
      // デフォルトテンプレートの復元
      if (state.defaultTemplateId) {
        this.templateManager.setDefaultTemplateId(state.defaultTemplateId);
        const defaultTemplate = this.templateManager.getTemplateById(state.defaultTemplateId);
        if (defaultTemplate) {
          this.template = defaultTemplate;
        }
      }
      
      // 時間位置の復元
      if (state.currentTime !== undefined) {
        this.currentTime = state.currentTime;
      }
      
      // インスタンスマネージャーの更新
      this.instanceManager.updateTemplateAssignments(this.templateManager, this.parameterManager);
      this.instanceManager.updateTemplate(this.template, this.parameterManager.getGlobalParams());
      
      // 現在の時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベントを発火
      this.dispatchTimelineUpdatedEvent();
      
      console.log('Engine: プロジェクト状態復元完了');
    } catch (error) {
      console.error('Engine: プロジェクト状態復元エラー:', error);
    }
  }
  
  /**
   * Undo/Redo履歴を取得
   * @returns 履歴情報
   */
  getUndoRedoHistory(): {
    history: import('./ProjectStateManager').ProjectState[];
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
  } {
    return {
      history: this.projectStateManager.getStateHistory(),
      currentIndex: this.projectStateManager.getHistoryIndex(),
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    };
  }

  // プロジェクト読み込み
  loadProject(config: any): boolean {
    try {
      // テンプレート割り当て情報の復元
      if (config.templateAssignments) {
        this.templateManager.importAssignments(config.templateAssignments);
      }
      
      // パラメータの復元
      if (config.globalParams) {
        this.parameterManager.updateGlobalParams(config.globalParams);
      }
      
      if (config.objectParams) {
        for (const [id, params] of Object.entries(config.objectParams)) {
          this.parameterManager.updateObjectParams(id, params as Record<string, any>);
        }
      }
      
      // 歌詞データの復元
      if (config.lyrics) {
        this.loadLyrics(config.lyrics);
      }
      
      // デフォルトテンプレートの設定
      if (config.defaultTemplateId) {
        this.templateManager.setDefaultTemplateId(config.defaultTemplateId);
        // メインテンプレートも更新
        const defaultTemplate = this.templateManager.getTemplateById(config.defaultTemplateId);
        if (defaultTemplate) {
          this.template = defaultTemplate;
        }
      }
      
      // インスタンスマネージャーの更新
      this.instanceManager.updateTemplate(this.template, this.parameterManager.getGlobalParams());
      
      // 現在の時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      // 初期状態をProjectStateManagerに保存
      const paramExport = this.parameterManager.exportParameters();
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)),
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        globalParams: this.parameterManager.getGlobalParams(),
        objectParams: paramExport.objects || {},
        activatedObjects: paramExport.activatedObjects || [],
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      this.projectStateManager.saveCurrentState('プロジェクト読み込み完了');
      
      return true;
    } catch (error) {
      console.error(`Engine: プロジェクト読み込みエラー:`, error);
      return false;
    }
  }

  // 方眼目盛りの表示/非表示を切り替え
  toggleGrid(): void {
    if (this.gridOverlay) {
      this.gridOverlay.toggleVisibility();
      
      // デバッグマネージャーの設定も更新
      if (this.debugManager) {
        const settings = this.debugManager.getSettings();
        settings.showGrid = this.gridOverlay.visible;
        this.debugManager.updateSettings(settings);
      }
    }
  }

  // 方眼目盛りの表示状態を設定
  setGridVisible(visible: boolean): void {
    if (this.gridOverlay) {
      this.gridOverlay.setVisible(visible);
      
      // デバッグマネージャーの設定も更新
      if (this.debugManager) {
        const settings = this.debugManager.getSettings();
        settings.showGrid = visible;
        this.debugManager.updateSettings(settings);
      }
    }
  }

  // 方眼目盛りの表示状態を取得
  isGridVisible(): boolean {
    return this.gridOverlay?.visible || false;
  }

  /**
   * Set the background color of the PIXI application
   * @param hexColor Hex color string (e.g., "#333333" or "0x333333")
   */
  setBackgroundColor(hexColor: string): void {
    if (!this.app || !this.app.renderer) {
      console.warn('Engine: PIXI application not initialized');
      return;
    }
    
    try {
      // Convert hex string to PIXI color number
      let colorNumber: number;
      
      if (hexColor.startsWith('#')) {
        // Handle "#333333" format
        colorNumber = parseInt(hexColor.substring(1), 16);
      } else if (hexColor.startsWith('0x')) {
        // Handle "0x333333" format
        colorNumber = parseInt(hexColor.substring(2), 16);
      } else {
        // Assume it's already a hex string without prefix
        colorNumber = parseInt(hexColor, 16);
      }
      
      // Validate the color number
      if (isNaN(colorNumber) || colorNumber < 0 || colorNumber > 0xFFFFFF) {
        console.error(`Engine: Invalid color value: ${hexColor}`);
        return;
      }
      
      // Update the PIXI application background color
      this.app.renderer.backgroundColor = colorNumber;
      
      console.log(`Engine: Background color changed to: ${hexColor} (${colorNumber})`);
    } catch (error) {
      console.error(`Engine: Error setting background color: ${hexColor}`, error);
    }
  }
  
  /**
   * 背景画像を設定
   */
  setBackgroundImage(imageUrl: string, fitMode: BackgroundFitMode = 'cover'): void {
    this.clearBackgroundMedia();
    
    this.backgroundConfig = {
      type: 'image',
      imageUrl,
      fitMode,
      backgroundColor: this.backgroundConfig.backgroundColor
    };
    
    PIXI.Texture.from(imageUrl).then((texture) => {
      this.backgroundSprite = new PIXI.Sprite(texture);
      this.applyBackgroundFitMode(this.backgroundSprite, fitMode);
      this.backgroundLayer.addChild(this.backgroundSprite);
      console.log(`Engine: Background image set: ${imageUrl} (${fitMode})`);
    }).catch((error) => {
      console.error(`Engine: Failed to load background image: ${imageUrl}`, error);
      // フォールバック: 背景色に戻す
      this.clearBackgroundMedia();
    });
  }
  
  /**
   * 背景動画を設定
   */
  setBackgroundVideo(videoUrl: string, fitMode: BackgroundFitMode = 'cover'): void {
    this.clearBackgroundMedia();
    
    this.backgroundConfig = {
      type: 'video',
      videoUrl,
      fitMode,
      backgroundColor: this.backgroundConfig.backgroundColor
    };
    
    // HTML5 Video要素を作成
    const video = document.createElement('video');
    video.src = videoUrl;
    video.loop = true;
    video.muted = true; // 自動再生のためにミュート
    video.playsInline = true;
    
    video.addEventListener('loadedmetadata', () => {
      const texture = PIXI.Texture.from(video);
      this.backgroundVideoSprite = new PIXI.Sprite(texture);
      this.applyBackgroundFitMode(this.backgroundVideoSprite, fitMode);
      this.backgroundLayer.addChild(this.backgroundVideoSprite);
      
      this.backgroundVideo = video;
      
      // 再生状態に応じて動画を同期
      if (this.isRunning) {
        video.currentTime = this.currentTime / 1000;
        video.play().catch(console.error);
      }
      
      console.log(`Engine: Background video set: ${videoUrl} (${fitMode})`);
    });
    
    video.addEventListener('error', (error) => {
      console.error(`Engine: Failed to load background video: ${videoUrl}`, error);
      // フォールバック: 背景色に戻す
      this.clearBackgroundMedia();
    });
    
    video.load();
  }
  
  /**
   * HTMLVideoElementから背景動画を設定（Electron用）
   */
  setBackgroundVideoElement(video: HTMLVideoElement, fitMode: BackgroundFitMode = 'cover', fileName?: string): void {
    this.clearBackgroundMedia();
    
    // ファイル名を保存（復元用）
    if (fileName) {
      this.backgroundVideoFileName = fileName;
    }
    
    this.backgroundConfig = {
      type: 'video',
      videoUrl: 'electron://loaded',
      fitMode,
      backgroundColor: this.backgroundConfig.backgroundColor
    };
    
    // すでに読み込まれている動画からテクスチャを作成
    const texture = PIXI.Texture.from(video);
    this.backgroundVideoSprite = new PIXI.Sprite(texture);
    this.applyBackgroundFitMode(this.backgroundVideoSprite, fitMode);
    this.backgroundLayer.addChild(this.backgroundVideoSprite);
    
    this.backgroundVideo = video;
    
    // 再生状態に応じて動画を同期
    if (this.isRunning) {
      video.currentTime = this.currentTime / 1000;
      video.play().catch(console.error);
    }
    
    console.log(`Engine: Background video set from HTMLVideoElement (${fitMode})${fileName ? ` - ${fileName}` : ''}`);
  }

  /**
   * 背景メディアをクリア
   */
  clearBackgroundMedia(): void {
    // 背景スプライトを削除
    if (this.backgroundSprite) {
      this.backgroundLayer.removeChild(this.backgroundSprite);
      this.backgroundSprite.destroy();
      this.backgroundSprite = undefined;
    }
    
    // 背景動画を削除
    if (this.backgroundVideoSprite) {
      this.backgroundLayer.removeChild(this.backgroundVideoSprite);
      this.backgroundVideoSprite.destroy();
      this.backgroundVideoSprite = undefined;
    }
    
    if (this.backgroundVideo) {
      this.backgroundVideo.pause();
      this.backgroundVideo.src = '';
      this.backgroundVideo = undefined;
    }
    
    // 背景色タイプに戻す
    this.backgroundConfig.type = 'color';
    delete this.backgroundConfig.imageUrl;
    delete this.backgroundConfig.videoUrl;
  }
  
  /**
   * 背景のフィットモードを適用
   */
  private applyBackgroundFitMode(sprite: PIXI.Sprite, fitMode: BackgroundFitMode): void {
    const stageWidth = this.app.renderer.width;
    const stageHeight = this.app.renderer.height;
    const textureWidth = sprite.texture.width;
    const textureHeight = sprite.texture.height;
    
    switch (fitMode) {
      case 'cover': {
        // アスペクト比を保持しながら、ステージ全体を覆う
        const scale = Math.max(stageWidth / textureWidth, stageHeight / textureHeight);
        sprite.scale.set(scale);
        sprite.position.set(
          (stageWidth - textureWidth * scale) / 2,
          (stageHeight - textureHeight * scale) / 2
        );
        break;
      }
      case 'contain': {
        // アスペクト比を保持しながら、ステージ内に収める
        const scale = Math.min(stageWidth / textureWidth, stageHeight / textureHeight);
        sprite.scale.set(scale);
        sprite.position.set(
          (stageWidth - textureWidth * scale) / 2,
          (stageHeight - textureHeight * scale) / 2
        );
        break;
      }
      case 'stretch': {
        // アスペクト比を無視してステージに合わせる
        sprite.scale.set(stageWidth / textureWidth, stageHeight / textureHeight);
        sprite.position.set(0, 0);
        break;
      }
    }
  }
  
  /**
   * 背景設定を取得
   */
  getBackgroundConfig(): BackgroundConfig {
    return { ...this.backgroundConfig };
  }
  
  /**
   * 背景設定を更新
   */
  updateBackgroundConfig(config: Partial<BackgroundConfig>): void {
    this.backgroundConfig = { ...this.backgroundConfig, ...config };
    
    // 不透明度の更新
    if (config.opacity !== undefined) {
      this.backgroundLayer.alpha = config.opacity;
    }
    
    // フィットモードの更新
    if (config.fitMode && this.backgroundConfig.type !== 'color') {
      if (this.backgroundSprite) {
        this.applyBackgroundFitMode(this.backgroundSprite, config.fitMode);
      }
      if (this.backgroundVideoSprite) {
        this.applyBackgroundFitMode(this.backgroundVideoSprite, config.fitMode);
      }
    }
  }
  
  // デバッグ機能の有効/無効を切り替え
  toggleDebug(): void {
    if (this.debugManager) {
      const enabled = !this.debugManager.isEnabled();
      this.debugManager.setEnabled(enabled);
      console.log(`デバッグモード: ${enabled ? '有効' : '無効'}`);
    }
  }
  
  // デバッグ機能の有効/無効を設定
  setDebugEnabled(enabled: boolean): void {
    if (this.debugManager) {
      this.debugManager.setEnabled(enabled);
      console.log(`デバッグモード: ${enabled ? '有効' : '無効'}`);
    }
  }
  
  /**
   * ステージのアスペクト比と向きを変更
   */
  resizeStage(aspectRatio: AspectRatio, orientation: Orientation): void {
    const { width, height, scale } = calculateStageSize(aspectRatio, orientation);
    
    // ステージ設定を更新
    this.stageConfig = {
      aspectRatio,
      orientation,
      baseWidth: width,
      baseHeight: height
    };
    
    // PIXIアプリケーションをリサイズ
    if (this.app && this.app.renderer) {
      this.app.renderer.resize(width, height);
      
      // CSSスケーリングを再適用
      this.applyCSSScaling();
      
      // インスタンスを再配置
      this.arrangeCharsOnStage();
      if (this.instanceManager) {
        this.instanceManager.loadPhrases(this.phrases, this.charPositions);
        this.instanceManager.update(this.currentTime);
      }
      
      // 背景のフィットモードを再適用
      if (this.backgroundConfig.type !== 'color' && this.backgroundConfig.fitMode) {
        if (this.backgroundSprite) {
          this.applyBackgroundFitMode(this.backgroundSprite, this.backgroundConfig.fitMode);
        }
        if (this.backgroundVideoSprite) {
          this.applyBackgroundFitMode(this.backgroundVideoSprite, this.backgroundConfig.fitMode);
        }
      }
      
      console.log(`Engine: ステージをリサイズしました - ${aspectRatio} (${orientation}) - ${width}x${height}`);
    }
  }
  
  /**
   * CSSスケーリングを適用してコンテナ内に中央配置
   */
  private applyCSSScaling(): void {
    const canvas = this.app.view as HTMLCanvasElement;
    const { scale } = calculateStageSize(this.stageConfig.aspectRatio, this.stageConfig.orientation);
    
    // CSSでスケーリングと中央配置
    canvas.style.width = `${this.stageConfig.baseWidth * scale}px`;
    canvas.style.height = `${this.stageConfig.baseHeight * scale}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
  }
  
  /**
   * アクティブ化されたオブジェクトのパラメータを保持
   */
  private preserveActivatedObjectParams(): Map<string, Record<string, any>> {
    const preserved = new Map<string, Record<string, any>>();
    const activatedObjects = this.parameterManager.getActivatedObjects();
    
    activatedObjects.forEach(objectId => {
      const params = this.parameterManager.getObjectParams(objectId);
      if (params && Object.keys(params).length > 0) {
        // 深いコピーを作成して保持
        preserved.set(objectId, JSON.parse(JSON.stringify(params)));
      }
    });
    
    console.log(`Engine: ${preserved.size}個のアクティブ化されたオブジェクトのパラメータを保持`);
    return preserved;
  }
  
  /**
   * アクティブ化されたオブジェクトのパラメータを復元
   */
  private restoreActivatedObjectParams(preserved: Map<string, Record<string, any>>): void {
    preserved.forEach((params, objectId) => {
      // パラメータを復元
      this.parameterManager.updateObjectParams(objectId, params);
      
      // インスタンスも更新
      this.updateObjectInstance(objectId);
    });
    
    console.log(`Engine: ${preserved.size}個のアクティブ化されたオブジェクトのパラメータを復元`);
  }
  
  /**
   * 現在のステージ設定を取得
   */
  getStageConfig(): StageConfig {
    return { ...this.stageConfig };
  }
  
  // =============================================================================
  // セーブ・ロード機能関連のアクセサメソッド
  // =============================================================================
  
  /**
   * ProjectStateManagerを取得
   */
  getStateManager(): ProjectStateManager {
    return this.projectStateManager;
  }
  
  /**
   * TemplateManagerを取得
   */
  getTemplateManager(): TemplateManager {
    return this.templateManager;
  }
  
  /**
   * ParameterManagerを取得
   */
  getParameterManager(): ParameterManager {
    return this.parameterManager;
  }
  
  // デバッグ機能の有効/無効状態を取得
  isDebugEnabled(): boolean {
    return this.debugManager?.isEnabled() || false;
  }
  
  /**
   * 手動で再計算を実行（パラメータ値を変更せずに位置計算やランダムオフセットを再実行）
   */
  manualRecalculate(): void {
    try {
      console.log('Engine: 手動再計算を開始');
      
      // 状態保存（Undo用）
      this.projectStateManager.updateCurrentState({
        lyricsData: JSON.parse(JSON.stringify(this.phrases)),
        currentTime: this.currentTime,
        templateAssignments: this.templateManager.exportAssignments(),
        globalParams: this.parameterManager.getGlobalParams(),
        objectParams: this.parameterManager.exportParameters().objects || {},
        defaultTemplateId: this.templateManager.getDefaultTemplateId()
      });
      this.projectStateManager.saveBeforeLyricsChange('手動再計算');
      
      // 文字位置情報をクリア
      this.charPositions.clear();
      
      // 文字配置を再計算
      this.arrangeCharsOnStage();
      
      // インスタンスマネージャーでフレーズを再読み込み
      this.instanceManager.loadPhrases(this.phrases, this.charPositions);
      
      // 現在のテンプレートとパラメータで再初期化
      this.instanceManager.updateTemplate(this.template, this.parameterManager.getGlobalParams());
      
      // 現在の時刻で再描画
      this.instanceManager.update(this.currentTime);
      
      // タイムライン更新イベントを発火
      this.dispatchTimelineUpdatedEvent();
      
      console.log('Engine: 手動再計算が完了しました');
    } catch (error) {
      console.error('Engine: 手動再計算エラー:', error);
    }
  }
  
  // デバッグマネージャーを取得
  getDebugManager(): DebugManager {
    return this.debugManager;
  }
  
  // メインコンテナを取得するメソッド（動画出力用）
  getMainContainer(): PIXI.Container {
    return this.instanceManager.getMainContainer();
  }

  /**
   * メインレンダラーから直接フレームをキャプチャ
   * プレビューと同じ表示内容で動画出力が可能
   */
  captureFrame(outputWidth?: number, outputHeight?: number, includeDebugVisuals: boolean = false): Uint8Array {
    try {
      console.log(`Capturing frame from main renderer (${outputWidth || this.app.renderer.width}x${outputHeight || this.app.renderer.height})`);
      
      // 現在のレンダラーのサイズ
      const currentWidth = this.app.renderer.width;
      const currentHeight = this.app.renderer.height;
      
      // デバッグビジュアルの一時的な制御
      const originalGridVisible = this.gridOverlay?.isVisible() || false;
      const originalDebugEnabled = this.debugManager?.isEnabled() || false;
      
      if (!includeDebugVisuals) {
        if (this.gridOverlay) {
          this.gridOverlay.hide();
        }
        if (this.debugManager) {
          this.debugManager.setEnabled(false);
        }
      }
      
      let pixels: Uint8Array;
      
      if (outputWidth && outputHeight && (outputWidth !== currentWidth || outputHeight !== currentHeight)) {
        // 異なるサイズで出力する場合はRenderTextureを使用
        const renderTexture = PIXI.RenderTexture.create({
          width: outputWidth,
          height: outputHeight,
          resolution: 1
        });
        
        // 一時的にレンダラーのサイズを変更
        this.app.renderer.resize(outputWidth, outputHeight);
        
        // メインステージをレンダーテクスチャに描画
        this.app.renderer.render(this.app.stage, { renderTexture });
        
        // ピクセルデータを取得
        pixels = this.app.renderer.extract.pixels(renderTexture);
        
        // レンダーテクスチャをクリーンアップ
        renderTexture.destroy();
        
        // レンダラーのサイズを元に戻す
        this.app.renderer.resize(currentWidth, currentHeight);
        
        console.log(`Frame captured with scaling: ${currentWidth}x${currentHeight} -> ${outputWidth}x${outputHeight}`);
      } else {
        // 現在のサイズのままキャプチャ
        pixels = this.app.renderer.extract.pixels();
        console.log(`Frame captured at current size: ${currentWidth}x${currentHeight}`);
      }
      
      // デバッグビジュアルの設定を復元
      if (!includeDebugVisuals) {
        if (this.gridOverlay && originalGridVisible) {
          this.gridOverlay.show();
        }
        if (this.debugManager && originalDebugEnabled) {
          this.debugManager.setEnabled(true);
        }
      }
      
      console.log(`Captured frame: ${pixels.length} bytes`);
      return pixels;
      
    } catch (error) {
      console.error('Frame capture error:', error);
      throw new Error(`Failed to capture frame: ${error.message}`);
    }
  }

  /**
   * オフスクリーンフレームキャプチャ（シークアンドスナップ方式用）
   * 画面表示に依存しない独立したフレーム取得
   */
  captureOffscreenFrame(outputWidth: number, outputHeight: number, includeDebugVisuals: boolean = false): Uint8Array {
    try {
      console.log(`Engine: Capturing offscreen frame (${outputWidth}x${outputHeight})`);
      
      // デバッグビジュアルの一時的な制御
      const originalGridVisible = this.gridOverlay?.isVisible() || false;
      const originalDebugEnabled = this.debugManager?.isEnabled() || false;
      
      if (!includeDebugVisuals) {
        if (this.gridOverlay) {
          this.gridOverlay.hide();
        }
        if (this.debugManager) {
          this.debugManager.setEnabled(false);
        }
      }
      
      // オフスクリーン用のRenderTextureを作成
      const renderTexture = PIXI.RenderTexture.create({
        width: outputWidth,
        height: outputHeight,
        resolution: 1
      });
      
      // メインステージをオフスクリーンテクスチャに描画
      this.app.renderer.render(this.app.stage, { renderTexture });
      
      // ピクセルデータを取得
      const pixels = this.app.renderer.extract.pixels(renderTexture);
      
      // オフスクリーンテクスチャをクリーンアップ
      renderTexture.destroy();
      
      // デバッグビジュアルの設定を復元
      if (!includeDebugVisuals) {
        if (this.gridOverlay && originalGridVisible) {
          this.gridOverlay.show();
        }
        if (this.debugManager && originalDebugEnabled) {
          this.debugManager.setEnabled(true);
        }
      }
      
      console.log(`Engine: Offscreen frame captured: ${pixels.length} bytes`);
      return pixels;
      
    } catch (error) {
      console.error('Engine: Offscreen frame capture error:', error);
      throw new Error(`Failed to capture offscreen frame: ${error.message}`);
    }
  }

  /**
   * 背景動画へのアクセスを提供
   */
  getBackgroundVideo(): HTMLVideoElement | null {
    return this.backgroundVideo || null;
  }
  
  /**
   * 動画出力用の時間設定とレンダリング（背景動画除く）
   */
  setTimeForVideoCapture(timeMs: number): void {
    try {
      // 時間を設定
      this.setCurrentTime(timeMs);
      
      // 背景動画の時刻同期は VideoExporter 側で処理するためスキップ
      // NOTE: ここでの背景動画操作は重複処理を避けるため削除
      
      // 強制的にレンダリングを実行
      this.app.render();
      
      // アニメーションの更新を確実に実行
      if (this.instanceManager) {
        this.instanceManager.update(timeMs);
      }
      
    } catch (error) {
      console.error('Error setting time for video capture:', error);
      throw error;
    }
  }
  
  // デバッグ情報の更新（特にコンテナの座標情報）
  private updateDebugInfo(): void {
    try {
      // デバッグ機能が無効、またはインスタンスマネージャーがない場合は何もしない
      if (!this.instanceManager || !this.debugManager || !this.debugManager.isEnabled()) return;
      
      // アクティブなコンテナの情報を取得
      const activeInstances = this.instanceManager.getActiveInstances();
      
      // フレーズ、単語、文字レベルの各コンテナを検索
      let phraseContainer = null;
      let wordContainer = null;
      let charContainer = null;
      
      // IDでソートして先頭のものを使用（表示中のものを優先）
      const sortedIds = Array.from(activeInstances).sort();
      
      for (const id of sortedIds) {
        const instance = this.instanceManager.getInstance(id);
        if (!instance || !instance.container) continue;
        
        // コンテナの階層タイプによって格納
        if (instance.hierarchyType === 'phrase' && !phraseContainer) {
          phraseContainer = instance.container;
        } else if (instance.hierarchyType === 'word' && !wordContainer) {
          wordContainer = instance.container;
        } else if (instance.hierarchyType === 'char' && !charContainer) {
          charContainer = instance.container;
        }
        
        // 全レベルのコンテナが見つかったら終了
        if (phraseContainer && wordContainer && charContainer) break;
      }
      
      // デバッグマネージャーに情報を更新
      this.debugManager.updateFromEngine(
        phraseContainer,
        wordContainer,
        charContainer,
        this.app
      );
      
      // 定期的なデバッグログ出力（1秒に1回）
      if (this.currentTime % 1000 < 16) {
        // コンテナ階層構造を出力（サンプル的に単語コンテナのもの）
        if (wordContainer && this.currentTime % 5000 < 16) { // 5秒に1回
          this.debugManager.dumpContainerHierarchy(wordContainer);
        }
      }
    } catch (error) {
      console.error('デバッグ情報更新エラー:', error);
    }
  }
  
  // 現在位置のフレーズ詳細情報を取得するメソッド（デバッグ用）
  getCurrentPhraseInfo(): any {
    if (!this.debugManager?.isEnabled()) {
      return null;
    }
    
    try {
      // 現在時刻に表示されているフレーズを特定
      const currentPhrase = this.phrases.find(phrase => 
        this.currentTime >= phrase.start && this.currentTime <= phrase.end
      );
      
      if (!currentPhrase) {
        return null;
      }
      
      // フレーズで使用されているテンプレートを取得
      const templateId = this.getCurrentTemplateId(currentPhrase.id);
      const template = this.templateManager.getTemplateById(templateId);
      const templateConfig = this.templateManager.getAllTemplates().find(t => t.id === templateId);
      
      // 有効パラメータを取得
      const effectiveParams = this.parameterManager.getEffectiveParams(currentPhrase.id, templateId);
      
      // コンテナ情報を取得
      const containers = this.getCurrentPhraseContainers(currentPhrase.id);
      
      // フレーズ内の文字カウント情報を取得
      const charCounts = this.getCurrentPhraseCharCounts(currentPhrase);
      
      return {
        phraseId: currentPhrase.id,
        phraseText: currentPhrase.phrase,
        templateId: templateId,
        templateName: templateConfig?.config.name || templateId,
        containers: containers,
        parameters: {
          letterSpacing: effectiveParams.letterSpacing,
          fontSize: effectiveParams.fontSize,
          ...effectiveParams
        },
        charCounts: charCounts,
        timing: {
          start: currentPhrase.start,
          end: currentPhrase.end,
          current: this.currentTime
        }
      };
    } catch (error) {
      console.error('getCurrentPhraseInfo エラー:', error);
      return null;
    }
  }
  
  // 現在のフレーズのコンテナ情報を取得
  private getCurrentPhraseContainers(phraseId: string): any {
    if (!this.instanceManager) return null;
    
    try {
      // フレーズインスタンスを取得
      const phraseInstance = this.instanceManager.getInstance(phraseId);
      let containers: any = {};
      
      if (phraseInstance?.container) {
        phraseInstance.container.updateTransform();
        const phraseGlobal = phraseInstance.container.getGlobalPosition();
        const phraseLocal = phraseInstance.container.position;
        
        containers.phrase = {
          global: { x: phraseGlobal.x, y: phraseGlobal.y },
          local: { x: phraseLocal.x, y: phraseLocal.y }
        };
      }
      
      // フレーズ内の最初の単語のコンテナを取得
      const targetPhrase = this.phrases.find(p => p.id === phraseId);
      if (targetPhrase && targetPhrase.words.length > 0) {
        const firstWord = targetPhrase.words[0];
        const wordInstance = this.instanceManager.getInstance(firstWord.id);
        
        if (wordInstance?.container) {
          wordInstance.container.updateTransform();
          const wordGlobal = wordInstance.container.getGlobalPosition();
          const wordLocal = wordInstance.container.position;
          
          containers.word = {
            global: { x: wordGlobal.x, y: wordGlobal.y },
            local: { x: wordLocal.x, y: wordLocal.y }
          };
          
          // 最初の文字のコンテナも取得
          if (firstWord.chars.length > 0) {
            const firstChar = firstWord.chars[0];
            const charInstance = this.instanceManager.getInstance(firstChar.id);
            
            if (charInstance?.container) {
              charInstance.container.updateTransform();
              const charGlobal = charInstance.container.getGlobalPosition();
              const charLocal = charInstance.container.position;
              
              containers.char = {
                global: { x: charGlobal.x, y: charGlobal.y },
                local: { x: charLocal.x, y: charLocal.y }
              };
            }
          }
        }
      }
      
      return containers;
    } catch (error) {
      console.error('getCurrentPhraseContainers エラー:', error);
      return null;
    }
  }
  
  // 現在のフレーズの文字カウント情報を取得（コンテナ位置情報含む）
  private getCurrentPhraseCharCounts(phrase: PhraseUnit): any[] {
    try {
      const charCounts: any[] = [];
      let phraseCharIndex = 0;
      
      phrase.words.forEach((word, wordIndex) => {
        word.chars.forEach((char, charIndex) => {
          // 文字コンテナの位置情報を取得
          let containerPosition = null;
          if (this.instanceManager) {
            const charInstance = this.instanceManager.getInstance(char.id);
            if (charInstance?.container) {
              try {
                charInstance.container.updateTransform();
                const globalPos = charInstance.container.getGlobalPosition();
                const localPos = charInstance.container.position;
                
                containerPosition = {
                  global: { x: globalPos.x, y: globalPos.y },
                  local: { x: localPos.x, y: localPos.y }
                };
              } catch (error) {
                console.warn(`文字コンテナ位置取得エラー (${char.id}):`, error);
              }
            }
          }
          
          charCounts.push({
            id: char.id,
            char: char.char,
            phraseIndex: phraseCharIndex,
            totalInPhrase: phrase.words.reduce((sum, w) => sum + w.chars.length, 0),
            wordIndex: charIndex,
            totalInWord: word.chars.length,
            wordId: word.id,
            containerPosition: containerPosition, // コンテナ位置情報を追加
            timing: {
              start: char.start,
              end: char.end
            }
          });
          phraseCharIndex++;
        });
      });
      
      return charCounts;
    } catch (error) {
      console.error('getCurrentPhraseCharCounts エラー:', error);
      return [];
    }
  }
  
  // 自動保存機能のセットアップ
  private setupAutoSave(): void {
    // ページ可視性の変化を検知
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.autoSaveEnabled) {
        this.autoSaveToLocalStorage();
      }
    });
    
    // ウィンドウのフォーカスが外れたとき
    window.addEventListener('blur', () => {
      if (this.autoSaveEnabled) {
        this.autoSaveToLocalStorage();
      }
    });
    
    // ページがアンロードされる前
    window.addEventListener('beforeunload', () => {
      if (this.autoSaveEnabled) {
        this.autoSaveToLocalStorage();
      }
    });
    
    // 定期的な自動保存タイマーを開始
    this.startAutoSaveTimer();
  }
  
  // 定期的な自動保存タイマー
  private startAutoSaveTimer(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = window.setInterval(() => {
      if (this.autoSaveEnabled && this.phrases && this.phrases.length > 0) {
        const now = Date.now();
        // 最後の保存から10秒以上経過している場合のみ保存
        if (now - this.lastAutoSaveTime > 10000) {
          this.autoSaveToLocalStorage();
        }
      }
    }, Engine.AUTO_SAVE_INTERVAL);
  }
  
  // Electronアプリデータへの自動保存
  private async autoSaveToLocalStorage(): Promise<void> {
    try {
      const state = this.projectStateManager.exportFullState();
      
      // 既存の自動保存データを読み込んで、recentFilesを保持
      const existingData = await persistenceService.loadAutoSave();
      
      // 現在使用中の音楽・動画ファイルのパスを取得
      let audioFilePath: string | undefined;
      let backgroundVideoFilePath: string | undefined;
      
      try {
        // ElectronMediaManagerから現在のファイルパスを取得
        const electronMediaManager = await import('../services/ElectronMediaManager');
        const currentAudioURL = electronMediaManager.electronMediaManager.getCurrentAudioFileURL();
        const currentVideoURL = electronMediaManager.electronMediaManager.getCurrentVideoFileURL();
        
        // file:// URLからファイルパスを抽出
        if (currentAudioURL && currentAudioURL.startsWith('file://')) {
          audioFilePath = decodeURIComponent(currentAudioURL.replace('file://', ''));
        }
        if (currentVideoURL && currentVideoURL.startsWith('file://')) {
          backgroundVideoFilePath = decodeURIComponent(currentVideoURL.replace('file://', ''));
        }
      } catch (error) {
        console.warn('Engine: ファイルパス取得に失敗:', error);
      }

      const autoSaveData = {
        projectState: state,
        engineState: {
          phrases: this.phrases,
          audioInfo: {
            fileName: this.audioFileName,
            duration: this.audioDuration,
            url: this.audioURL,
            filePath: audioFilePath  // ファイルパスを追加
          },
          backgroundVideoInfo: {
            fileName: this.backgroundVideoFileName,
            filePath: backgroundVideoFilePath  // ファイルパスを追加
          },
          stageConfig: this.stageConfig,
          selectedTemplate: this.templateManager.getDefaultTemplateId(),
          templateParams: this.parameterManager.getGlobalParams(),
          backgroundConfig: this.backgroundConfig
        },
        // 既存のrecentFilesデータを保持
        recentFiles: existingData?.recentFiles || { audioFiles: [], backgroundVideoFiles: [] }
      };
      
      console.log('Engine: ===== 自動保存データ詳細ログ =====');
      console.log('Engine: 音楽ファイル名:', this.audioFileName);
      console.log('Engine: 背景動画ファイル名:', this.backgroundVideoFileName);
      console.log('Engine: audioInfo:', autoSaveData.engineState.audioInfo);
      console.log('Engine: backgroundVideoInfo:', autoSaveData.engineState.backgroundVideoInfo);
      console.log('Engine: backgroundConfig:', autoSaveData.engineState.backgroundConfig);
      console.log('Engine: recentFiles保持状況:', {
        hasRecentFiles: !!autoSaveData.recentFiles,
        audioFilesCount: autoSaveData.recentFiles?.audioFiles?.length || 0,
        backgroundVideoFilesCount: autoSaveData.recentFiles?.backgroundVideoFiles?.length || 0,
        audioFiles: autoSaveData.recentFiles?.audioFiles || [],
        backgroundVideoFiles: autoSaveData.recentFiles?.backgroundVideoFiles || []
      });
      
      const success = await persistenceService.saveAutoSave(autoSaveData);
      if (success) {
        this.lastAutoSaveTime = Date.now();
        console.log('Engine: 自動保存が完了しました');
      } else {
        console.error('Engine: 自動保存に失敗しました（saveAutoSaveがfalseを返しました）');
      }
    } catch (error) {
      console.error('Engine: 自動保存に失敗しました:', error);
    }
  }
  
  // Electronアプリデータからの復元
  public async loadFromLocalStorage(): Promise<boolean> {
    try {
      const autoSaveData = await persistenceService.loadAutoSave();
      if (!autoSaveData) {
        console.log('Engine: 自動保存データが見つかりません');
        return false;
      }
      
      console.log('Engine: ===== 自動保存データの詳細ログ =====');
      console.log('Engine: autoSaveData全体:', JSON.stringify(autoSaveData, null, 2));
      
      // データの有効期限チェック
      if (Date.now() - autoSaveData.timestamp > Engine.AUTO_SAVE_EXPIRY) {
        console.log('Engine: 自動保存データの有効期限切れ');
        await persistenceService.deleteAutoSave();
        return false;
      }
      
      // Electron形式のデータ構造のみサポート
      if (!autoSaveData.engineState || !autoSaveData.projectState) {
        console.error('Engine: 無効な自動保存データ形式');
        console.error('Engine: engineState:', autoSaveData.engineState);
        console.error('Engine: projectState:', autoSaveData.projectState);
        return false;
      }
      
      const engineState = autoSaveData.engineState;
      const projectState = autoSaveData.projectState;
      
      console.log('Engine: engineState.audioInfo:', engineState.audioInfo);
      console.log('Engine: engineState.backgroundVideoInfo:', engineState.backgroundVideoInfo);
      console.log('Engine: engineState.backgroundConfig:', engineState.backgroundConfig);
      
      // 復元処理開始マーカー
      console.log('Engine: ===== 復元処理開始 =====');
      
      // ステージ設定の復元（既に初期化時に適用済みの場合はスキップ）
      if (engineState.stageConfig) {
        const needsResize = (
          this.stageConfig.aspectRatio !== engineState.stageConfig.aspectRatio ||
          this.stageConfig.orientation !== engineState.stageConfig.orientation
        );
        
        if (needsResize) {
          console.log('Engine: ステージ設定が変更されているためリサイズを実行');
          this.stageConfig = engineState.stageConfig;
          this.resizeStage(this.stageConfig.aspectRatio, this.stageConfig.orientation);
        } else {
          console.log('Engine: ステージ設定は既に正しく適用されているためリサイズをスキップ');
          this.stageConfig = engineState.stageConfig;
        }
      }
      
      // 背景設定の復元
      if (engineState.backgroundConfig) {
        this.updateBackgroundConfig(engineState.backgroundConfig);
        console.log(`Engine: 背景設定を復元: ${JSON.stringify(engineState.backgroundConfig)}`);
      }
      
      // 音楽ファイル情報の復元と自動読み込み
      console.log('Engine: 音楽ファイル復元チェック開始');
      console.log('Engine: engineState.audioInfo:', engineState.audioInfo);
      console.log('Engine: engineState.audioInfo?.fileName:', engineState.audioInfo?.fileName);
      console.log('Engine: 条件チェック結果:', !!(engineState.audioInfo && engineState.audioInfo.fileName));
      
      if (engineState.audioInfo && engineState.audioInfo.fileName) {
        console.log('Engine: 音楽ファイル復元条件を満たしています');
        this.audioFileName = engineState.audioInfo.fileName;
        this.audioDuration = engineState.audioInfo.duration || 10000;
        this.audioURL = engineState.audioInfo.url;
        console.log(`Engine: 音楽ファイル情報を復元: ${this.audioFileName}`);
        
        // 音楽ファイルの自動読み込みを試行（古いイベント方式を廃止）
        // this.requestAudioFileRestore(engineState.audioInfo.fileName);
        console.log('Engine: 音楽ファイル復元は silentAutoRestore で直接実行されます');
      } else {
        console.log('Engine: 音楽ファイル復元条件を満たしていません');
        console.log('Engine: 音楽ファイル情報なし - audioInfo:', engineState.audioInfo);
      }
      
      // 背景動画ファイル情報の復元と自動読み込み
      console.log('Engine: 背景動画復元チェック開始');
      console.log('Engine: engineState.backgroundVideoInfo:', engineState.backgroundVideoInfo);
      console.log('Engine: engineState.backgroundVideoInfo?.fileName:', engineState.backgroundVideoInfo?.fileName);
      console.log('Engine: 条件チェック結果:', !!(engineState.backgroundVideoInfo && engineState.backgroundVideoInfo.fileName));
      
      if (engineState.backgroundVideoInfo && engineState.backgroundVideoInfo.fileName) {
        console.log('Engine: 背景動画復元条件を満たしています');
        this.backgroundVideoFileName = engineState.backgroundVideoInfo.fileName;
        console.log(`Engine: 背景動画ファイル情報を復元: ${this.backgroundVideoFileName}`);
        
        // 背景動画ファイルの自動読み込みを試行（古いイベント方式を廃止）
        // this.requestBackgroundVideoRestore(engineState.backgroundVideoInfo.fileName);
        console.log('Engine: 背景動画復元は silentAutoRestore で直接実行されます');
      } else {
        console.log('Engine: 背景動画復元条件を満たしていません');
        console.log('Engine: 背景動画ファイル情報なし - backgroundVideoInfo:', engineState.backgroundVideoInfo);
      }
      
      // プロジェクト状態の復元
      if (projectState) {
        this.projectStateManager.importState(projectState);
        
        // パラメータの復元（アクティベーション情報を含む）
        this.parameterManager.importParameters({
          global: projectState.globalParams,
          objects: projectState.objectParams,
          activatedObjects: projectState.activatedObjects
        });
        
        // テンプレート割り当ての復元
        if (projectState.templateAssignments) {
          this.templateManager.importAssignments(projectState.templateAssignments);
        }
      }
      
      // 歌詞データの復元
      if (engineState.phrases && engineState.phrases.length > 0) {
        this.loadLyrics(engineState.phrases);
      }
      
      console.log('Engine: 自動保存データから復元しました');
      return true;
    } catch (error) {
      console.error('Engine: 自動保存データの復元に失敗しました:', error);
      return false;
    }
  }
  
  // 自動復元（ダイアログなし）
  private async silentAutoRestore(): Promise<void> {
    try {
      console.log('Engine: 自動復元開始（ダイアログなし）');
      const hasAutoSave = await persistenceService.hasAutoSave();
      console.log(`Engine: 自動保存データの存在: ${hasAutoSave}`);
      
      if (!hasAutoSave) {
        console.log('Engine: 自動保存データなし、復元処理をスキップ');
        return;
      }
      
      const autoSaveData = await persistenceService.loadAutoSave();
      if (!autoSaveData) {
        console.log('Engine: 自動保存データの読み込み失敗');
        return;
      }
      
      const timeAgo = Date.now() - autoSaveData.timestamp;
      console.log(`Engine: 自動保存データの経過時間: ${timeAgo}ms, 有効期限: ${Engine.AUTO_SAVE_EXPIRY}ms`);
      
      // 24時間以内のデータの場合、自動的に復元
      if (timeAgo < Engine.AUTO_SAVE_EXPIRY) {
        console.log('Engine: 自動保存データは有効期限内、自動復元を実行');
        
        if (!autoSaveData.engineState) {
          console.error('Engine: 無効な自動保存データ形式');
          return;
        }
        
        const hasLyrics = !!(autoSaveData.engineState.phrases && autoSaveData.engineState.phrases.length > 0);
        const hasAudio = !!autoSaveData.engineState.audioInfo?.fileName;
        const hasBackgroundVideo = !!autoSaveData.engineState.backgroundVideoInfo?.fileName;
        
        console.log(`Engine: 復元するデータ - 歌詞: ${hasLyrics}, 音楽: ${hasAudio}, 背景動画: ${hasBackgroundVideo}`);
        
        // loadFromLocalStorageを呼び出して実際の復元を実行
        const restored = await this.loadFromLocalStorage();
        
        if (restored) {
          console.log('Engine: 自動復元が完了しました');
          
          // 音楽・背景動画ファイルの復元処理も改善版に変更
          if (hasAudio && autoSaveData.engineState.audioInfo) {
            const audioInfo = autoSaveData.engineState.audioInfo;
            await this.requestAudioFileRestoreWithPath(audioInfo.fileName, audioInfo.filePath);
          }
          
          if (hasBackgroundVideo && autoSaveData.engineState.backgroundVideoInfo) {
            const videoInfo = autoSaveData.engineState.backgroundVideoInfo;
            await this.requestBackgroundVideoRestoreWithPath(videoInfo.fileName, videoInfo.filePath);
          }
        } else {
          console.log('Engine: 自動復元に失敗しました');
        }
      } else {
        console.log('Engine: 自動保存データは有効期限切れ、削除します');
        await persistenceService.deleteAutoSave();
      }
    } catch (error) {
      console.error('Engine: 自動復元に失敗しました:', error);
    }
  }
  
  // 自動保存データをクリア（正式保存後などに使用）
  public async clearAutoSave(): Promise<void> {
    try {
      await persistenceService.deleteAutoSave();
      console.log('Engine: 自動保存データをクリアしました');
    } catch (error) {
      console.error('Engine: 自動保存データのクリアに失敗しました:', error);
    }
  }
  
  // 自動保存の有効/無効切り替え
  public setAutoSaveEnabled(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
    if (!enabled && this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    } else if (enabled && !this.autoSaveTimer) {
      this.startAutoSaveTimer();
    }
  }

  // 自動保存データから非同期でステージ設定を取得して適用
  private async initializeStageConfigFromAutoSave(): Promise<void> {
    try {
      const autoSaveData = await persistenceService.loadAutoSave();
      if (autoSaveData?.engineState?.stageConfig) {
        const autoSaveStageConfig = autoSaveData.engineState.stageConfig;
        
        // 現在の設定と異なる場合のみリサイズを実行
        const needsResize = (
          this.stageConfig.aspectRatio !== autoSaveStageConfig.aspectRatio ||
          this.stageConfig.orientation !== autoSaveStageConfig.orientation
        );
        
        if (needsResize) {
          console.log('Engine: 自動保存のステージ設定を適用:', autoSaveStageConfig);
          this.stageConfig = autoSaveStageConfig;
          this.resizeStage(this.stageConfig.aspectRatio, this.stageConfig.orientation);
        } else {
          console.log('Engine: ステージ設定は既に正しく設定されています');
        }
      } else {
        console.log('Engine: 自動保存にステージ設定がないためデフォルト設定を維持');
      }
    } catch (error) {
      console.log('Engine: 自動保存からのステージ設定取得に失敗:', error);
    }
  }

  // 音楽ファイルの復元要求
  private requestAudioFileRestore(fileName: string): void {
    // UIコンポーネントに音楽ファイル復元イベントを発行
    window.dispatchEvent(new CustomEvent('visiblyrics:restore-audio-file', {
      detail: { fileName }
    }));
    console.log(`Engine: 音楽ファイル復元要求を発行: ${fileName}`);
  }
  
  // 音楽ファイルの復元要求（パス付き） - 改善版
  private async requestAudioFileRestoreWithPath(fileName: string, filePath?: string): Promise<void> {
    try {
      console.log(`Engine: 音楽ファイル復元要求（パス付き）: ${fileName}`, { filePath });
      
      // ElectronMediaManagerを直接呼び出して復元
      const electronMediaManager = await import('../services/ElectronMediaManager');
      const result = await electronMediaManager.electronMediaManager.restoreAudioFile(fileName, filePath);
      
      if (result) {
        console.log(`Engine: 音楽ファイル復元成功: ${result.fileName}`);
        // HTMLAudioElementをHowlerで再読み込み
        this.loadAudioElement(result.audio, result.fileName);
        
        // UI側に音楽ファイル復元完了を通知
        setTimeout(async () => {
          const actualFileURL = electronMediaManager.electronMediaManager.getCurrentAudioFileURL();
          const audioLoadEvent = new CustomEvent('music-file-loaded', {
            detail: { 
              url: actualFileURL || 'electron://loaded',
              fileName: result.fileName,
              timestamp: Date.now(),
              isRestored: true  // 復元されたファイルであることを示すフラグ
            }
          });
          window.dispatchEvent(audioLoadEvent);
          console.log(`Engine: 音楽ファイル復元完了イベントを発火: ${result.fileName}`);
        }, 100);
      } else {
        console.log(`Engine: 音楽ファイル復元をスキップ: ${fileName}`);
      }
    } catch (error) {
      console.error(`Engine: 音楽ファイル復元に失敗: ${fileName}`, error);
    }
  }
  
  private requestBackgroundVideoRestore(fileName: string): void {
    // UIコンポーネントに背景動画復元イベントを発行
    window.dispatchEvent(new CustomEvent('visiblyrics:restore-background-video', {
      detail: { fileName }
    }));
    console.log(`Engine: 背景動画復元要求を発行: ${fileName}`);
  }
  
  // 背景動画の復元要求（パス付き） - 改善版
  private async requestBackgroundVideoRestoreWithPath(fileName: string, filePath?: string): Promise<void> {
    try {
      console.log(`Engine: 背景動画復元要求（パス付き）: ${fileName}`, { filePath });
      
      // ElectronMediaManagerを直接呼び出して復元
      const electronMediaManager = await import('../services/ElectronMediaManager');
      const result = await electronMediaManager.electronMediaManager.restoreBackgroundVideo(fileName, filePath);
      
      if (result) {
        console.log(`Engine: 背景動画復元成功: ${result.fileName}`);
        // 背景動画として設定（Electron用メソッド）
        this.setBackgroundVideoElement(result.video, 'cover', result.fileName);
      } else {
        console.log(`Engine: 背景動画復元をスキップ: ${fileName}`);
      }
    } catch (error) {
      console.error(`Engine: 背景動画復元に失敗: ${fileName}`, error);
    }
  }
  
  /**
   * カスタムイベントを window に dispatch
   */
  private dispatchCustomEvent(eventType: string, detail?: any): void {
    const event = new CustomEvent(eventType, { 
      detail: detail,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);
    console.log(`Engine: カスタムイベント発火: ${eventType}`, detail);
  }
  
  /**
   * タイムライン更新イベントを dispatch
   */
  public dispatchTimelineUpdatedEvent(): void {
    const timelineData = {
      currentTime: this.currentTime,
      duration: this.audioDuration,
      phrases: this.phrases,
      timestamp: Date.now()
    };
    this.dispatchCustomEvent('timeline-updated', timelineData);
  }
  
}

export default Engine;