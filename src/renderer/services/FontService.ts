/**
 * FontService - Electronネイティブ環境での統一フォント管理サービス
 * 
 * 全テンプレートが共通で使用するシンプルなフォント取得API
 * アプリケーション初期化時に一度だけシステムフォントを読み込み、
 * フォント検証を行い、実際に使用可能なフォントのみを提供
 * 以降は高速なメモリアクセスでフォント一覧を提供
 */

import { FontValidator } from '../utils/FontValidator';
import { FontLoader } from '../utils/FontLoader';
import { FontInfo } from '../../shared/types';

export interface FontOption {
  value: string;
  label: string;
}

export class FontService {
  private static systemFonts: string[] = [];
  private static validatedFonts: string[] = [];
  private static fontInfoMap: Map<string, FontInfo> = new Map();
  private static initialized: boolean = false;
  // デフォルトフォントのフォールバックを削除
  // システムフォントが取得できない場合はエラーとして適切に処理する

  /**
   * フォントサービスの初期化
   * アプリケーション起動時に一度だけ呼び出す
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Electron環境の確認
      if (!(window as any).electronAPI?.getSystemFonts) {
        throw new Error('[FontService] Electron環境ではありません。システムフォントにアクセスできません。');
      }

      // システムフォントの取得
      const systemFontData: FontInfo[] = await (window as any).electronAPI.getSystemFonts();

      // フォント情報をマップに保存し、フォントファミリーの重複を除去
      const fontFamilySet = new Set<string>();
      
      systemFontData.forEach((font: FontInfo) => {
        if (font.family && typeof font.family === 'string') {
          fontFamilySet.add(font.family);
          // フォント情報をマップに保存（パス情報を含む）
          this.fontInfoMap.set(font.family, font);
        }
      });

      // アルファベット順にソート
      this.systemFonts = Array.from(fontFamilySet).sort((a, b) => 
        a.localeCompare(b, 'ja', { sensitivity: 'base' })
      );


      // Electronネイティブ：全システムフォントを@font-faceとして登録
      await this.loadAllSystemFonts();

      this.initialized = true;

    } catch (error) {
      console.error('[FontService] システムフォント取得エラー:', error);
      // エラーを再スローして上位で適切に処理
      throw error;
    }
  }

  /**
   * 全システムフォントを@font-faceとして登録
   * Electronネイティブアプリとして、全システムフォントをPIXI.jsで使用可能にする
   */
  private static async loadAllSystemFonts(): Promise<void> {
    // FontLoaderを初期化
    FontLoader.initialize();
    
    // パス情報を持つフォントのみを抽出
    const fontsWithPath: FontInfo[] = [];
    this.systemFonts.forEach(fontFamily => {
      const fontInfo = this.fontInfoMap.get(fontFamily);
      if (fontInfo && fontInfo.path) {
        fontsWithPath.push(fontInfo);
      }
    });
    
    // フォントを@font-faceとして登録
    const loadedFonts = await FontLoader.loadSystemFonts(fontsWithPath);
    
    // 読み込み成功したフォントを検証済みリストに追加
    this.validatedFonts = loadedFonts.sort((a, b) => 
      a.localeCompare(b, 'ja', { sensitivity: 'base' })
    );
    
    // デフォルトフォントのフォールバックは使用しない
    // システムフォントのみを使用し、問題があれば明確にする
    
  }

  /**
   * 利用可能なフォント一覧を取得
   * @returns フォントオプションの配列
   */
  static getAvailableFonts(): FontOption[] {
    if (!this.initialized) {
      console.error('[FontService] フォントサービスが初期化されていません。initialize()を呼び出してください。');
      return [];
    }

    if (this.validatedFonts.length === 0) {
      console.error('[FontService] 利用可能なフォントがありません。システムフォントの読み込みに失敗しました。');
      return [];
    }

    return this.validatedFonts.map(fontFamily => ({
      value: fontFamily,
      label: fontFamily
    }));
  }

  /**
   * フォントファミリー名のリストを取得（後方互換性のため）
   * @returns フォントファミリー名の配列
   */
  static getFontFamilies(): string[] {
    return this.getAvailableFonts().map(font => font.value);
  }

  /**
   * 指定されたフォントが利用可能かチェック
   * @param fontFamily チェックするフォントファミリー名
   * @returns 利用可能な場合true
   */
  static isAvailable(fontFamily: string): boolean {
    return this.validatedFonts.includes(fontFamily) || 
           this.validatedFonts.includes(FontValidator.normalizeFontName(fontFamily));
  }

  /**
   * デフォルトフォントを取得
   * @returns デフォルトのフォントファミリー名（システムフォントから選択）
   */
  static getDefaultFont(): string {
    if (this.validatedFonts.length === 0) {
      throw new Error('[FontService] 利用可能なフォントがありません');
    }
    // システムフォントの最初のフォントを返す
    return this.validatedFonts[0];
  }

  /**
   * フォントサービスが初期化済みかチェック
   * @returns 初期化済みの場合true
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * デバッグ用：現在の状態を出力
   */
  static debug(): void {
    console.log('[FontService] デバッグ情報:');
    console.log('  初期化済み:', this.initialized);
    console.log('  システムフォント数:', this.systemFonts.length);
    console.log('  検証済みフォント数:', this.validatedFonts.length);
    console.log('  システムフォント:', this.systemFonts.slice(0, 20)); // 最初の20個のみ表示
    console.log('  検証済みフォント:', this.validatedFonts.slice(0, 20)); // 最初の20個のみ表示
    
    // FontValidatorのデバッグ情報も出力
    FontValidator.debug();
  }

  /**
   * フォント正規化機能のテスト（デバッグ用）
   * @param fontFamily テストするフォント名
   */
  static testFontNormalization(fontFamily: string): void {
    const info = FontValidator.getFontInfo(fontFamily);
    console.log('[FontService] フォント正規化テスト:', info);
  }
}

// デバッグ用にグローバルに公開
if (typeof window !== 'undefined') {
  (window as any).FontService = FontService;
}