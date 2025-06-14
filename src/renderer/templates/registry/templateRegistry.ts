import { IAnimationTemplate, TemplateMetadata } from '../../types/types';
import * as templates from '../index';

// テンプレートレジストリの型定義
export interface TemplateRegistryEntry {
  id: string;
  name: string;
  template: IAnimationTemplate;
  metadata?: TemplateMetadata; // テンプレートメタデータ（レジストリレベル）
}

// テンプレートの登録
export const templateRegistry: TemplateRegistryEntry[] = [
  {
    id: 'multilinetext',
    name: '多段歌詞テキスト',
    template: templates.MultiLineText
  },
  {
    id: 'glitchtext',
    name: 'グリッチテキスト',
    template: templates.GlitchText
  },
  {
    id: 'wordslidetext',
    name: '単語スライドテキスト',
    template: templates.WordSlideText
  }
];

// IDからテンプレートを取得
export function getTemplateById(id: string): IAnimationTemplate | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  return entry?.template;
}

// フルIDから取得（backwards compatibility）
export function getTemplateByFullId(fullId: string): IAnimationTemplate | undefined {
  return getTemplateById(fullId);
}

// 省略IDからフルIDを取得（backwards compatibility）
export function getFullIdFromShortId(shortId: string): string | undefined {
  return shortId;
}

// テンプレートパラメータ設定を取得
export function getTemplateMetadata(id: string): any {
  const template = getTemplateById(id);
  if (template && typeof template.getParameterConfig === 'function') {
    return template.getParameterConfig();
  }
  console.error(`Template ${id} must implement getParameterConfig() method`);
  return [];
}

// すべてのテンプレートIDと名前のリストを取得
export function getAllTemplates(): Array<{id: string, name: string}> {
  return templateRegistry.map(entry => ({
    id: entry.id,
    name: entry.name
  }));
}

// テンプレートの著作者情報を取得
export function getTemplateAuthorship(id: string): TemplateMetadata | undefined {
  const entry = templateRegistry.find(entry => entry.id === id);
  if (!entry) return undefined;
  
  // テンプレート自体のメタデータを優先
  if (entry.template.metadata) {
    return entry.template.metadata;
  }
  
  // レジストリレベルのメタデータをフォールバック
  return entry.metadata;
}
