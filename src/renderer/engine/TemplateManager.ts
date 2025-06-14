import { IAnimationTemplate } from '../types/types';

export interface TemplateConfig {
  name: string;
  description?: string;
  thumbnailUrl?: string;
  defaultParams?: Record<string, any>;
}

export class TemplateManager {
  // テンプレートレジストリ
  private templates: Map<string, IAnimationTemplate> = new Map();
  // 表示名と設定
  private templateConfigs: Map<string, TemplateConfig> = new Map();
  // デフォルトテンプレートID
  private defaultTemplateId: string = '';
  // テンプレート割り当て (フェーズ1ではフレーズIDのみが格納される)
  private assignments: Map<string, string> = new Map();
  
  constructor(defaultTemplateId?: string) {
    if (defaultTemplateId) {
      this.defaultTemplateId = defaultTemplateId;
    }
  }
  
  // テンプレートの登録
  registerTemplate(
    id: string,
    template: IAnimationTemplate,
    config: TemplateConfig = {},
    isDefault: boolean = false
  ): void {
    this.templates.set(id, template);
    this.templateConfigs.set(id, config);
    
    if (isDefault || !this.defaultTemplateId) {
      this.defaultTemplateId = id;
    }
  }
  
  // テンプレートの削除
  unregisterTemplate(id: string): boolean {
    const removed = this.templates.delete(id);
    this.templateConfigs.delete(id);
    
    // デフォルトテンプレートが削除された場合、新しいデフォルトを設定
    if (id === this.defaultTemplateId && this.templates.size > 0) {
      this.defaultTemplateId = Array.from(this.templates.keys())[0];
    }
    
    return removed;
  }
  
  // テンプレート割り当て (フェーズ1ではフレーズIDのみ対応)
  assignTemplate(objectId: string, templateId: string): boolean {
    if (!this.templates.has(templateId)) {
      console.error(`Template ID ${templateId} not found`);
      return false;
    }
    
    // フェーズ1では、IDがフレーズレベルかをチェック
    if (!this.isPhraseId(objectId)) {
      console.warn(`フェーズ1ではフレーズレベルのみテンプレート割り当てが可能です: ${objectId}`);
      return false;
    }
    
    this.assignments.set(objectId, templateId);
    return true;
  }
  
  // フレーズIDかどうかを判定
  private isPhraseId(id: string): boolean {
    // フレーズIDの形式: phrase_X
    return id.startsWith('phrase_') && id.split('_').length === 2;
  }
  
  // テンプレート割り当て解除（デフォルトに戻す）
  unassignTemplate(objectId: string): boolean {
    return this.assignments.delete(objectId);
  }
  
  // オブジェクトのテンプレート取得
  getTemplateForObject(objectId: string): IAnimationTemplate {
    // オブジェクトに直接割り当てられたテンプレートがあるか確認
    if (this.assignments.has(objectId)) {
      const templateId = this.assignments.get(objectId)!;
      const template = this.templates.get(templateId);
      if (template) {
        return template;
      }
    }
    
    // 親オブジェクトのテンプレートを確認
    const parentId = this.getParentObjectId(objectId);
    if (parentId) {
      // 親オブジェクトのテンプレートを再帰的に取得
      // これにより階層が深くても正しく継承される
      return this.getTemplateForObject(parentId);
    }
    
    // どちらもなければデフォルトテンプレートを返す
    return this.templates.get(this.defaultTemplateId)!;
  }
  
  // 親オブジェクトIDを取得するヘルパーメソッド
  private getParentObjectId(objectId: string): string | null {
    // IDの形式: phrase_0_word_1_char_2
    const parts = objectId.split('_');
    
    if (parts.length >= 4) {
      if (parts[parts.length - 2] === 'char') {
        // 文字の場合、親は単語
        return parts.slice(0, parts.length - 2).join('_');
      } else if (parts[parts.length - 2] === 'word') {
        // 単語の場合、親はフレーズ
        return parts.slice(0, parts.length - 2).join('_');
      }
    }
    
    return null;
  }
  
  // テンプレート割り当て一括設定
  batchAssign(assignments: {objectId: string, templateId: string}[]): void {
    for (const {objectId, templateId} of assignments) {
      this.assignTemplate(objectId, templateId);
    }
  }
  
  /**
   * 複数オブジェクトへのテンプレート一括割り当て
   * @param objectIds 割り当て対象のオブジェクトID配列
   * @param templateId 適用するテンプレートID
   * @returns 成功したオブジェクトIDの配列
   */
  batchAssignTemplate(objectIds: string[], templateId: string): string[] {
    if (!this.templates.has(templateId)) {
      console.error(`Template ID ${templateId} not found`);
      return [];
    }
    
    const successfulIds: string[] = [];
    
    for (const objectId of objectIds) {
      // フェーズ1では、IDがフレーズレベルかをチェック
      if (!this.isPhraseId(objectId)) {
        console.warn(`フェーズ1ではフレーズレベルのみテンプレート割り当てが可能です: ${objectId}`);
        continue;
      }
      
      this.assignments.set(objectId, templateId);
      successfulIds.push(objectId);
    }
    
    return successfulIds;
  }
  
  // 割り当て情報をJSON出力
  exportAssignments(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [objectId, templateId] of this.assignments.entries()) {
      result[objectId] = templateId;
    }
    return result;
  }
  
  // 割り当て情報をインポート
  importAssignments(data: Record<string, string>): void {
    for (const [objectId, templateId] of Object.entries(data)) {
      if (this.templates.has(templateId)) {
        // フェーズ1ではフレーズレベルのみ対応
        if (this.isPhraseId(objectId)) {
          this.assignments.set(objectId, templateId);
        }
      }
    }
  }
  
  // 全登録テンプレート取得
  getAllTemplates(): Array<{id: string, config: TemplateConfig}> {
    return Array.from(this.templates.keys()).map(id => ({
      id,
      config: this.templateConfigs.get(id) || { name: id }
    }));
  }
  
  // デフォルトテンプレートID取得
  getDefaultTemplateId(): string {
    return this.defaultTemplateId;
  }
  
  // デフォルトテンプレート設定
  setDefaultTemplateId(id: string): boolean {
    if (!this.templates.has(id)) {
      console.error(`Template ID ${id} not found`);
      return false;
    }
    this.defaultTemplateId = id;
    return true;
  }
  
  // テンプレートIDからテンプレート取得
  getTemplateById(id: string): IAnimationTemplate | undefined {
    return this.templates.get(id);
  }
  
  // テンプレートIDのリスト取得
  getTemplateIds(): string[] {
    return Array.from(this.templates.keys());
  }
  
  // テンプレート割り当て情報取得
  getAssignments(): Map<string, string> {
    return new Map(this.assignments);
  }
}