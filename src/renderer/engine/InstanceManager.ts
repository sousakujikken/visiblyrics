import * as PIXI from 'pixi.js';
import { PhraseUnit, CharUnit, WordUnit, HierarchyType } from '../types/types';
import AnimationInstance from './AnimationInstance';
import { IAnimationTemplate } from '../types/types';
import { TemplateManager } from './TemplateManager';
import { ParameterManager } from './ParameterManager';

export class InstanceManager {
  private app: PIXI.Application;
  private instances: Map<string, AnimationInstance> = new Map();
  private activeInstances: Set<string> = new Set();
  private template: IAnimationTemplate;
  private defaultParams: Record<string, any>;
  public mainContainer: PIXI.Container; // パブリックに変更
  
  // 階層別インスタンス管理
  private phraseInstances: Map<string, AnimationInstance> = new Map();
  private wordInstances: Map<string, AnimationInstance> = new Map();
  private charInstances: Map<string, AnimationInstance> = new Map();
  
  // 階層関係マッピング
  private hierarchyMap: Map<string, {parentId: string | null, childIds: string[]}> = new Map();
  
  // 複数テンプレート対応用の追加プロパティ
  private templateAssignments: Map<string, string> = new Map();
  private defaultTemplateId: string = '';
  private templateManager: TemplateManager | null = null;
  private parameterManager: ParameterManager | null = null;
  
  // 前回のログ出力時間
  private lastLogTime: number = 0;
  private static LOG_INTERVAL_MS: number = 1000; // 1秒間隔でログを制限

  constructor(
    app: PIXI.Application,
    template: IAnimationTemplate,
    defaultParams: Record<string, any> = {}
  ) {
    this.app = app;
    this.template = template;
    this.defaultParams = defaultParams;
    
    // メインコンテナを作成
    this.mainContainer = new PIXI.Container();
    (this.mainContainer as any).name = 'mainContainer'; // デバッグ用に名前を設定
    this.app.stage.addChild(this.mainContainer);
    
    // メインコンテナの初期位置を左上(0,0)に設定
    this.mainContainer.position.set(0, 0);
    console.log(`InstanceManager: メインコンテナの初期位置を設定: (${this.mainContainer.position.x}, ${this.mainContainer.position.y})`);
    
    // グローバル参照としてメインコンテナを保存
    (window as any).__MAIN_CONTAINER__ = this.mainContainer;
  }
  
  // スロットルされたログ出力
  private throttledLog(message: string) {
    const now = Date.now();
    if (now - this.lastLogTime > InstanceManager.LOG_INTERVAL_MS) {
      console.log(message);
      this.lastLogTime = now;
    }
  }

  // インスタンス取得用メソッド
  getInstance(id: string): AnimationInstance | undefined {
    return this.instances.get(id);
  }

  // 親子関係の追加
  private addHierarchyRelation(id: string, parentId: string | null) {
    if (!this.hierarchyMap.has(id)) {
      this.hierarchyMap.set(id, {parentId, childIds: []});
    } else {
      // 既存のエントリを更新
      const existing = this.hierarchyMap.get(id)!;
      existing.parentId = parentId;
    }
    
    // 親のchildIdsリストに追加
    if (parentId && this.hierarchyMap.has(parentId)) {
      const parent = this.hierarchyMap.get(parentId)!;
      if (!parent.childIds.includes(id)) {
        parent.childIds.push(id);
      }
    }
  }

