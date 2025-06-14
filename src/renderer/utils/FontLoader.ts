/**
 * FontLoader - ElectronネイティブアプリでシステムフォントをPIXI.jsで使用可能にする
 * 
 * システムフォントファイルを直接読み込み、CSS @font-face として登録することで
 * PIXI.jsでも使用可能にする
 */

import { FontInfo } from '../../shared/types';

export class FontLoader {
  private static loadedFonts: Set<string> = new Set();
  private static styleElement: HTMLStyleElement | null = null;

  /**
   * 初期化
   */
  static initialize(): void {
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      document.head.appendChild(this.styleElement);
    }
  }

  /**
   * システムフォントをCSS @font-face として登録
   * @param fontInfo フォント情報
   * @returns 登録成功した場合true
   */
  static async loadSystemFont(fontInfo: FontInfo): Promise<boolean> {
    if (!fontInfo.path) {
      console.warn(`[FontLoader] フォントパスが指定されていません: ${fontInfo.family}`);
      return false;
    }

    // 既に読み込み済みの場合はスキップ
    if (this.loadedFonts.has(fontInfo.family)) {
      return true;
    }

    try {
      // Electronのfile://プロトコルでフォントファイルにアクセス
      const fontUrl = `file://${fontInfo.path}`;
      
      // CSS @font-face ルールを作成
      const fontFace = `
        @font-face {
          font-family: "${fontInfo.family}";
          src: url("${fontUrl}") format("${this.getFontFormat(fontInfo.path)}");
          font-weight: ${fontInfo.weight || 'normal'};
          font-style: ${fontInfo.style === 'Italic' ? 'italic' : 'normal'};
        }
      `;

      // スタイルシートに追加
      if (this.styleElement) {
        this.styleElement.textContent += fontFace;
      }

      // CSS Font Loading APIを使用してフォントの読み込みを確認
      if ('fonts' in document) {
        await (document as any).fonts.load(`12px "${fontInfo.family}"`);
      }

      this.loadedFonts.add(fontInfo.family);
      return true;

    } catch (error) {
      console.error(`[FontLoader] フォント読み込みエラー: ${fontInfo.family}`, error);
      return false;
    }
  }

  /**
   * 複数のシステムフォントを一括読み込み
   * @param fontInfos フォント情報の配列
   * @returns 読み込み成功したフォント名の配列
   */
  static async loadSystemFonts(fontInfos: FontInfo[]): Promise<string[]> {
    this.initialize();
    
    const loadedFonts: string[] = [];
    const loadPromises = fontInfos.map(async (fontInfo) => {
      const success = await this.loadSystemFont(fontInfo);
      if (success) {
        loadedFonts.push(fontInfo.family);
      }
    });

    await Promise.all(loadPromises);
    return loadedFonts;
  }

  /**
   * フォントファイルの形式を判定
   * @param filePath フォントファイルパス
   * @returns フォント形式
   */
  private static getFontFormat(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    switch (ext) {
      case 'ttf': return 'truetype';
      case 'otf': return 'opentype';
      case 'woff': return 'woff';
      case 'woff2': return 'woff2';
      case 'ttc': return 'truetype';
      default: return 'truetype';
    }
  }

  /**
   * フォントが読み込み済みかチェック
   * @param fontFamily フォントファミリー名
   * @returns 読み込み済みの場合true
   */
  static isLoaded(fontFamily: string): boolean {
    return this.loadedFonts.has(fontFamily);
  }

  /**
   * 読み込み済みフォントのリストを取得
   * @returns フォントファミリー名の配列
   */
  static getLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }

  /**
   * デバッグ情報を出力
   */
  static debug(): void {
    console.log('[FontLoader] 読み込み済みフォント:');
    console.log('  数:', this.loadedFonts.size);
    console.log('  リスト:', Array.from(this.loadedFonts));
    
    if (this.styleElement) {
      console.log('  CSS @font-face ルール数:', 
        (this.styleElement.textContent?.match(/@font-face/g) || []).length);
    }
  }

  /**
   * Electronプロセス間通信でフォント情報を取得して読み込み
   * @param fontFamilies 読み込みたいフォントファミリー名の配列
   */
  static async loadElectronFonts(fontFamilies: string[]): Promise<void> {
    try {
      // システムフォント情報を取得
      const systemFonts = await (window as any).electronAPI.getSystemFonts();
      
      // 指定されたフォントファミリーに一致するフォント情報を抽出
      const targetFonts = systemFonts.filter((font: FontInfo) => 
        fontFamilies.includes(font.family)
      );

      // フォントを読み込み
      const loaded = await this.loadSystemFonts(targetFonts);
      
    } catch (error) {
      console.error('[FontLoader] Electronフォント読み込みエラー:', error);
    }
  }
}