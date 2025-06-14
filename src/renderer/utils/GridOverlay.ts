import * as PIXI from 'pixi.js';

/**
 * GridOverlay
 * プレビューエリアに方眼目盛りとグローバル座標値を表示するユーティリティクラス
 */
export class GridOverlay {
  private container: PIXI.Container;
  private grid: PIXI.Graphics;
  private labels: PIXI.Container;
  private gridSize: number = 50; // グリッドのマス目のサイズ (ピクセル)
  public visible: boolean = true;
  private app: PIXI.Application;

  /**
   * コンストラクタ
   * @param app PIXI.Application インスタンス
   */
  constructor(app: PIXI.Application) {
    this.app = app;
    this.container = new PIXI.Container();
    this.grid = new PIXI.Graphics();
    this.labels = new PIXI.Container();
    
    this.container.addChild(this.grid);
    this.container.addChild(this.labels);
    
    // コンテナをステージのルートに追加
    // グリッドは一番先に描画されるように
    this.app.stage.addChildAt(this.container, 0);
    
    // 最初に描画
    this.draw();
    
    // リサイズイベントリスナーの設定
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  /**
   * 方眼目盛りとラベルを描画
   */
  draw(): void {
    // this.app.screen.width が undefined の場合があるため、安全に取得
    if (!this.app || !this.app.screen) {
      console.warn('GridOverlay: PIXI App or screen is undefined, skipping draw');
      return;
    }
    
    const width = this.app.screen.width || this.app.renderer.width || 800;
    const height = this.app.screen.height || this.app.renderer.height || 400;
    const centerX = width / 2;
    const centerY = height / 2;

    // グリッドをクリア
    this.grid.clear();
    
    // ラベルをクリア
    while (this.labels.children.length > 0) {
      this.labels.removeChildAt(0);
    }

    // グリッドの設定
    this.grid.lineStyle(1, 0xAAAAAA, 0.3);
    
    // 左上が0,0ではなく中心が0,0になるような相対座標系を描画
    // 水平線
    for (let y = 0; y <= height; y += this.gridSize) {
      this.grid.moveTo(0, y);
      this.grid.lineTo(width, y);
      
      // グローバル座標をそのまま使用
      const globalY = y;
      
      // Y座標のラベル (左端)
      this.drawLabel(5, y, `${globalY}`, 'left');
    }
    
    // 垂直線
    for (let x = 0; x <= width; x += this.gridSize) {
      this.grid.moveTo(x, 0);
      this.grid.lineTo(x, height);
      
      // グローバル座標をそのまま使用
      const globalX = x;
      
      // X座標のラベル (上端)
      this.drawLabel(x, 5, `${globalX}`, 'top');
    }
    
    // プレビューエリアの中心に十字マーク
    // 中心線 (強調表示)
    this.grid.lineStyle(1, 0xFF0000, 0.5);
    
    // 横線 (中心)
    this.grid.moveTo(0, centerY);
    this.grid.lineTo(width, centerY);
    
    // 縦線 (中心)
    this.grid.moveTo(centerX, 0);
    this.grid.lineTo(centerX, height);
    
    // 中心点の座標ラベル
    this.drawLabel(centerX + 5, centerY + 5, `(${centerX}, ${centerY})`, 'center', 0xFF0000);
  }

  /**
   * 座標ラベルを描画
   * @param x X座標
   * @param y Y座標
   * @param text ラベルテキスト
   * @param align 配置 ('left', 'top', 'center')
   * @param color テキストの色 (デフォルト: 0xAAAAAA)
   */
  private drawLabel(x: number, y: number, text: string, align: 'left' | 'top' | 'center', color: number = 0xAAAAAA): void {
    const style = new PIXI.TextStyle({
      fontFamily: 'monospace',
      fontSize: 10,
      fill: color,
      align: 'center',
    });
    
    const label = new PIXI.Text(text, style);
    
    // 配置によって位置を調整
    switch (align) {
      case 'left':
        label.anchor.set(0, 0.5);
        break;
      case 'top':
        label.anchor.set(0.5, 0);
        break;
      case 'center':
        label.anchor.set(0, 0);
        break;
    }
    
    label.position.set(x, y);
    label.alpha = 0.7;
    this.labels.addChild(label);
  }

  /**
   * 表示/非表示を切り替え
   * @param visible 表示するかどうか
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.visible = visible;
  }

  /**
   * 表示状態を切り替え
   */
  toggleVisibility(): void {
    this.setVisible(!this.visible);
  }

  /**
   * 現在の表示状態を取得
   */
  isVisible(): boolean {
    return this.visible && this.container.visible;
  }

  /**
   * グリッドを表示
   */
  show(): void {
    this.setVisible(true);
  }

  /**
   * グリッドを非表示
   */
  hide(): void {
    this.setVisible(false);
  }

  /**
   * グリッドサイズを設定
   * @param size グリッドのマス目のサイズ (ピクセル)
   */
  setGridSize(size: number): void {
    this.gridSize = size;
    this.draw();
  }

  /**
   * リサイズ時の処理
   */
  private handleResize(): void {
    // this.app が有効な場合のみリサイズ処理を実行
    if (this.app && this.app.screen) {
      this.draw();
    }
  }

  /**
   * リソース解放
   */
  destroy(): void {
    window.removeEventListener('resize', this.handleResize.bind(this));
    this.grid.destroy();
    this.labels.destroy();
    this.container.destroy();
  }
}
