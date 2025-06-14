// システム全体のデフォルト値定義
const SYSTEM_DEFAULT_PARAMS = {
  fontSize: 120,
  fontFamily: 'Arial',
  fill: '#FFA500', // オレンジ色
  defaultTextColor: '#FFA500', // オレンジ色
  activeTextColor: '#FFA500', // オレンジ色
  completedTextColor: '#FFA500' // オレンジ色
};

export class ParameterManager {
  // テンプレート標準パラメータ
  private templateDefaultParams: Map<string, Record<string, any>> = new Map();
  
  // グローバルパラメータ
  private globalParams: Record<string, any> = {};
  
  // オブジェクト固有パラメータ
  private objectParams: Map<string, Record<string, any>> = new Map();
  
  // パラメータキャッシュ（計算コスト削減）
  private effectiveParamsCache: Map<string, { params: Record<string, any>, version: number }> = new Map();
  private cacheVersion: number = 0;
  
  constructor() {
    // システムデフォルト値でグローバルパラメータを初期化
    this.globalParams = { ...SYSTEM_DEFAULT_PARAMS };
  }
  
  // テンプレートデフォルトパラメータを設定
  setTemplateDefaultParams(templateId: string, params: Record<string, any>): void {
    // システムデフォルト値をベースに、テンプレートのパラメータを上書き
    const mergedParams = { ...SYSTEM_DEFAULT_PARAMS, ...params };
    this.templateDefaultParams.set(templateId, mergedParams);
    this.invalidateCache();
  }
  
  // グローバルパラメータを更新
  updateGlobalParams(params: Record<string, any>): void {
    // システムデフォルト値をベースに、パラメータを上書き
    this.globalParams = { ...SYSTEM_DEFAULT_PARAMS, ...this.globalParams, ...params };
    this.invalidateCache();
  }
  
  // オブジェクト固有パラメータを更新
  updateObjectParams(objectId: string, params: Record<string, any>): void {
    const existingParams = this.objectParams.get(objectId) || {};
    this.objectParams.set(objectId, { ...existingParams, ...params });
    this.invalidateCache();
  }
  
  // テンプレート変更時のパラメータ保持処理（改善版）
  handleTemplateChange(
    oldTemplateId: string,
    newTemplateId: string,
    objectId?: string,
    preserveParams: boolean = true
  ): void {
    console.log(`ParameterManager: テンプレート変更処理 - ${oldTemplateId} -> ${newTemplateId}${objectId ? ` (対象: ${objectId})` : ' (グローバル)'}`);
    
    if (!preserveParams) {
      console.log('ParameterManager: パラメータ保持が無効のためスキップ');
      return;
    }
    
    // 対象パラメータを取得
    const targetParams = objectId 
      ? (this.objectParams.get(objectId) || {})
      : this.globalParams;
    
    console.log(`変更前パラメータ: ${Object.keys(targetParams).length}個`);
    
    // 古いテンプレートのデフォルトパラメータを取得
    const oldDefaultParams = this.templateDefaultParams.get(oldTemplateId) || {};
    
    // 新しいテンプレートのデフォルトパラメータを取得
    const newDefaultParams = this.templateDefaultParams.get(newTemplateId) || {};
    console.log(`新テンプレートデフォルトパラメータ: ${Object.keys(newDefaultParams).length}個`);
    
    // より柔軟なパラメータ保持処理
    const paramsToPreserve: Record<string, any> = {};
    
    // 1. 共通パラメータの保持
    const commonParams = this.getCommonParams(oldTemplateId, newTemplateId);
    console.log(`共通パラメータ: [${commonParams.join(', ')}]`);
    
    for (const key of commonParams) {
      if (targetParams[key] !== undefined) {
        // ユーザーが設定した値があるかどうかを判定
        const isUserModified = JSON.stringify(targetParams[key]) !== JSON.stringify(oldDefaultParams[key]);
        if (isUserModified) {
          paramsToPreserve[key] = targetParams[key];
          console.log(`  共通パラメータ保持: ${key} = ${targetParams[key]}`);
        }
      }
    }
    
    // 2. 重要なレイアウトパラメータの強制保持（文字間隔問題の修正）
    const criticalParams = ['letterSpacing', 'fontSize', 'fontFamily', 'lineHeight', 'offsetX', 'offsetY'];
    for (const key of criticalParams) {
      if (targetParams[key] !== undefined && !paramsToPreserve.hasOwnProperty(key)) {
        // 値が0でない、またはデフォルト値と異なる場合は保持
        if (targetParams[key] !== 0 || oldDefaultParams[key] !== 0) {
          paramsToPreserve[key] = targetParams[key];
          console.log(`  重要パラメータ保持: ${key} = ${targetParams[key]}`);
        }
      }
    }
    
    // 3. 新しいテンプレートのデフォルト値をベースに、保持したパラメータで上書き
    const finalParams = { ...newDefaultParams, ...paramsToPreserve };
    
    // 4. ランダムパラメータの再設定処理
    this.applyRandomParametersIfNeeded(finalParams, newTemplateId);
    
    // パラメータを更新
    if (objectId) {
      this.objectParams.set(objectId, finalParams);
      console.log(`オブジェクトパラメータ更新: ${objectId} (${Object.keys(finalParams).length}個のパラメータ)`);
    } else {
      this.globalParams = finalParams;
      console.log(`グローバルパラメータ更新: ${Object.keys(finalParams).length}個のパラメータ`);
    }
    
    this.invalidateCache();
    
    console.log(`ParameterManager: テンプレート変更処理完了`);
  }
  
