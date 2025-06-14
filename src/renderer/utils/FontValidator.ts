/**
 * FontValidator - フォントが実際にブラウザで利用可能かチェックするユーティリティ
 * 
 * システムフォント名とCSS/PIXI.jsで実際に使用可能なフォント名の
 * 違いを検証し、有効なフォントのみを提供する
 */

export class FontValidator {
  private static validatedFonts: Set<string> = new Set();
  private static invalidFonts: Set<string> = new Set();
  private static canvas: HTMLCanvasElement | null = null;
  private static context: CanvasRenderingContext2D | null = null;

  /**
   * 初期化（Canvasコンテキストの作成）
   */
  static initialize(): void {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 100;
      this.canvas.height = 50;
      this.context = this.canvas.getContext('2d');
    }
  }

  /**
   * フォントが実際に利用可能かチェック
   * @param fontFamily チェックするフォントファミリー名
   * @returns 利用可能な場合true
   */
  static isValidFont(fontFamily: string): boolean {
    // キャッシュからチェック
    if (this.validatedFonts.has(fontFamily)) {
      return true;
    }
    if (this.invalidFonts.has(fontFamily)) {
      return false;
    }

    this.initialize();
    if (!this.context) {
      console.warn('[FontValidator] Canvas context not available');
      return false;
    }

    try {
      // デフォルトフォントでのテキスト幅を測定
      const testText = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      this.context.font = '48px monospace';
      const defaultWidth = this.context.measureText(testText).width;

      // 指定フォントでのテキスト幅を測定
      this.context.font = `48px "${fontFamily}", monospace`;
      const testWidth = this.context.measureText(testText).width;

      // 幅が異なればフォントが有効
      const isValid = Math.abs(defaultWidth - testWidth) > 1;

      // キャッシュに保存
      if (isValid) {
        this.validatedFonts.add(fontFamily);
      } else {
        this.invalidFonts.add(fontFamily);
      }

      return isValid;
    } catch (error) {
      console.debug(`[FontValidator] Error validating font "${fontFamily}":`, error);
      this.invalidFonts.add(fontFamily);
      return false;
    }
  }

  /**
   * フォントリストから有効なフォントのみをフィルタリング
   * @param fontFamilies フォントファミリー名の配列
   * @returns 有効なフォントのみの配列
   */
  static filterValidFonts(fontFamilies: string[]): string[] {
    return fontFamilies.filter(font => this.isValidFont(font));
  }

  /**
   * フォントオプション配列から有効なフォントのみをフィルタリング
   * @param fontOptions フォントオプションの配列
   * @returns 有効なフォントのみの配列
   */
  static filterValidFontOptions(fontOptions: Array<{value: string, label: string}>): Array<{value: string, label: string}> {
    return fontOptions.filter(option => this.isValidFont(option.value));
  }

  /**
   * Document Font API（利用可能な場合）を使用してフォントを確認
   * @param fontFamily チェックするフォントファミリー名
   * @returns 利用可能な場合true、不明な場合null
   */
  static checkWithDocumentFonts(fontFamily: string): boolean | null {
    try {
      // Document Font APIが利用可能かチェック
      if ('fonts' in document && 'check' in (document as any).fonts) {
        return (document as any).fonts.check(`12px "${fontFamily}"`);
      }
    } catch (error) {
      console.debug('[FontValidator] Document Font API not available or error:', error);
    }
    return null;
  }

  /**
   * フォント名の正規化（PIXI.js/CSS用）
   * システムフォント名をCSS/PIXI.jsで使用可能な形式に変換
   * @param fontFamily システムフォント名
   * @returns 正規化されたフォント名
   */
  static normalizeFontName(fontFamily: string): string {
    // 特殊文字や空白の処理
    let normalized = fontFamily.trim();

    // 日本語フォント名の特別処理
    const japaneseMapping: Record<string, string> = {
      'ヒラギノ角ゴシック W0': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W1': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W2': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W3': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W4': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W5': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W6': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W7': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W8': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ角ゴシック W9': 'Hiragino Kaku Gothic ProN',
      'ヒラギノ明朝 ProN': 'Hiragino Mincho ProN',
      'ヒラギノ明朝 Pro': 'Hiragino Mincho Pro',
      '游ゴシック': 'Yu Gothic',
      '游明朝': 'Yu Mincho',
      'メイリオ': 'Meiryo',
      'MS ゴシック': 'MS Gothic',
      'MS 明朝': 'MS Mincho',
      'MS Pゴシック': 'MS PGothic',
      'MS P明朝': 'MS PMincho'
    };

    // 日本語フォント名のマッピング
    if (japaneseMapping[normalized]) {
      normalized = japaneseMapping[normalized];
    }

    // 不要な文字を削除
    normalized = normalized.replace(/["""'']/g, '');

    return normalized;
  }

  /**
   * フォントの詳細情報を取得（デバッグ用）
   * @param fontFamily フォントファミリー名
   * @returns フォント情報
   */
  static getFontInfo(fontFamily: string): {
    original: string;
    normalized: string;
    isValid: boolean;
    documentFontCheck: boolean | null;
  } {
    const normalized = this.normalizeFontName(fontFamily);
    const isValid = this.isValidFont(normalized);
    const documentFontCheck = this.checkWithDocumentFonts(normalized);

    return {
      original: fontFamily,
      normalized,
      isValid,
      documentFontCheck
    };
  }

  /**
   * キャッシュをクリア
   */
  static clearCache(): void {
    this.validatedFonts.clear();
    this.invalidFonts.clear();
  }

  /**
   * デバッグ情報を出力
   */
  static debug(): void {
    console.log('[FontValidator] 検証済みフォント:');
    console.log('  有効:', Array.from(this.validatedFonts));
    console.log('  無効:', Array.from(this.invalidFonts));
  }
}