import * as PIXI from 'pixi.js';
import { DebugInfo, TimingDebugInfo, DebugSettings, HierarchyType, AnimationPhase, DebugEventType } from './types';

/**
 * デバッグ機能を管理するクラス
 * エンジンや各テンプレートからデバッグ情報を集約し、ユーザーインターフェースに提供します
 */
export class DebugManager {
  // デバッグ情報
  private debugInfo: DebugInfo = {};
  private timingInfo: TimingDebugInfo = {
    currentTime: 0,
    activePhrase: [],
    activeWord: [],
    activeChar: []
  };

  // デバッグ設定
  private settings: DebugSettings = {
    enabled: false,
    showHierarchy: true,
    showContainerBounds: true,
    showCoordinates: true,
    showTimingInfo: true,
    logToConsole: true,
    dispatchEvents: true,
    showGrid: false
  };

  // PIXIアプリケーション参照
  private app?: PIXI.Application;

  // スロットリング用のタイマー
  private eventTimers: Record<string, number> = {};

  /**
   * コンストラクタ
   */
  constructor(app?: PIXI.Application, initialSettings?: Partial<DebugSettings>) {
    this.app = app;
    
    // 初期設定をマージ
    if (initialSettings) {
      this.settings = { ...this.settings, ...initialSettings };
    }
    
    // グローバルアクセス用（テンプレートやエンジンからアクセスできるように）
    (window as any).__DEBUG_MANAGER__ = this;
    
    console.log('DebugManager initialized:', this.settings);
  }

  /**
   * PIXIアプリケーションを設定する
   * @param app PIXIアプリケーションインスタンス
   */
  setApp(app: PIXI.Application): void {
    this.app = app;
  }

  /**
   * デバッグ設定を更新する
   * @param settings 更新する設定の一部または全部
   */
  updateSettings(settings: Partial<DebugSettings>): void {
    this.settings = { ...this.settings, ...settings };
    
    // 設定更新イベント発火
    if (this.settings.dispatchEvents) {
      this.dispatchEvent(DebugEventType.SETTINGS_UPDATED, { settings: this.settings });
    }
    
    // 設定変更をログ出力
    if (this.settings.logToConsole) {
      console.log('DebugManager settings updated:', this.settings);
    }
  }

  /**
   * 全ての設定を取得する
   */
  getSettings(): DebugSettings {
    return { ...this.settings };
  }

  /**
   * デバッグモードの有効/無効を切り替える
   * @param enabled 有効にする場合はtrue
   */
  setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    
    // 設定更新イベント発火
    if (this.settings.dispatchEvents) {
      this.dispatchEvent(DebugEventType.SETTINGS_UPDATED, { settings: this.settings });
    }
    