  // 歌詞フレーズをロードして階層的なコンテナ構造を生成
  loadPhrases(phrases: PhraseUnit[], charPositions: Map<string, { x: number, y: number }>) {
    console.log('InstanceManager: loadPhrases開始', { 
      phrasesCount: phrases.length, 
      charPositionsSize: charPositions.size 
    });
    
    // 既存のインスタンスをクリア
    this.clearAllInstances();
    
    // マップをクリア
    this.phraseInstances.clear();
    this.wordInstances.clear();
    this.charInstances.clear();
    this.hierarchyMap.clear();

    // Loadingログを制限
    
    // フレーズレベルのコンテナとインスタンスを作成
    phrases.forEach((phrase) => {
      const phraseInstance = this.createPhraseInstance(phrase);
      
      if (phraseInstance) {
        // 単語レベルのコンテナとインスタンスを作成
        phrase.words.forEach((word, wordIndex) => {
          const wordInstance = this.createWordInstance(word, phrase.id, wordIndex, phrase.words.length);
          
          if (wordInstance) {
            // 文字レベルのコンテナとインスタンスを作成
            word.chars.forEach((char) => {
              const pos = charPositions.get(char.id);
              if (pos) {
                this.createCharInstance(char, pos.x, pos.y, word.id);
              } else {
                console.warn(`Position not found for char: ${char.id}`);
              }
            });
          }
        });
      }
    });
    
    // サマリーログを制限
    console.log('InstanceManager: loadPhrases完了', {
      phraseInstancesCount: this.phraseInstances.size,
      wordInstancesCount: this.wordInstances.size,
      charInstancesCount: this.charInstances.size
    });
  }

  // フレーズインスタンスを作成
  private createPhraseInstance(phrase: PhraseUnit) {
    try {
      // テンプレートマネージャーがあれば、そこからテンプレートを取得
      let template = this.template;
      let params = { ...this.defaultParams };
      
      if (this.templateManager && this.parameterManager) {
        template = this.templateManager.getTemplateForObject(phrase.id);
        params = this.parameterManager.getEffectiveParams(phrase.id, this.templateManager.getDefaultTemplateId());
      }
      
      // フレーズコンテナを作成
      const phraseContainer = new PIXI.Container();
      this.mainContainer.addChild(phraseContainer);
      
      // パラメータにIDと単語データを追加
      params = {
        ...params,
        id: phrase.id,
        words: phrase.words.map(word => ({
          id: word.id,
          word: word.word,
          start: word.start,
          end: word.end
        }))
      };
      
      // フレーズインスタンスを作成
      const phraseInstance = new AnimationInstance(
        phrase.id,
        template,
        phrase.phrase,
        0, 0,
        params,
        phrase.start,
        phrase.end,
        phraseContainer,
        'phrase'
      );
      
      // 各マップに保存
      this.instances.set(phrase.id, phraseInstance);
      this.phraseInstances.set(phrase.id, phraseInstance);
      
      // 階層関係を記録
      this.addHierarchyRelation(phrase.id, null);
      
      return phraseInstance;
    } catch (error) {
      console.error(`Error creating phrase instance for ${phrase.id}:`, error);
      return null;
    }
  }