  // ランダムパラメータの再設定処理
  private applyRandomParametersIfNeeded(params: Record<string, any>, templateId: string): void {
    const templateDefaults = this.templateDefaultParams.get(templateId) || {};
    
    // ランダム値が設定されているパラメータを特定して再設定
    for (const [key, value] of Object.entries(templateDefaults)) {
      // ランダム関数を含むパラメータの再計算
      if (typeof value === 'function') {
        try {
          params[key] = value();
          console.log(`  ランダムパラメータ再設定: ${key} = ${params[key]}`);
        } catch (error) {
          console.warn(`ランダムパラメータ計算エラー (${key}):`, error);
        }
      }
    }
  }
  
  // 特定オブジェクトの有効パラメータ取得（キャッシュ機能付き最適化版）
  getEffectiveParams(objectId: string, templateId: string): Record<string, any> {
    const cacheKey = `${objectId}:${templateId}`;
    
    // キャッシュから取得を試行
    const cached = this.effectiveParamsCache.get(cacheKey);
    if (cached && cached.version === this.cacheVersion) {
      return { ...cached.params }; // 防御的コピーを返す
    }
    
    // キャッシュミス時の計算
    const baseParams = this.calculateEffectiveParams(objectId, templateId);
    
    // キャッシュに保存
    this.effectiveParamsCache.set(cacheKey, {
      params: { ...baseParams },
      version: this.cacheVersion
    });
    
    return baseParams;
  }

  // 実際のパラメータ計算処理（元のgetEffectiveParamsロジック）
  private calculateEffectiveParams(objectId: string, templateId: string): Record<string, any> {
    // 0. システムデフォルト値をベースに
    const baseParams = { ...SYSTEM_DEFAULT_PARAMS };
    
    // 1. テンプレートデフォルトパラメータで上書き
    Object.assign(baseParams, this.templateDefaultParams.get(templateId) || {});
    
    // 2. グローバルパラメータで上書き
    Object.assign(baseParams, this.globalParams);
    
    // 3. 親オブジェクトのパラメータで上書き - 階層順に適用
    let currentParentId = this.getParentObjectId(objectId);
    const parentParams: Record<string, any>[] = [];
    
    // 親階層のパラメータを収集（フレーズまで遡る）
    while (currentParentId) {
      if (this.objectParams.has(currentParentId)) {
        parentParams.unshift(this.objectParams.get(currentParentId)!);
      }
      currentParentId = this.getParentObjectId(currentParentId);
    }
    
    // 親パラメータを適用（フレーズ→単語→文字の順）
    for (const params of parentParams) {
      Object.assign(baseParams, params);
    }
    
    // 4. オブジェクト固有パラメータで上書き
    if (this.objectParams.has(objectId)) {
      const objectSpecificParams = this.objectParams.get(objectId);
      
      // デバッグ：phrase_2の場合のみパラメータをログ出力
      if (objectId === 'phrase_2') {
        console.log(`[ParameterManager Debug] phrase_2 objectParams:`, objectSpecificParams);
        console.log(`[ParameterManager Debug] phrase_2 baseParams before merge:`, baseParams);
      }
      
      Object.assign(baseParams, objectSpecificParams);
      
      if (objectId === 'phrase_2') {
        console.log(`[ParameterManager Debug] phrase_2 baseParams after merge:`, baseParams);
      }
    }
    
    return baseParams;
  }
  
  // 親オブジェクトIDを取得するヘルパーメソッド
  private getParentObjectId(objectId: string): string | null {
    // IDの形式: phrase_0_word_1_char_2
    const parts = objectId.split('_');
    
    if (parts.length >= 4 && parts[parts.length - 2] === 'char') {
      // 文字の場合、親は単語
      return parts.slice(0, parts.length - 2).join('_');
    } else if (parts.length >= 4 && parts[parts.length - 2] === 'word') {
      // 単語の場合、親はフレーズ
      return parts.slice(0, parts.length - 2).join('_');
    }
    
    return null;
  }
  
