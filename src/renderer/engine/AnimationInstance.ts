import * as PIXI from 'pixi.js';
import { IAnimationTemplate, HierarchyType, AnimationPhase } from '../types/types';

export class AnimationInstance {
  id: string;
  template: IAnimationTemplate;
  text: string;
  x: number;
  y: number;
  params: Record<string, any>;
  startMs: number;
  endMs: number;
  container: PIXI.Container;
  isActive: boolean = false;
  
  // 階層対応のプロパティを追加
  hierarchyType: HierarchyType;
  
  // アニメーション定義フラグ
  animationDefined: {
    in: boolean;
    out: boolean;
  } = { in: false, out: false };
  
  // デバッグログの制限用
  private static lastLogTime = 0;
  private static LOG_THROTTLE_MS = 1000; // 1秒ごとにのみログを出力

  constructor(
    id: string,
    template: IAnimationTemplate,
    text: string,
    x: number,
    y: number,
    params: Record<string, any>,
    startMs: number,
    endMs: number,
    container: PIXI.Container,
    hierarchyType: HierarchyType = 'char' // デフォルトは文字レベル
  ) {
    this.id = id;
    this.template = template;
    this.text = text;
    this.x = x;
    this.y = y;
    this.params = params;
    this.startMs = startMs;
    this.endMs = endMs;
    this.container = container;
    this.hierarchyType = hierarchyType;
    
    // アニメーション定義の有無を確認
    this.checkAnimationDefined();
    
    // 初期状態は非表示
    this.container.visible = false;
  }

  // アニメーション定義の有無を確認するメソッド
  checkAnimationDefined() {
    if (this.params) {
      const inAnimKey = `${this.hierarchyType}InAnimation`;
      const outAnimKey = `${this.hierarchyType}OutAnimation`;
      
      this.animationDefined.in = this.params.hasOwnProperty(inAnimKey) && 
                                this.params[inAnimKey] !== null && 
                                this.params[inAnimKey] !== undefined &&
                                this.params[inAnimKey] !== 'none';
      
      this.animationDefined.out = this.params.hasOwnProperty(outAnimKey) && 
                                 this.params[outAnimKey] !== null && 
                                 this.params[outAnimKey] !== undefined &&
                                 this.params[outAnimKey] !== 'none';
      
      // アニメーション定義のログは初期化時のみに制限
    }
  }

  // アニメーションフェーズを判定
  private determineAnimationPhase(nowMs: number): AnimationPhase {
    const headTime = this.params.headTime || 500; // デフォルト値
    const tailTime = this.params.tailTime || 500; // デフォルト値
    
    if (nowMs < this.startMs) {
      return 'in';
    } else if (nowMs > this.endMs) {
      return 'out';
    } else {
      return 'active';
    }
  }

  // スロットルされたログ出力関数
  private throttledLog(message: string) {
    const now = Date.now();
    // フレーズレベルのみログ出力するか、一定時間経過したときのみログ出力
    if (this.hierarchyType === 'phrase' || 
        now - AnimationInstance.lastLogTime > AnimationInstance.LOG_THROTTLE_MS) {
      console.log(message);
      AnimationInstance.lastLogTime = now;
    }
  }

  update(nowMs: number) {
    
    try {
      // 重要: コンテナの有効性確認
      if (!this.container) {
        console.error(`エラー: コンテナが無効な状態です (${this.id})`);
        return false;
      }
      
      // 安全にコンテナの表示状態を確保
      this.isActive = true;
      this.container.visible = true;
      
      // 文字レベルの場合は、位置と名前を再確認
      if (this.hierarchyType === 'char') {
        // 文字コンテナの名前が設定されているか確認
        if (!(this.container as any).name || !(this.container as any).name.includes('char_container_')) {
          (this.container as any).name = `char_container_${this.id}`;
          console.log(`文字コンテナの名前を再設定: ${(this.container as any).name}`);
        }
      }
      
      // 単語レベルまたは文字レベルの場合、現在のフレーズのphaseを動的に取得
      if ((this.hierarchyType === 'word' || this.hierarchyType === 'char') && this.params.phraseStartMs && this.params.phraseEndMs) {
        // フレーズのphaseを計算
        let phrasePhase = 'active';
        if (nowMs < this.params.phraseStartMs) {
          phrasePhase = 'in';
        } else if (nowMs > this.params.phraseEndMs) {
          phrasePhase = 'out';
        }
        // 現在のフレーズ phase をパラメータに追加
        this.params.phrasePhase = phrasePhase;
      }
      
      // 現在のアニメーションフェーズを判定
      const phase = this.determineAnimationPhase(nowMs);
      
      // 子要素のコンテナ状態は維持したまま、このコンテナの変形のみを処理
      try {
        if (typeof this.template.animateContainer === 'function') {
          // アニメーションコンテナメソッドを呼び出し
          this.template.animateContainer(
            this.container,
            this.text,
            this.params,
            nowMs,
            this.startMs,
            this.endMs,
            this.hierarchyType,
            phase
          );
        } 
        // 従来のanimateメソッドをフォールバックとして使用
        else if (typeof this.template.animate === 'function') {
          this.template.animate(
            this.container,
            this.text,
            this.x,
            this.y,
            this.params,
            nowMs,
            this.startMs,
            this.endMs
          );
        }
        else {
          // どちらのメソッドも実装されていない場合はエラーを表示
          console.error(`エラー: テンプレート ${this.template.constructor?.name || 'Unknown'} はアニメーションメソッドを実装していません`);
          this.showErrorMessage();
        }
        
        // 重要: 変換行列を明示的に更新
        if (this.container) {
          try {
            this.container.updateTransform();
          } catch (error) {
            console.error(`UpdateTransform エラー (${this.id}):`, error);
          }
        }
        
        return true;
      } catch (error) {
        console.error(`AnimationInstance.update: アニメーション適用エラー ${this.id}:`, error);
        this.showErrorMessage();
        return false;
      }
    } catch (error) {
      console.error(`AnimationInstance.update: 致命的エラー ${this.id}:`, error);
      return false;
    }
  }
  
  // 文字レベルでのテキスト描画処理
  private renderCharText(nowMs: number, phase: AnimationPhase) {
    // テンプレート側の処理を阻害しないよう、この処理を完全に無効化する
    return;
  }

  // 表示期間外は非表示にする
  hideOutOfRange() {
    // 非表示のログ出力を制限（フレーズレベルのみ）
    
    this.container.visible = false;
    this.isActive = false;
  }

  // エラーメッセージを表示
  private showErrorMessage() {
    // エラー表示用のコンテナを作成（子要素とは別に管理）
    const errorContainer = new PIXI.Container();
    this.container.addChild(errorContainer);
    
    const style = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: 14,
      fill: '#FF0000',
      align: 'center',
    });
    
    const errorText = new PIXI.Text('アニメーションエラー', style);
    errorText.anchor.set(0.5, 0.5);
    errorText.position.set(0, 0);
    errorContainer.addChild(errorText);
  }

  destroy() {
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
    this.isActive = false;
  }
}

export default AnimationInstance;