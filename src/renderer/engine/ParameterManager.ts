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
  
  // 明示的にアクティブ化されたオブジェクト
  private activatedObjects: Set<string> = new Set();
  
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
    // システムデフォルト値をベースに、深いコピーでパラメータを上書き（参照問題を防ぐ）
    this.globalParams = { 
      ...SYSTEM_DEFAULT_PARAMS, 
      ...JSON.parse(JSON.stringify(this.globalParams)), 
      ...JSON.parse(JSON.stringify(params))
    };
    this.invalidateCache();
  }
  
  // オブジェクト固有パラメータを更新（明示的アクティベーション必須）
  updateObjectParams(objectId: string, params: Record<string, any>): void {
    // オブジェクトが明示的にアクティブ化されていない場合は自動でアクティブ化
    if (!this.activatedObjects.has(objectId)) {
      this.activatedObjects.add(objectId);
    }
    
    const existingParams = this.objectParams.get(objectId) || {};
    // 深いコピーで参照問題を防ぐ
    this.objectParams.set(objectId, JSON.parse(JSON.stringify({ ...existingParams, ...params })));
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
      // 深いコピーを返して参照問題を防ぐ
      return JSON.parse(JSON.stringify(cached.params));
    }
    
    // キャッシュミス時の計算
    const baseParams = this.calculateEffectiveParams(objectId, templateId);
    
    // キャッシュに保存（深いコピー）
    this.effectiveParamsCache.set(cacheKey, {
      params: JSON.parse(JSON.stringify(baseParams)),
      version: this.cacheVersion
    });
    
    // 深いコピーを返す
    return JSON.parse(JSON.stringify(baseParams));
  }

  // 実際のパラメータ計算処理（明示的アクティベーション対応）
  private calculateEffectiveParams(objectId: string, templateId: string): Record<string, any> {
    // 0. システムデフォルト値をベースに
    const baseParams = { ...SYSTEM_DEFAULT_PARAMS };
    
    // 1. テンプレートデフォルトパラメータで上書き
    Object.assign(baseParams, this.templateDefaultParams.get(templateId) || {});
    
    // 2. グローバルパラメータで上書き
    Object.assign(baseParams, this.globalParams);
    
    // 3. 明示的にアクティブ化されたオブジェクトのパラメータのみ適用
    if (this.activatedObjects.has(objectId) && this.objectParams.has(objectId)) {
      const objectSpecificParams = this.objectParams.get(objectId)!;
      Object.assign(baseParams, objectSpecificParams);
    }
    
    return baseParams;
  }
  
  // 親オブジェクトIDを取得するヘルパーメソッド（正規表現による堅牢な実装）
  private getParentObjectId(objectId: string): string | null {
    // 文字ID: 任意の文字列_char_数字または任意文字列 → 親は単語
    const charPattern = /^(.+)_char_(?:\d+|.+)$/;
    const charMatch = objectId.match(charPattern);
    if (charMatch) {
      return charMatch[1]; // 単語IDを返す
    }
    
    // 単語ID: 任意の文字列_word_数字または任意文字列 → 親はフレーズ
    const wordPattern = /^(.+)_word_(?:\d+|.+)$/;
    const wordMatch = objectId.match(wordPattern);
    if (wordMatch) {
      return wordMatch[1]; // フレーズIDを返す
    }
    
    return null;
  }
  
  // パラメータのエクスポート
  exportParameters(): {
    global: Record<string, any>,
    objects: Record<string, Record<string, any>>,
    templateDefaults: Record<string, Record<string, any>>,
    activatedObjects: string[]
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
      templateDefaults,
      activatedObjects: Array.from(this.activatedObjects)
    };
  }
  
  // パラメータのインポート
  importParameters(data: {
    global?: Record<string, any>,
    objects?: Record<string, Record<string, any>>,
    templateDefaults?: Record<string, Record<string, any>>,
    activatedObjects?: string[]
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
    
    if (data.activatedObjects) {
      this.activatedObjects.clear();
      data.activatedObjects.forEach(id => this.activatedObjects.add(id));
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
    // システムデフォルト値をベースに、グローバルパラメータを上書きして返す（深いコピー）
    return JSON.parse(JSON.stringify({ ...SYSTEM_DEFAULT_PARAMS, ...this.globalParams }));
  }
  
  // オブジェクト固有パラメータ取得
  getObjectParams(objectId: string): Record<string, any> {
    // 深いコピーを返して参照問題を防ぐ
    const params = this.objectParams.get(objectId) || {};
    return JSON.parse(JSON.stringify(params));
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

  // 全ての個別オブジェクトパラメータとアクティベーション状態を強制クリア
  forceCleanAllObjectData(): void {
    console.log('ParameterManager: 全ての個別オブジェクトデータを強制クリア開始');
    
    const clearedObjectsCount = this.objectParams.size;
    const clearedActivationsCount = this.activatedObjects.size;
    
    // 全ての個別パラメータをクリア
    this.objectParams.clear();
    
    // 全てのアクティベーション状態をクリア
    this.activatedObjects.clear();
    
    // キャッシュ無効化
    this.invalidateCache();
    
    console.log(`ParameterManager: 強制クリア完了 - ${clearedObjectsCount}個のオブジェクトパラメータと${clearedActivationsCount}個のアクティベーション状態をクリア`);
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
    objects?: Record<string, Record<string, any>>,
    activatedObjects?: string[]
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
    
    if (data.activatedObjects) {
      this.activatedObjects.clear();
      data.activatedObjects.forEach(id => this.activatedObjects.add(id));
    }
    
    this.invalidateCache();
  }

  // システムデフォルト値を取得するメソッド
  getSystemDefaults(): Record<string, any> {
    return { ...SYSTEM_DEFAULT_PARAMS };
  }

  // オブジェクトを明示的にアクティブ化
  activateObject(objectId: string): void {
    this.activatedObjects.add(objectId);
    this.invalidateCache();
  }

  // オブジェクトの明示的アクティベーションを解除
  deactivateObject(objectId: string): void {
    this.activatedObjects.delete(objectId);
    // パラメータもクリア
    this.objectParams.delete(objectId);
    this.invalidateCache();
  }

  // オブジェクトがアクティブ化されているかチェック
  isObjectActivated(objectId: string): boolean {
    return this.activatedObjects.has(objectId);
  }

  // アクティブ化されたオブジェクトのリストを取得
  getActivatedObjects(): string[] {
    return Array.from(this.activatedObjects);
  }

  // 複数オブジェクトを一括アクティブ化
  activateObjects(objectIds: string[]): void {
    objectIds.forEach(id => this.activatedObjects.add(id));
    this.invalidateCache();
  }

  // 複数オブジェクトを一括非アクティブ化
  deactivateObjects(objectIds: string[]): void {
    objectIds.forEach(id => {
      this.activatedObjects.delete(id);
      this.objectParams.delete(id);
    });
    this.invalidateCache();
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