  // パラメータのエクスポート
  exportParameters(): {
    global: Record<string, any>,
    objects: Record<string, Record<string, any>>,
    templateDefaults: Record<string, Record<string, any>>
  } {
    const templateDefaults: Record<string, Record<string, any>> = {};
    for (const [id, params] of this.templateDefaultParams.entries()) {
      templateDefaults[id] = { ...params };
    }
    
    const objects: Record<string, Record<string, any>> = {};
    for (const [id, params] of this.objectParams.entries()) {
      objects[id] = { ...params };
    }
    
    return {
      global: { ...this.globalParams },
      objects,
      templateDefaults
    };
  }
  
  // パラメータのインポート
  importParameters(data: {
    global?: Record<string, any>,
    objects?: Record<string, Record<string, any>>,
    templateDefaults?: Record<string, Record<string, any>>
  }): void {
    if (data.global) {
      // システムデフォルト値をベースに、インポートデータを上書き
      this.globalParams = { ...SYSTEM_DEFAULT_PARAMS, ...data.global };
    }
    
    if (data.objects) {
      this.objectParams.clear();
      for (const [id, params] of Object.entries(data.objects)) {
        this.objectParams.set(id, { ...params });
      }
    }
    
    if (data.templateDefaults) {
      this.templateDefaultParams.clear();
      for (const [id, params] of Object.entries(data.templateDefaults)) {
        // システムデフォルト値をベースに、テンプレートデフォルトを上書き
        const mergedParams = { ...SYSTEM_DEFAULT_PARAMS, ...params };
        this.templateDefaultParams.set(id, mergedParams);
      }
    }
    
    this.invalidateCache();
  }
  
  // テンプレート間の共通パラメータを特定
  private getCommonParams(template1Id: string, template2Id: string): string[] {
    const params1 = this.templateDefaultParams.get(template1Id) || {};
    const params2 = this.templateDefaultParams.get(template2Id) || {};
    
    const keys1 = Object.keys(params1);
    const keys2 = Object.keys(params2);
    
    return keys1.filter(key => keys2.includes(key));
  }
  
  // グローバルパラメータ取得
  getGlobalParams(): Record<string, any> {
    // システムデフォルト値をベースに、グローバルパラメータを上書きして返す
    return { ...SYSTEM_DEFAULT_PARAMS, ...this.globalParams };
  }
  
  // オブジェクト固有パラメータ取得
  getObjectParams(objectId: string): Record<string, any> {
    return { ...(this.objectParams.get(objectId) || {}) };
  }
  
  // テンプレートデフォルトパラメータ取得
  getTemplateDefaultParams(templateId: string): Record<string, any> {
    return { ...(this.templateDefaultParams.get(templateId) || {}) };
  }
  
  // 全オブジェクトパラメータを初期化
  clearAllObjectParams(): void {
    this.objectParams.clear();
    this.invalidateCache();
  }

  // 特定オブジェクトのパラメータをクリア
  clearObjectParams(objectId: string): void {
    if (this.objectParams.has(objectId)) {
      this.objectParams.delete(objectId);
      this.invalidateCache();
    }
  }

  // 複数オブジェクトのパラメータを一括クリア
  clearMultipleObjectParams(objectIds: string[]): void {
    let hasDeleted = false;
    objectIds.forEach(id => {
      if (this.objectParams.has(id)) {
        this.objectParams.delete(id);
        hasDeleted = true;
      }
    });
    if (hasDeleted) {
      this.invalidateCache();
    }
  }
  
  // アンドゥ機能用: パラメータの完全復元
  restoreCompleteState(data: {
    global?: Record<string, any>,
    objects?: Record<string, Record<string, any>>
  }): void {
    if (data.global) {
      // システムデフォルト値をベースに、復元データを上書き
      this.globalParams = { ...SYSTEM_DEFAULT_PARAMS, ...JSON.parse(JSON.stringify(data.global)) };
      console.log('ParameterManager: グローバルパラメータ復元完了', this.globalParams);
    }
    
    if (data.objects) {
      this.objectParams.clear();
      for (const [id, params] of Object.entries(data.objects)) {
        this.objectParams.set(id, JSON.parse(JSON.stringify(params)));
        console.log(`ParameterManager: オブジェクトパラメータ復元: ${id}`, params);
      }
    }
    
    this.invalidateCache();
  }

  // システムデフォルト値を取得するメソッド
  getSystemDefaults(): Record<string, any> {
    return { ...SYSTEM_DEFAULT_PARAMS };
  }

  // キャッシュ無効化メソッド
  private invalidateCache(): void {
    this.cacheVersion++;
    // 古いキャッシュエントリをクリア（メモリ効率化）
    if (this.effectiveParamsCache.size > 1000) {
      this.effectiveParamsCache.clear();
    }
  }
}