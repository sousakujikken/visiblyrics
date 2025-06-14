import * as PIXI from 'pixi.js';

/**
 * デバッグ用グラフィック生成と録画をテストするためのクラス
 */
export default class DebugVideoExporter {
  private app: PIXI.Application;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private isRecording: boolean = false;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private stream: MediaStream | null = null;
  private graphics: PIXI.Graphics | null = null;
  private text: PIXI.Text | null = null;
  private startTime: number = 0;
  
  constructor(containerId: string) {
    console.log('DebugVideoExporter: 初期化開始');
    
    // コンテナ要素を取得
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) {
      throw new Error(`コンテナ要素が見つかりません: ${containerId}`);
    }
    
    // PIXI アプリケーションの作成
    this.app = new PIXI.Application({
      width: 800,
      height: 600,
      backgroundColor: 0x333333,
      antialias: true
    });
    
    this.canvas = this.app.view as HTMLCanvasElement;
    this.container.appendChild(this.canvas);
    
    // デバッググラフィックを描画する
    this.setupDebugGraphics();
    
    console.log('DebugVideoExporter: 初期化完了');
  }
  
  /**
   * デバッグ用グラフィックのセットアップ
   */
  private setupDebugGraphics(): void {
    console.log('デバッググラフィックのセットアップ開始');
    this.graphics = new PIXI.Graphics();
    
    // 赤い四角形
    this.graphics.beginFill(0xff0000);
    this.graphics.drawRect(100, 100, 200, 200);
    this.graphics.endFill();
    
    // 青い円
    this.graphics.beginFill(0x0000ff);
    this.graphics.drawCircle(500, 300, 100);
    this.graphics.endFill();
    
    // 緑の三角形
    this.graphics.beginFill(0x00ff00);
    this.graphics.moveTo(400, 100);
    this.graphics.lineTo(300, 300);
    this.graphics.lineTo(500, 300);
    this.graphics.closePath();
    this.graphics.endFill();
    
    // タイムスタンプ表示用テキスト
    this.text = new PIXI.Text('0.00秒', {
      fontFamily: 'Arial',
      fontSize: 24,
      fill: 0xffffff,
      align: 'center'
    });
    this.text.position.set(400, 450);
    this.text.anchor.set(0.5, 0);
    
    // ステージに追加
    this.app.stage.addChild(this.graphics);
    this.app.stage.addChild(this.text);
    
    console.log('デバッググラフィックのセットアップ完了');
  }
  
  /**
   * アニメーションを開始（デフォルト3秒）
   */
  private startAnimation(duration: number = 3): void {
    console.log(`アニメーション開始（${duration}秒）`);
    this.startTime = performance.now();
    
    // アニメーション更新関数
    const updateFn = (delta: number) => {
      if (!this.graphics || !this.text) return;
      
      const elapsed = (performance.now() - this.startTime) / 1000; // 秒単位に変換
      
      // 指定秒数を超えたらアニメーション停止
      if (elapsed >= duration) {
        this.app.ticker.remove(updateFn);
        this.stopRecording();
        return;
      }
      
      // バッチ境界を視覚的に分かりやすくする
      const batchNumber = Math.floor(elapsed / 5); // 5秒ごとにバッチが変わる
      const withinBatchTime = elapsed % 5; // バッチ内の経過時間
      
      // グラフィックを回転（バッチごとに色を変更）
      this.graphics.rotation = elapsed * 0.5;
      
      // バッチごとに背景色を変更（バッチ境界の確認用）
      const batchColors = [0x333333, 0x444444, 0x555555, 0x666666];
      const currentBatchColor = batchColors[batchNumber % batchColors.length];
      
      // 背景色を設定
      this.app.renderer.backgroundColor = currentBatchColor;
      
      // テキストを更新（バッチ情報も表示）
      this.text.text = `${elapsed.toFixed(2)}秒 (Batch: ${batchNumber}, 内: ${withinBatchTime.toFixed(2)}s)`;
      
      // バッチ境界付近（4.8-5.2秒）で警告表示
      if (withinBatchTime >= 4.8 && withinBatchTime <= 5.2) {
        this.text.style.fill = 0xff0000; // 赤色
      } else {
        this.text.style.fill = 0xffffff; // 白色
      }
    };
    
    // Tickerに登録
    this.app.ticker.add(updateFn);
  }
  
  /**
   * 録画を開始する
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.warn('既に録画中です');
      return;
    }
    
    console.log('録画開始処理を開始します');
    this.isRecording = true;
    this.chunks = [];
    
    try {
      // キャンバスからストリームを取得
      this.stream = this.canvas.captureStream(30); // 30 FPS
      
      // サポートされているMIMEタイプを探す
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      
      let options: MediaRecorderOptions = {};
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options = { mimeType: type };
          console.log(`使用するMIMEタイプ: ${type}`);
          break;
        }
      }
      
      // MediaRecorder の設定
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
          console.log(`データチャンク追加: ${e.data.size} バイト`);
        }
      };
      
      this.mediaRecorder.onstop = this.onRecordingStop.bind(this);
      
      // 録画開始
      this.mediaRecorder.start(1000); // 1秒ごとにデータを収集
      console.log('MediaRecorder 開始');
      
      // アニメーション開始（デフォルト3秒）
      this.startAnimation(3);
      
    } catch (error) {
      console.error('録画開始エラー:', error);
      this.isRecording = false;
      throw error;
    }
  }
  
  /**
   * 長時間録画を開始する（15秒テスト用）
   */
  public async startLongRecording(durationMs: number = 15000): Promise<void> {
    if (this.isRecording) {
      console.warn('既に録画中です');
      return;
    }
    
    const durationSec = durationMs / 1000;
    console.log(`長時間録画開始処理を開始します（${durationSec}秒）`);
    this.isRecording = true;
    this.chunks = [];
    
    try {
      // キャンバスからストリームを取得
      this.stream = this.canvas.captureStream(30); // 30 FPS
      
      // サポートされているMIMEタイプを探す
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      
      let options: MediaRecorderOptions = {};
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options = { mimeType: type };
          console.log(`使用するMIMEタイプ: ${type}`);
          break;
        }
      }
      
      // MediaRecorder の設定
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
          console.log(`データチャンク追加: ${e.data.size} バイト`);
        }
      };
      
      this.mediaRecorder.onstop = this.onLongRecordingStop.bind(this);
      
      // 録画開始
      this.mediaRecorder.start(1000); // 1秒ごとにデータを収集
      console.log(`長時間MediaRecorder 開始（${durationSec}秒）`);
      
      // アニメーション開始（指定秒数）
      this.startAnimation(durationSec);
      
    } catch (error) {
      console.error('長時間録画開始エラー:', error);
      this.isRecording = false;
      throw error;
    }
  }
  
  /**
   * 録画を停止する
   */
  public stopRecording(): void {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn('録画が行われていません');
      return;
    }
    
    console.log('録画停止処理を開始します');
    
    // MediaRecorderのstateを確認して停止
    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      console.log('MediaRecorder 停止');
    }
    
    this.isRecording = false;
  }
  
  /**
   * 録画停止時のコールバック
   */
  private onRecordingStop(): void {
    console.log('録画停止コールバックが呼び出されました');
    
    try {
      // Blob から動画ファイルを作成
      const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
      console.log(`動画ブロブ作成完了: ${blob.size} バイト, タイプ: ${blob.type}`);
      
      const url = URL.createObjectURL(blob);
      
      // ダウンロードリンクを作成
      this.createDownloadLink(url);
      
      // ストリームのトラックを停止
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      // クリーンアップ
      this.chunks = [];
      this.mediaRecorder = null;
    } catch (error) {
      console.error('録画停止処理エラー:', error);
    }
  }
  
  /**
   * 長時間録画停止時のコールバック
   */
  private onLongRecordingStop(): void {
    console.log('長時間録画停止コールバックが呼び出されました');
    
    try {
      // Blob から動画ファイルを作成
      const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
      console.log(`長時間動画ブロブ作成完了: ${blob.size} バイト, タイプ: ${blob.type}`);
      
      const url = URL.createObjectURL(blob);
      
      // ダウンロードリンクを作成
      this.createDownloadLink(url, 'long');
      
      // ストリームのトラックを停止
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      // クリーンアップ
      this.chunks = [];
      this.mediaRecorder = null;
    } catch (error) {
      console.error('長時間録画停止処理エラー:', error);
    }
  }

  /**
   * ダウンロードリンクを生成してクリックする
   */
  private createDownloadLink(url: string, prefix: string = 'debug'): void {
    // 現在の日時からファイル名を作成
    const date = new Date();
    const fileName = `visiblyrics_${prefix}_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.webm`;
    
    console.log(`動画ファイル名: ${fileName}`);
    
    // ダウンロードリンクを作成して自動的にクリック
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    
    console.log('ダウンロードリンクをクリックします');
    a.click();
    
    // クリーンアップ
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('ダウンロードリンククリーンアップ完了');
    }, 100);
  }
  
  /**
   * リソースを解放する
   */
  public destroy(): void {
    console.log('DebugVideoExporter: リソース解放開始');
    
    if (this.isRecording) {
      this.stopRecording();
    }
    
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true, baseTexture: true });
      console.log('PIXI アプリケーション解放完了');
    }
    
    if (this.container && this.container.contains(this.canvas)) {
      this.container.removeChild(this.canvas);
      console.log('キャンバス要素削除完了');
    }
    
    this.graphics = null;
    this.text = null;
    
    console.log('DebugVideoExporter: リソース解放完了');
  }
}