  // 単語インスタンスを作成
  private createWordInstance(word: WordUnit, phraseId: string, wordIndex: number, totalWords: number) {
    try {
      // 親フレーズのコンテナを取得
      const phraseInstance = this.phraseInstances.get(phraseId);
      if (!phraseInstance) {
        console.error(`親フレーズインスタンスが見つかりません: ${word.id}のためのフレーズ${phraseId}`);
        return null;
      }
      
      // 親コンテナに名前を設定して調査のためのデバッグ情報を追加
      (phraseInstance.container as any).name = `phrase_container_${phraseId}`;
      
      // 単語コンテナを作成
      const wordContainer = new PIXI.Container();
      (wordContainer as any).name = `word_container_${word.id}`; // デバッグ用に名前を付ける
      
      // 重要: 単語コンテナを親フレーズコンテナに追加
      phraseInstance.container.addChild(wordContainer);
      
      // 親の変換行列を明示的に更新
      phraseInstance.container.updateTransform();
      wordContainer.updateTransform();

      // テンプレート継承ロジックの改善
      let template = this.template;
      let params = { ...this.defaultParams };
      
      if (this.templateManager && this.parameterManager) {
        // 単語レベルのテンプレートを取得（フレーズからの継承を含む）
        template = this.templateManager.getTemplateForObject(word.id);
        params = this.parameterManager.getEffectiveParams(word.id, this.templateManager.getDefaultTemplateId());
        
        // デバッグログは完全に無効化
        // if (import.meta.env.DEV && word.id.endsWith('_0')) {
        //   console.log(`単語インスタンス作成: ${word.id}, 継承テンプレート: ${template === this.templateManager.getTemplateForObject(phraseId) ? 'フレーズから継承' : '独自'}`);
        // }
      }
      
      // 単語レベルのパラメータを取得とフレーズ情報を追加
      const wordParams = {
        ...this.defaultParams,
        ...(word.params || {}),
        id: word.id, // IDを明示的に設定
        chars: word.chars, // 文字データを渡す
        wordIndex: wordIndex, // 単語インデックスを追加
        totalWords: totalWords, // 総単語数を追加
        // フレーズ情報を単語パラメータに追加
        phrasePhase: null, // ランタイムで設定される
        phraseStartMs: phraseInstance.startMs,
        phraseEndMs: phraseInstance.endMs
      };
      
      // 単語インスタンスを作成
      const wordInstance = new AnimationInstance(
        word.id,
        template, // フェーズ1ではフレーズから継承したテンプレートを使用
        word.word,
        0, 0, // 相対位置
        wordParams,
        word.start,
        word.end,
        wordContainer,
        'word' // 階層タイプ
      );
      
      // 設定後の親子関係のエラーチェックのみ
      if (!wordContainer.parent) {
        console.error(`エラー: 単語コンテナに親がありません。`);
      }
      
      // 各マップに保存
      this.instances.set(word.id, wordInstance);
      this.wordInstances.set(word.id, wordInstance);
      
      // 階層関係を記録
      this.addHierarchyRelation(word.id, phraseId);
      
      return wordInstance;
    } catch (error) {
      console.error(`Error creating word instance for ${word.id}:`, error);
      return null;
    }
  }

