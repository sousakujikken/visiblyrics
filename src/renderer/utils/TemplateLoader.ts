/**
 * TemplateLoader.ts
 * テンプレートファイルを動的に読み込むためのユーティリティ
 */
import { IAnimationTemplate } from '../types/types';
import * as AllTemplates from '../templates';

/**
 * テンプレート情報のインターフェース
 */
export interface TemplateInfo {
  name: string;
  displayName: string;
  template: IAnimationTemplate;
}

/**
 * 利用可能なテンプレートのリストを取得
 */
export function getAvailableTemplates(): TemplateInfo[] {
  // テンプレートオブジェクトからテンプレート情報の配列を生成
  const templateEntries = Object.entries(AllTemplates).map(([name, template]) => ({
    name,
    displayName: getDisplayName(name),
    template: template as IAnimationTemplate
  }));

  // 名前順にソート
  return templateEntries.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * テンプレート名から表示名を生成
 */
function getDisplayName(name: string): string {
  // キャメルケースやパスカルケースを空白で区切る
  return name
    .replace(/([A-Z])/g, ' $1') // 大文字の前に空白を挿入
    .replace(/^./, (str) => str.toUpperCase()); // 先頭を大文字に
}

/**
 * テンプレート名からテンプレートを取得
 */
export function getTemplateByName(name: string): IAnimationTemplate | null {
  const template = (AllTemplates as any)[name];
  return template || null;
}

/**
 * デフォルトのテンプレートを取得
 */
export function getDefaultTemplate(): IAnimationTemplate {
  // デフォルトとしてHierarchicalOriginMarkerを使用
  return AllTemplates.HierarchicalOriginMarker;
}

export default {
  getAvailableTemplates,
  getTemplateByName,
  getDefaultTemplate
};