    // 設定変更をログ出力
    if (this.settings.logToConsole) {
      console.log(`DebugManager ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * デバッグモードが有効かどうかを取得する
   */
  isEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * 座標情報を更新する
   * @param info 更新するデバッグ情報
   */
  updateDebugInfo(info: Partial<DebugInfo>): void {
    // デバッグモードが無効なら何もしない
    if (!this.settings.enabled) return;
    
    // デバッグ情報を更新
    this.debugInfo = {
      ...this.debugInfo,
      ...info,
      lastUpdated: Date.now()
    };
    
    // コンソールへの座標情報ログを可能な限り停止（パフォーマンス向上のため）
    
    // イベント発火（スロットリングあり）
    if (this.settings.dispatchEvents && this.settings.showCoordinates) {
      this.throttledDispatch(DebugEventType.COORDINATE_UPDATED, { ...this.debugInfo }, 100);
      this.throttledDispatch(DebugEventType.ALL_INFO_UPDATED, {
        debugInfo: this.debugInfo,
        timingInfo: this.timingInfo,
        settings: this.settings
      }, 100);
    }
  }

  /**
   * タイミング情報を更新する
   * @param id オブジェクトID
   * @param text テキスト内容
   * @param nowMs 現在時刻
   * @param startMs 開始時刻
   * @param endMs 終了時刻
   * @param hierarchyType 階層タイプ
   * @param phase アニメーションフェーズ
   */
  updateTimingInfo(
    id: string,
    text: string | string[],
    nowMs: number,
    startMs: number,
    endMs: number,
    hierarchyType: HierarchyType,
    phase: AnimationPhase
  ): void {
    // デバッグモードが無効なら何もしない
    if (!this.settings.enabled || !this.settings.showTimingInfo) return;
    
    // テキスト内容の処理
    const content = Array.isArray(text) ? text.join('') : text;
    
    // 現在時間を更新
    this.timingInfo.currentTime = nowMs;
    
    // 表示状態を判定
    const isVisible = phase === 'active' || phase === 'in';
    
    // タイミング状態判定
    let state = '発声中';
    if (nowMs < startMs) {
      state = 'イン前';
    } else if (nowMs === startMs) {
      state = 'イン';
    } else if (nowMs > endMs) {
      state = 'アウト後';
    } else if (nowMs === endMs) {
      state = 'アウト';
    }
    
    // 階層に応じて情報を蓄積
    if (hierarchyType === 'phrase') {
      // フレーズ情報を更新
      this.timingInfo.activePhrase = [{
        id: id,
        inTime: startMs,
        outTime: endMs,
        isVisible: isVisible,
        state: state
      }];
      
      // コンソールログ出力を制限（ただしエラーは例外）
    } else if (hierarchyType === 'word') {
      // 単語情報を追加または更新
      const wordIndex = this.timingInfo.activeWord?.findIndex(w => w.id === id) ?? -1;
      const wordInfo = {
        id: id,
        inTime: startMs,
        outTime: endMs,
        isVisible: isVisible,
        state: state
      };
      
      if (wordIndex >= 0 && this.timingInfo.activeWord) {
        this.timingInfo.activeWord[wordIndex] = wordInfo;
      } else if (this.timingInfo.activeWord) {
        this.timingInfo.activeWord.push(wordInfo);
      } else {
        this.timingInfo.activeWord = [wordInfo];
      }
      
      // コンソールログ出力を制限（ただしエラーは例外）
    } else if (hierarchyType === 'char') {
      // 文字情報を追加または更新
      const charIndex = this.timingInfo.activeChar?.findIndex(c => c.id === id) ?? -1;
      const charInfo = {
        id: id,
        char: content,
        inTime: startMs,
        outTime: endMs,
        isVisible: isVisible,
        state: state
      };
      
      if (charIndex >= 0 && this.timingInfo.activeChar) {
        this.timingInfo.activeChar[charIndex] = charInfo;
      } else if (this.timingInfo.activeChar) {
        this.timingInfo.activeChar.push(charInfo);
      } else {
        this.timingInfo.activeChar = [charInfo];
      }
      
      // コンソールログ出力を大幅に制限
    }
    
    // イベント発火（スロットリングあり）
    if (this.settings.dispatchEvents) {
      this.throttledDispatch(DebugEventType.TIMING_UPDATED, { ...this.timingInfo }, 100);
      this.throttledDispatch(DebugEventType.ALL_INFO_UPDATED, {
        debugInfo: this.debugInfo,
        timingInfo: this.timingInfo,
        settings: this.settings
      }, 100);
    }
  }

  /**
   * 階層構造情報を出力する
   * @param container 調査対象のコンテナ
   * @param prefix ログ出力時のプレフィックス（再帰呼び出し用）
   */
  dumpContainerHierarchy(container: PIXI.Container, prefix: string = ""): void {
    // デバッグモードが無効なら何もしない
    if (!this.settings.enabled || !this.settings.showHierarchy) return;
    
    // コンソールにログ出力しない設定なら何もしない
    if (!this.settings.logToConsole) return;
    
    // 階層構造ログは完全に停止（パフォーマンス向上のため）
    return;
  }

  /**
   * エンジンからの座標情報更新
   * @param activeInstances アクティブなインスタンスの情報
   * @param app PIXIアプリケーション
   */
  updateFromEngine(
    phraseContainer: PIXI.Container | null,
    wordContainer: PIXI.Container | null,
    charContainer: PIXI.Container | null,
    app: PIXI.Application
  ): void {
    // デバッグモードが無効なら何もしない
    if (!this.settings.enabled) return;
    
    // デバッグ情報を構築
    const debugInfo: Partial<DebugInfo> = {
      previewCenter: { x: app.renderer.width / 2, y: app.renderer.height / 2 },
      lastUpdated: Date.now()
    };
    
    // フレーズコンテナの情報
    if (phraseContainer) {
      // フレーズコンテナの更新を確実に行う
      phraseContainer.updateTransform();
      
      const phraseGlobalPos = phraseContainer.getGlobalPosition();
      const phraseLocalPos = { x: phraseContainer.position.x, y: phraseContainer.position.y };
      
      debugInfo.phrasePosition = phraseLocalPos;
      debugInfo.redRectGlobal = phraseGlobalPos;
      debugInfo.redRectLocal = phraseLocalPos;
    }
    
    // 単語コンテナの情報
    if (wordContainer) {
      // 単語コンテナの更新を確実に行う
      wordContainer.updateTransform();
      
      const wordGlobalPos = wordContainer.getGlobalPosition();
      const wordLocalPos = { x: wordContainer.position.x, y: wordContainer.position.y };
      
      // 単語コンテナに設定されている名前からID情報を抽出
      const containerName = (wordContainer as any).name || '';
      const wordIdMatch = containerName.match(/word_container_(.+)/);
      const wordId = wordIdMatch ? wordIdMatch[1] : '';
      
      debugInfo.wordId = wordId;
      debugInfo.wordRectGlobal = wordGlobalPos;
      debugInfo.wordRectLocal = wordLocalPos;
    }
    
    // 文字コンテナの情報
    if (charContainer) {
      // 文字コンテナの更新を確実に行う
      charContainer.updateTransform();
      
      const charGlobalPos = charContainer.getGlobalPosition();
      const charLocalPos = { x: charContainer.position.x, y: charContainer.position.y };
      
      // 文字コンテナに設定されている名前からID情報を抽出
      const containerName = (charContainer as any).name || '';
      const charIdMatch = containerName.match(/char_container_(.+)/);
      const charId = charIdMatch ? charIdMatch[1] : '';
      
      debugInfo.charId = charId;
      debugInfo.charRectGlobal = charGlobalPos;
      debugInfo.charRectLocal = charLocalPos;
    }
    
    // デバッグ情報を更新
    this.updateDebugInfo(debugInfo);
  }

  /**
   * スロットリング付きのイベント発火
   * @param eventType イベントタイプ
   * @param detail イベント詳細
   * @param throttleMs スロットリング間隔（ミリ秒）
   */
  private throttledDispatch(eventType: string, detail: any, throttleMs: number): void {
    // 現在時刻
    const now = Date.now();
    
    // 前回の発火時刻
    const lastDispatch = this.eventTimers[eventType] || 0;
    
    // スロットリング間隔を超えていれば発火
    if (now - lastDispatch > throttleMs) {
      this.dispatchEvent(eventType, detail);
      this.eventTimers[eventType] = now;
    }
  }

  /**
   * イベントを発火する
   * @param eventType イベントタイプ
   * @param detail イベント詳細
   */
  private dispatchEvent(eventType: string, detail: any): void {
    try {
      const event = new CustomEvent(eventType, {
        detail: {
          ...detail,
          timestamp: Date.now()
        }
      });
      
      window.dispatchEvent(event);
    } catch (error) {
      console.error(`デバッグイベント発火エラー[${eventType}]:`, error);
    }
  }

  /**
   * デバッグ情報を取得する
   */
  getDebugInfo(): DebugInfo {
    return { ...this.debugInfo };
  }

  /**
   * タイミング情報を取得する
   */
  getTimingInfo(): TimingDebugInfo {
    return { ...this.timingInfo };
  }

  /**
   * クリーンアップ処理
   */
  destroy(): void {
    // グローバル参照を削除
    if ((window as any).__DEBUG_MANAGER__ === this) {
      delete (window as any).__DEBUG_MANAGER__;
    }
    
    // タイマーをクリア
    this.eventTimers = {};
    
    // デバッグ情報をクリア
    this.debugInfo = {};
    this.timingInfo = {
      currentTime: 0,
      activePhrase: [],
      activeWord: [],
      activeChar: []
    };
    
    console.log('DebugManager destroyed');
  }
}

export default DebugManager;