  // 文字インスタンスを作成
  private createCharInstance(char: CharUnit, x: number, y: number, wordId: string) {
    try {
      // 親単語のコンテナを取得
      const wordInstance = this.wordInstances.get(wordId);
      if (!wordInstance) {
        console.error(`Parent word instance not found for char: ${char.id}`);
        return null;
      }
      
      // 文字コンテナを作成
      const charContainer = new PIXI.Container();
      // 重要: 文字コンテナに明示的に名前を設定
      (charContainer as any).name = `char_container_${char.id}`;
      
      // 文字コンテナを親単語コンテナに追加
      wordInstance.container.addChild(charContainer);
      
      // 変換行列を明示的に更新
      charContainer.updateTransform();
      
      // テンプレート継承ロジックの改善
      let template = this.template;
      let params = { ...this.defaultParams };
      
      if (this.templateManager && this.parameterManager) {
        // 文字レベルのテンプレートを取得（階層継承を含む）
        template = this.templateManager.getTemplateForObject(char.id);
        params = this.parameterManager.getEffectiveParams(char.id, this.templateManager.getDefaultTemplateId());
        
        // デバッグログは完全に無効化
        // if (import.meta.env.DEV && char.id.endsWith('_char_0')) {
        //   const phraseId = this.getParentObjectId(wordId);
        //   const phraseTemplate = phraseId ? this.templateManager.getTemplateForObject(phraseId) : null;
        //   console.log(`文字インスタンス作成: ${char.id}, テンプレート継承: ${template === phraseTemplate ? 'フレーズから継承' : '独自'}`);
        // }
      }
      
      // 文字レベルのパラメータを取得し、フレーズ情報を追加
      const charParams = {
        ...this.defaultParams,
        ...(char.params || {}),
        id: char.id, // IDを明示的に設定
        // 文字カウント情報をパラメータに追加
        charIndex: char.charIndex,
        totalChars: char.totalChars,
        totalWords: char.totalWords,
        // 親単語からフレーズ情報を継承
        phrasePhase: null, // ランタイムで設定される
        phraseStartMs: wordInstance.params.phraseStartMs,
        phraseEndMs: wordInstance.params.phraseEndMs
      };
      
      // 文字インスタンスを作成
      const charInstance = new AnimationInstance(
        char.id,
        template, // フェーズ1ではフレーズから継承したテンプレートを使用
        char.char,
        x,
        y,
        charParams,
        char.start,
        char.end,
        charContainer,
        'char' // 階層タイプ
      );
      
      // 各マップに保存
      this.instances.set(char.id, charInstance);
      this.charInstances.set(char.id, charInstance);
      
      // 階層関係を記録
      this.addHierarchyRelation(char.id, wordId);
      
      return charInstance;
    } catch (error) {
      console.error(`Error creating char instance for ${char.id}:`, error);
      return null;
    }
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
  
  // 子要素IDを取得するヘルパーメソッド
  private getChildrenIds(parentId: string): string[] {
    const children: string[] = [];
    
    // 階層関係から子要素を特定
    for (const [childId, relation] of this.hierarchyMap.entries()) {
      if (relation.parentId === parentId) {
        children.push(childId);
      }
    }
    
    return children;
  }
  
  // オブジェクトとその子要素を再帰的に更新（改善版）
  updateInstanceAndChildren(objectId: string): void {
    if (!this.templateManager || !this.parameterManager) {
      console.warn('TemplateManager または ParameterManager が未設定のため、インスタンス更新をスキップします');
      return;
    }
    
    console.log(`=== 階層更新開始: ${objectId} ===`);
    
    // 対象インスタンスを取得
    const instance = this.instances.get(objectId);
    if (!instance) {
      console.warn(`インスタンスが見つかりません: ${objectId}`);
      return;
    }
    
    // テンプレートとパラメータを取得 - 階層継承を考慮
    const template = this.templateManager.getTemplateForObject(objectId);
    const params = this.parameterManager.getEffectiveParams(
      objectId, 
      this.templateManager.getDefaultTemplateId()
    );
    
    // テンプレート継承情報をログ出力
    const directAssignment = this.templateManager.getAssignments().has(objectId);
    const parentId = this.getParentObjectId(objectId);
    const inheritedFromParent = !directAssignment && parentId && this.templateManager.getAssignments().has(parentId);
    
    console.log(`インスタンス更新: ${objectId} (${instance.hierarchyType})`);
    console.log(`  - 直接割り当て: ${directAssignment ? '有' : '無'}`);
    console.log(`  - 親から継承: ${inheritedFromParent ? '有' : '無'}`);
    console.log(`  - 使用テンプレート: ${template === this.templateManager.getTemplateById(this.templateManager.getDefaultTemplateId()) ? 'デフォルト' : '個別設定'}`);
    
    // インスタンスを更新
    const previousTemplateId = instance.template === this.templateManager.getTemplateById(this.templateManager.getDefaultTemplateId()) ? 'default' : 'custom';
    instance.template = template;
    instance.params = { ...instance.params, ...params, id: objectId }; // IDを確実に設定
    
    console.log(`  - テンプレート更新: ${previousTemplateId} -> 新テンプレート`);
    console.log(`  - パラメータ更新: ${Object.keys(params).length}個のパラメータ`);
    
    // 子要素を更新 - 階層関係から子要素を特定して再帰的に更新
    const childrenIds = this.getChildrenIds(objectId);
    console.log(`${objectId} の子要素: [${childrenIds.join(', ')}]`);
    
    for (const childId of childrenIds) {
      this.updateInstanceAndChildren(childId);
    }
    
    console.log(`=== 階層更新完了: ${objectId} ===`);
  }
  
  // ひとつのオブジェクトのみ更新するメソッドを修正
  updateSingleInstance(objectId: string): boolean {
    try {
      // オブジェクトとその子要素を再帰的に更新
      this.updateInstanceAndChildren(objectId);
      return true;
    } catch (error) {
      console.error(`インスタンス更新エラー (${objectId}):`, error);
      return false;
    }
  }

  // 階層的な更新処理
  update(nowMs: number) {
    console.log('InstanceManager: update開始', { 
      currentTime: nowMs,
      totalInstances: this.instances.size,
      phraseInstances: this.phraseInstances.size,
      wordInstances: this.wordInstances.size,
      charInstances: this.charInstances.size
    });
    
    this.activeInstances.clear();
    let activeCount = 0;
    
    // ヘッドタイムとテールタイムの最大値を取得
    const maxHeadTime = this.getMaxHeadTime();
    const maxTailTime = this.getMaxTailTime();
    
    try {
      // 単語レベルの処理状況を確認
      let wordProcessed = 0;
      let wordActive = 0;

      // まず文字レベルの更新
      this.charInstances.forEach(instance => {
        if (this.isInstanceInTimeRange(instance, nowMs, maxHeadTime, maxTailTime)) {
          instance.update(nowMs);
          this.activeInstances.add(instance.id);
          activeCount++;
        } else {
          instance.hideOutOfRange();
        }
      });
      
      // 次に単語レベルの更新
      this.wordInstances.forEach(instance => {
        wordProcessed++;
        if (this.isInstanceInTimeRange(instance, nowMs, maxHeadTime, maxTailTime)) {
          const result = instance.update(nowMs);
          wordActive++;
          this.activeInstances.add(instance.id);
          activeCount++;
        } else {
          instance.hideOutOfRange();
        }
      });
      
      // 単語処理状況は過度にログ出力しないよう削除
      
      // 最後にフレーズレベルの更新
      this.phraseInstances.forEach(instance => {
        if (this.isInstanceInTimeRange(instance, nowMs, maxHeadTime, maxTailTime)) {
          instance.update(nowMs);
          this.activeInstances.add(instance.id);
          activeCount++;
        } else {
          instance.hideOutOfRange();
        }
      });
      
    } catch (error) {
      console.error(`Error during update at ${nowMs}ms:`, error);
    }
    
    console.log('InstanceManager: update完了', { 
      activeInstances: activeCount,
      activeInstancesSize: this.activeInstances.size
    });
  }
  
  // インスタンスが表示期間内かどうかを判定
  private isInstanceInTimeRange(
    instance: AnimationInstance,
    nowMs: number,
    maxHeadTime: number,
    maxTailTime: number
  ): boolean {
    // パラメータから個別のヘッドタイムとテールタイムを取得
    const headTime = instance.params.headTime !== undefined ? instance.params.headTime : maxHeadTime;
    const tailTime = instance.params.tailTime !== undefined ? instance.params.tailTime : maxTailTime;
    
    // 単語コンテナの場合、フレーズの時間範囲を使用
    if (instance.hierarchyType === 'word' && instance.params.phraseStartMs && instance.params.phraseEndMs) {
      // 単語コンテナはフレーズの時間範囲に依存して表示される
      return nowMs >= instance.params.phraseStartMs - headTime && nowMs <= instance.params.phraseEndMs + tailTime;
    }
    
    // 文字コンテナの場合もフレーズの時間範囲を使用
    if (instance.hierarchyType === 'char' && instance.params.phraseStartMs && instance.params.phraseEndMs) {
      // 文字コンテナもフレーズの時間範囲に依存して表示される
      return nowMs >= instance.params.phraseStartMs - headTime && nowMs <= instance.params.phraseEndMs + tailTime;
    }
    
    // フレーズコンテナの場合、自身の時間範囲を使用
    return nowMs >= instance.startMs - headTime && nowMs <= instance.endMs + tailTime;
  }
  
  // テンプレートメタデータからヘッドタイムの最大値を取得
  private getMaxHeadTime(): number {
    let maxHeadTime = 500;  // デフォルト値
    
    if (typeof this.template.getParameterConfig === 'function') {
      const params = this.template.getParameterConfig();
      const headTimeParam = params.find(p => p.name === 'headTime');
      if (headTimeParam && headTimeParam.default !== undefined) {
        maxHeadTime = headTimeParam.default;
      }
    } else {
      throw new Error(`Template ${this.template.constructor.name} must implement getParameterConfig() method`);
    }
    
    return maxHeadTime;
  }
  
  // テンプレートメタデータからテールタイムの最大値を取得
  private getMaxTailTime(): number {
    let maxTailTime = 500;  // デフォルト値
    
    if (typeof this.template.getParameterConfig === 'function') {
      const params = this.template.getParameterConfig();
      const tailTimeParam = params.find(p => p.name === 'tailTime');
      if (tailTimeParam && tailTimeParam.default !== undefined) {
        maxTailTime = tailTimeParam.default;
      }
    } else {
      throw new Error(`Template ${this.template.constructor.name} must implement getParameterConfig() method`);
    }
    
    return maxTailTime;
  }

  // インスタンスの位置を更新
  updatePositions(charPositions: Map<string, { x: number, y: number }>) {
    for (const [id, instance] of this.charInstances.entries()) {
      const pos = charPositions.get(id);
      if (pos) {
        instance.x = pos.x;
        instance.y = pos.y;
      }
    }
  }

  // 指定したインスタンスの時間を更新
  updateInstanceTime(id: string, newStart: number, newEnd: number) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.startMs = newStart;
      instance.endMs = newEnd;
      this.throttledLog(`InstanceManager: インスタンス時間更新 ${id} ${newStart}-${newEnd}ms`);
    } else {
      console.warn(`InstanceManager: 更新対象のインスタンスが見つかりません: ${id}`);
    }
  }

  // 既存インスタンスのプロパティのみ更新（配置に影響しないパラメータ変更時）
  updateExistingInstances() {
    // 各インスタンスのテンプレートパラメータを更新
    for (const [id, instance] of this.instances.entries()) {
      if (instance.template && this.parameterManager) {
        // 現在のパラメータを取得してインスタンスに反映
        const templateId = this.templateManager?.getDefaultTemplateId() || 'default';
        const params = this.parameterManager.getEffectiveParams(instance.objectId, templateId);
        instance.params = { ...instance.params, ...params };
      }
    }
    console.log('InstanceManager: 既存インスタンスのパラメータを更新しました');
  }

  // すべてのインスタンスをクリア
  clearAllInstances() {
    for (const instance of this.instances.values()) {
      instance.destroy();
    }
    this.instances.clear();
    this.activeInstances.clear();
    this.phraseInstances.clear();
    this.wordInstances.clear();
    this.charInstances.clear();
    this.hierarchyMap.clear();
    this.mainContainer.removeChildren();
  }

  // テンプレートを更新（歌詞データを保持）（改善版）
  updateTemplate(template: IAnimationTemplate, params: Record<string, any> = {}) {
    try {
      console.log('InstanceManager: updateTemplateが呼び出されました - テンプレートのみ更新し、歌詞データを保持');
      
      if (!template) {
        console.error('InstanceManager: updateTemplateに渡されたtemplateがnull/undefinedです');
        return false;
      }
      
      this.template = template;
      this.defaultParams = { ...this.defaultParams, ...params };
      
      // テンプレートマネージャーが設定されている場合は、個別テンプレート割り当てを考慮
      if (this.templateManager && this.parameterManager) {
        console.log('InstanceManager: テンプレートマネージャーが存在するため、個別割り当てを考慮した更新を実行');
        
        // 個別割り当てを考慮した更新
        let updateCount = 0;
        for (const [instanceId, instance] of this.instances.entries()) {
          // 個別に割り当てられたテンプレートを取得
          const assignedTemplate = this.templateManager.getTemplateForObject(instanceId);
          const effectiveParams = this.parameterManager.getEffectiveParams(
            instanceId, 
            this.templateManager.getDefaultTemplateId()
          );
          
          // デバッグ：phrase_2の場合のみパラメータをログ出力
          if (instanceId === 'phrase_2') {
            console.log(`[InstanceManager Debug] phrase_2 effectiveParams:`, effectiveParams);
          }
          
          // インスタンスを更新
          instance.template = assignedTemplate;
          instance.params = { ...instance.params, ...effectiveParams, id: instanceId };
          
          updateCount++;
        }
        
        console.log(`InstanceManager: ${updateCount}個のインスタンスを個別テンプレート考慮で更新完了`);
      } else {
        console.log('InstanceManager: テンプレートマネージャーが未設定のため、従来の更新処理を実行');
        
        // 従来の更新処理（全インスタンスに同じテンプレートを適用）
        let updateCount = 0;
        for (const instance of this.instances.values()) {
          instance.template = template;
          
          // オブジェクト固有のパラメータを保持しつつ、デフォルトパラメータを更新
          const instanceParamsBeforeUpdate = { ...instance.params };
          const instanceCustomParams = {};
          
          // オブジェクト固有の設定のみを抽出
          for (const [key, value] of Object.entries(instanceParamsBeforeUpdate)) {
            if (this.defaultParams[key] !== value) {
              instanceCustomParams[key] = value;
            }
          }
          
          // デフォルトパラメータを適用し、カスタムパラメータで上書き
          instance.params = { ...this.defaultParams, ...instanceCustomParams };
          
          updateCount++;
        }
        
        console.log(`InstanceManager: ${updateCount}個のインスタンスのテンプレートを従来方法で更新完了`);
      }
      
      return true;
    } catch (error) {
      console.error('InstanceManager: updateTemplate処理中にエラーが発生しました', error);
      return false;
    }
  }

  // デフォルトパラメータを取得するメソッド
  getDefaultParams(): Record<string, any> {
    return this.defaultParams;
  }
  
  // アクティブなインスタンスのIDセットを取得
  getActiveInstances(): Set<string> {
    return new Set(this.activeInstances);
  }
  
  /**
   * 全てのインスタンスを取得
   * @returns AnimationInstanceの配列
   */
  getAllInstances(): AnimationInstance[] {
    return Array.from(this.instances.values());
  }
  
  /**
   * 文字レベルのインスタンスを取得
   * @returns 文字レベルのインスタンスのMap
   */
  getCharInstances(): Map<string, AnimationInstance> {
    return this.charInstances;
  }
  
  /**
   * フレーズレベルのインスタンスを取得
   * @returns フレーズレベルのインスタンスのMap
   */
  getPhraseInstances(): Map<string, AnimationInstance> {
    return this.phraseInstances;
  }
  
  // メインコンテナを取得するメソッド（動画出力用）
  getMainContainer(): PIXI.Container {
    return this.mainContainer;
  }
  
  /**
   * メインコンテナにスケーリングを適用
   * @param scale スケール係数
   */
  setMainContainerScale(scale: number): void {
    console.log(`InstanceManager: メインコンテナにスケール適用 (${scale})`); 
    
    if (this.mainContainer) {
      // 元の位置とスケールを記録
      const originalScale = `(${this.mainContainer.scale.x}, ${this.mainContainer.scale.y})`;
      const originalPosition = `(${this.mainContainer.position.x}, ${this.mainContainer.position.y})`;
      
      // コンテナにスケール適用
      this.mainContainer.scale.set(scale, scale);
      
      console.log(`InstanceManager: スケール適用前=${originalScale}, 適用後=(${this.mainContainer.scale.x}, ${this.mainContainer.scale.y})`); 
      console.log(`InstanceManager: 位置=${originalPosition} -> (${this.mainContainer.position.x}, ${this.mainContainer.position.y})`); 
    } else {
      console.warn('InstanceManager: mainContainerが存在しないためスケーリングを適用できません');
    }
  }
  
  // テンプレート割り当て情報の更新メソッド追加
  updateTemplateAssignments(templateManager: TemplateManager, parameterManager: ParameterManager): void {
    this.templateManager = templateManager;
    this.parameterManager = parameterManager;
  }
  
}

export default InstanceManager;