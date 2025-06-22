import { PhraseUnit } from '../types/types';
import { ProjectState } from '../engine/ProjectStateManager';
import { unifiedFileManager } from './UnifiedFileManager';
import { Engine } from '../engine/Engine';
import { DebugEventBus } from '../utils/DebugEventBus';
import { calculateCharacterIndices } from '../utils/characterIndexCalculator';

// プロジェクトファイルのメタデータ
export interface ProjectMetadata {
  projectName: string;
  createdAt: string;
  modifiedAt: string;
}

// 音楽ファイル参照
export interface AudioReference {
  fileName: string;
  duration: number;
}

// プロジェクトファイルデータ構造
export interface ProjectFileData {
  version: string;
  metadata: ProjectMetadata;
  audio: AudioReference;
  lyricsData: PhraseUnit[];
  globalTemplateId: string;
  globalParams: Record<string, any>;
  objectParams: Record<string, Record<string, any>>;
  backgroundColor?: string;
  // アクティベーション情報
  activatedObjects?: string[];
  // 後方互換性のため（読み込み時のみ使用）
  defaultTemplateId?: string;
  templateAssignments?: Record<string, string>;
}

// バリデーション結果
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * プロジェクトファイルの管理を行うクラス
 */
export class ProjectFileManager {
  private static readonly CURRENT_VERSION = '0.1.0';
  private static readonly FILE_EXTENSION = '.vbl';
  
  constructor(private engine: Engine) {}

  /**
   * プロジェクトデータを取得（保存用）
   * @param fileName ファイル名（拡張子なし）
   */
  getProjectData(fileName?: string): ProjectFileData {
    return this.buildProjectData(fileName || 'project');
  }
  
  /**
   * プロジェクトデータを読み込み（Electron経由など）
   * @param projectData プロジェクトデータ
   */
  async loadProjectData(projectData: ProjectFileData): Promise<void> {
    // バリデーション
    const validation = this.validateProjectData(projectData);
    if (!validation.isValid) {
      throw new Error(`無効なプロジェクトファイル: ${validation.errors.join(', ')}`);
    }
    
    // 文字インデックスを計算
    const lyricsWithIndices = calculateCharacterIndices(projectData.lyricsData);
    
    // エンジンに歌詞データを設定
    this.engine.loadLyrics(lyricsWithIndices);
    
    // グローバルテンプレートIDを取得（後方互換性対応）
    const globalTemplateId = projectData.globalTemplateId || projectData.defaultTemplateId || 'FadeSlideText';
    
    // プロジェクト状態を復元
    const state: Partial<ProjectState> = {
      lyricsData: lyricsWithIndices,
      defaultTemplateId: globalTemplateId,
      globalParams: projectData.globalParams,
      templateAssignments: {},  // 新しい形式ではobjectParamsにtemplateIdが含まれる
      objectParams: projectData.objectParams,
      backgroundColor: projectData.backgroundColor,
      audioFileName: projectData.audio.fileName,
      audioFileDuration: projectData.audio.duration,
      activatedObjects: projectData.activatedObjects || []
    };
    
    // グローバルテンプレートを設定
    this.engine.getTemplateManager().setDefaultTemplateId(globalTemplateId);
    
    // パラメータを復元（アクティベーション情報を含む）
    this.engine.getParameterManager().importParameters({
      global: projectData.globalParams,
      objects: projectData.objectParams,
      activatedObjects: projectData.activatedObjects || []
    });
    console.log('ProjectFileManager: パラメータを復元 (アクティベーション情報含む)');
    
    this.engine.getStateManager().importState(state);
    
    // objectParamsからテンプレート割り当てを復元
    for (const [objectId, params] of Object.entries(projectData.objectParams)) {
      const templateId = params.templateId;
      
      if (templateId && templateId !== '__global__') {
        // 個別テンプレートが指定されている場合
        this.engine.getTemplateManager().assignTemplate(objectId, templateId);
      }
    }
    
    // 背景色を復元
    if (projectData.backgroundColor) {
      this.engine.setBackgroundColor(projectData.backgroundColor);
    }
    
    // 音楽ファイル要求イベントを発行
    DebugEventBus.emit('request-audio-file', {
      fileName: projectData.audio.fileName,
      duration: projectData.audio.duration
    });
    
    // プロジェクトロードイベント発行
    window.dispatchEvent(new CustomEvent('project-loaded', { 
      detail: { globalTemplateId }
    }));
    
    // タイムライン更新イベントを発火（アクティベーション状態の反映のため）
    window.dispatchEvent(new CustomEvent('timeline-updated', {
      detail: { lyrics: this.engine.phrases }
    }));
    
    DebugEventBus.emit('project-loaded', { 
      fileName: projectData.metadata.projectName,
      globalTemplateId
    });
  }

  /**
   * プロジェクトをファイルに保存（エレクトロン専用）
   * @param fileName ファイル名（拡張子なし）
   */
  async saveProject(fileName: string): Promise<string> {
    try {
      // プロジェクトデータを構築
      const projectData = this.buildProjectData(fileName);
      
      // デバッグ情報を出力
      console.log('ProjectFileManager: 保存データ', {
        globalTemplateId: projectData.globalTemplateId,
        objectParamsCount: Object.keys(projectData.objectParams).length,
        sampleObjectParams: Object.entries(projectData.objectParams).slice(0, 3)
      });
      
      // エレクトロンのファイル保存APIを使用
      const filePath = await unifiedFileManager.saveProject(projectData);
      
      // 保存成功時に自動保存データをクリア
      await this.engine.clearAutoSave();
      
      // デバッグイベント発行
      DebugEventBus.emit('project-saved', { fileName: filePath });
      
      return filePath;
    } catch (error) {
      console.error('Project save error:', error);
      throw new Error(`プロジェクトの保存に失敗しました: ${error}`);
    }
  }

  /**
   * プロジェクトファイルを読み込み（エレクトロン専用）
   */
  async loadProject(): Promise<void> {
    try {
      // エレクトロンのファイル読み込みAPIを使用
      const projectData = await unifiedFileManager.loadProject();
      
      // バリデーション
      const validation = this.validateProjectData(projectData);
      if (!validation.isValid) {
        throw new Error(`無効なプロジェクトファイル: ${validation.errors.join(', ')}`);
      }
      
      // 文字インデックスを計算
      const lyricsWithIndices = calculateCharacterIndices(projectData.lyricsData);
      
      // エンジンに歌詞データを設定
      this.engine.loadLyrics(lyricsWithIndices);
      
      // グローバルテンプレートIDを取得（後方互換性対応）
      const globalTemplateId = projectData.globalTemplateId || projectData.defaultTemplateId || 'FadeSlideText';
      
      // プロジェクト状態を復元
      const state: Partial<ProjectState> = {
        lyricsData: lyricsWithIndices,
        defaultTemplateId: globalTemplateId,
        globalParams: projectData.globalParams,
        templateAssignments: {},  // 新しい形式ではobjectParamsにtemplateIdが含まれる
        objectParams: projectData.objectParams,
        backgroundColor: projectData.backgroundColor,
        audioFileName: projectData.audio.fileName,
        audioFileDuration: projectData.audio.duration,
        activatedObjects: projectData.activatedObjects || []
      };
      
      // グローバルテンプレートを設定
      this.engine.getTemplateManager().setDefaultTemplateId(globalTemplateId);
      
      // パラメータを復元（アクティベーション情報を含む）
      this.engine.getParameterManager().importParameters({
        global: projectData.globalParams,
        objects: projectData.objectParams,
        activatedObjects: projectData.activatedObjects || []
      });
      console.log('ProjectFileManager: パラメータを復元 (アクティベーション情報含む)');
      
      this.engine.getStateManager().importState(state);
      
      // objectParamsからテンプレート割り当てを復元
      for (const [objectId, params] of Object.entries(projectData.objectParams)) {
        const templateId = params.templateId;
        
        if (templateId && templateId !== '__global__') {
          // 個別テンプレートが指定されている場合
          this.engine.getTemplateManager().assignTemplate(objectId, templateId);
        }
      }
      
      // 後方互換性：旧形式のtemplateAssignmentsがある場合の処理
      if (projectData.templateAssignments) {
        for (const [objectId, templateId] of Object.entries(projectData.templateAssignments)) {
          if (templateId && templateId !== projectData.defaultTemplateId) {
            this.engine.getTemplateManager().assignTemplate(objectId, templateId);
          }
        }
      }
      
      // 背景色を設定
      if (projectData.backgroundColor) {
        this.engine.setBackgroundColor(projectData.backgroundColor);
      }
      
      // 音楽ファイルの再読み込みを促す
      if (projectData.audio.fileName) {
        DebugEventBus.emit('request-audio-file', {
          fileName: projectData.audio.fileName,
          duration: projectData.audio.duration
        });
      }
      
      // グローバルテンプレートを実際に適用
      if (globalTemplateId && globalTemplateId !== 'default') {
        // テンプレートレジストリからテンプレートを取得
        const { getTemplateById } = await import('../templates/registry/templateRegistry');
        const globalTemplate = getTemplateById(globalTemplateId);
        
        if (globalTemplate) {
          // テンプレートをエンジンに適用
          this.engine.changeTemplate(globalTemplate, projectData.globalParams || {}, globalTemplateId);
          console.log('ProjectFileManager: グローバルテンプレートを適用:', globalTemplateId);
        } else {
          console.warn('ProjectFileManager: テンプレートが見つかりません:', globalTemplateId);
        }
      }
      
      // デバッグイベント発行
      DebugEventBus.emit('project-loaded', { 
        fileName: projectData.metadata.projectName,
        phraseCount: projectData.lyricsData.length,
        globalTemplateId: globalTemplateId,
        globalParams: projectData.globalParams
      });
      
      // UI更新のためのイベントを発火
      window.dispatchEvent(new CustomEvent('template-loaded', {
        detail: {
          templateId: globalTemplateId,
          params: projectData.globalParams
        }
      }));
      
      // 文字配置の再計算を実行（背景タブ選択時と同じ処理）
      // テンプレート適用が完了してから実行されるように遅延を設定
      setTimeout(() => {
        if (this.engine && this.engine.app && this.engine.app.renderer) {
          console.log('ProjectFileManager: ロード後の文字配置を再計算します');
          // 背景タブでのアスペクト比変更時と同じ処理を実行
          this.engine.arrangeCharsOnStage();
          if (this.engine.instanceManager) {
            this.engine.instanceManager.loadPhrases(this.engine.phrases, this.engine.charPositions);
            this.engine.instanceManager.update(this.engine.currentTime);
          }
          console.log('ProjectFileManager: 文字配置の再計算が完了しました');
        }
      }, 300); // テンプレート適用完了を待つため遅延を延長
      
      // プロジェクトロード完了イベントを発火
      window.dispatchEvent(new CustomEvent('project-loaded', {
        detail: {
          projectName: projectData.metadata.projectName,
          lyricsData: projectData.lyricsData,
          globalTemplateId: globalTemplateId,
          objectParams: projectData.objectParams
        }
      }));
    } catch (error) {
      console.error('Project load error:', error);
      throw new Error(`プロジェクトの読み込みに失敗しました: ${error}`);
    }
  }

  /**
   * プロジェクトデータを構築
   */
  private buildProjectData(projectName: string): ProjectFileData {
    const state = this.engine.getStateManager().exportFullState();
    console.log('ProjectFileManager: buildProjectData - 取得した状態', {
      lyricsDataLength: state.lyricsData?.length,
      lyricsDataSample: state.lyricsData?.slice(0, 1), // 最初のフレーズだけ表示
      timestamp: state.timestamp
    });
    
    // Engineから直接歌詞データも取得して比較
    const engineLyrics = this.engine.getTimelineData().lyrics;
    console.log('ProjectFileManager: Engine直接取得の歌詞データ', {
      engineLyricsLength: engineLyrics?.length,
      engineLyricsSample: engineLyrics?.slice(0, 1)
    });
    
    const now = new Date().toISOString();
    const templateManager = this.engine.getTemplateManager();
    const globalTemplateId = templateManager.getDefaultTemplateId();
    
    // デバッグ: グローバルテンプレートIDを確認
    console.log('ProjectFileManager: globalTemplateId =', globalTemplateId);
    
    // objectParamsにtemplateIdを追加
    const enhancedObjectParams: Record<string, Record<string, any>> = {};
    
    // 歌詞データから全てのオブジェクトIDを収集してテンプレートIDを設定
    if (state.lyricsData) {
      for (const phrase of state.lyricsData) {
        // フレーズレベル
        const phraseTemplate = templateManager.getTemplateForObject(phrase.id);
        const phraseTemplateId = this.getTemplateIdForObject(phrase.id, phraseTemplate, templateManager, globalTemplateId);
        
        enhancedObjectParams[phrase.id] = {
          ...(state.objectParams[phrase.id] || {}),
          templateId: phraseTemplateId
        };
        
        // 単語レベル
        phrase.words.forEach((word, wordIndex) => {
          const wordId = `${phrase.id}_word_${wordIndex}`;
          const wordTemplate = templateManager.getTemplateForObject(wordId);
          const wordTemplateId = this.getTemplateIdForObject(wordId, wordTemplate, templateManager, globalTemplateId);
          
          if (wordTemplateId !== '__global__' || state.objectParams[wordId]) {
            enhancedObjectParams[wordId] = {
              ...(state.objectParams[wordId] || {}),
              templateId: wordTemplateId
            };
          }
          
          // 文字レベル
          word.chars.forEach((char, charIndex) => {
            const charId = `${wordId}_char_${charIndex}`;
            const charTemplate = templateManager.getTemplateForObject(charId);
            const charTemplateId = this.getTemplateIdForObject(charId, charTemplate, templateManager, globalTemplateId);
            
            if (charTemplateId !== '__global__' || state.objectParams[charId]) {
              enhancedObjectParams[charId] = {
                ...(state.objectParams[charId] || {}),
                templateId: charTemplateId
              };
            }
          });
        });
      }
    }
    
    // パラメータマネージャーからアクティベーション情報を取得
    const paramExport = this.engine.getParameterManager().exportParameters();
    
    return {
      version: ProjectFileManager.CURRENT_VERSION,
      metadata: {
        projectName: projectName.replace(ProjectFileManager.FILE_EXTENSION, ''),
        createdAt: now,
        modifiedAt: now
      },
      audio: {
        fileName: state.audioFileName || '',
        duration: state.audioFileDuration || 0
      },
      lyricsData: engineLyrics || state.lyricsData || [], // Engineから直接取得を優先
      globalTemplateId: globalTemplateId,
      globalParams: state.globalParams,
      objectParams: enhancedObjectParams,
      backgroundColor: state.backgroundColor,
      activatedObjects: paramExport.activatedObjects || []
    };
  }
  
  /**
   * オブジェクトのテンプレートIDを取得（グローバルと同じ場合は'__global__'を返す）
   */
  private getTemplateIdForObject(
    objectId: string, 
    template: any, 
    templateManager: any, 
    globalTemplateId: string
  ): string {
    // テンプレートマネージャーから実際のテンプレートIDを取得
    const assignments = templateManager.getAssignments();
    
    // 直接割り当てがある場合はそのIDを使用
    if (assignments.has(objectId)) {
      return assignments.get(objectId);
    }
    
    // テンプレートがグローバルと同じ場合は'__global__'を返す
    const allTemplates = templateManager.getAllTemplates();
    const currentTemplateId = allTemplates.find(t => 
      templateManager.getTemplateById(t.id) === template
    )?.id;
    
    return currentTemplateId === globalTemplateId ? '__global__' : (currentTemplateId || '__global__');
  }

  /**
   * プロジェクトデータの検証
   */
  validateProjectData(data: any): ValidationResult {
    const errors: string[] = [];
    
    console.log('ProjectFileManager: プロジェクトデータの検証開始', {
      hasData: !!data,
      version: data?.version,
      lyricsDataLength: data?.lyricsData?.length,
      keys: data ? Object.keys(data) : []
    });
    
    // 必須フィールドのチェック（必要最小限に緩和）
    if (!data.version) {
      console.warn('ProjectFileManager: バージョン情報がありません。デフォルト値を設定します');
      data.version = ProjectFileManager.CURRENT_VERSION;
    }
    
    if (!data.metadata) {
      console.warn('ProjectFileManager: メタデータがありません。デフォルト値を設定します');
      data.metadata = {
        projectName: 'Imported Project',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      };
    }
    
    if (!data.lyricsData) {
      errors.push('歌詞データがありません');
    }
    
    // テンプレートIDのデフォルト設定
    if (!data.globalTemplateId && !data.defaultTemplateId) {
      console.warn('ProjectFileManager: テンプレートIDがありません。デフォルト値を設定します');
      data.globalTemplateId = 'fadeslidetext';
    }
    
    // 音楽ファイル情報のデフォルト設定
    if (!data.audio) {
      console.warn('ProjectFileManager: 音楽ファイル情報がありません。デフォルト値を設定します');
      data.audio = {
        fileName: 'no-audio',
        duration: 30000
      };
    }
    
    // グローバルパラメータのデフォルト設定
    if (!data.globalParams) {
      console.warn('ProjectFileManager: グローバルパラメータがありません。デフォルト値を設定します');
      data.globalParams = {};
    }
    
    // オブジェクトパラメータのデフォルト設定
    if (!data.objectParams) {
      console.warn('ProjectFileManager: オブジェクトパラメータがありません。デフォルト値を設定します');
      data.objectParams = {};
    }
    
    // バージョンチェック（警告のみ）
    if (data.version && !this.isVersionCompatible(data.version)) {
      console.warn(`ProjectFileManager: バージョン ${data.version} は想定バージョンと異なりますが、読み込みを継続します`);
    }
    
    // 歌詞データの検証（新しいフィールド名に対応）
    if (data.lyricsData && Array.isArray(data.lyricsData)) {
      for (const phrase of data.lyricsData) {
        // 新しいフィールド名（phrase, start, end）を基準として検証
        const hasNewFormat = phrase.phrase && typeof phrase.start === 'number' && typeof phrase.end === 'number';
        const hasOldFormat = phrase.text && typeof phrase.inTime === 'number' && typeof phrase.outTime === 'number';
        
        if (!phrase.id || (!hasNewFormat && !hasOldFormat)) {
          console.warn(`ProjectFileManager: 不正なフレーズデータを検出: ${phrase.id || 'unknown'}. 修正を試みます`);
          
          // データ修正の試み
          if (!phrase.id) phrase.id = `phrase_${Date.now()}`;
          
          // 新しい形式への統一（phrase, start, end）
          if (!phrase.phrase) {
            phrase.phrase = phrase.text || 'テキストなし'; // 旧形式から変換
          }
          if (typeof phrase.start !== 'number') {
            phrase.start = phrase.inTime || 0; // 旧形式から変換
          }
          if (typeof phrase.end !== 'number') {
            phrase.end = phrase.outTime || 1000; // 旧形式から変換
          }
          
          // 旧形式フィールドを削除（データクリーンアップ）
          delete phrase.text;
          delete phrase.inTime;
          delete phrase.outTime;
        } else if (hasOldFormat && !hasNewFormat) {
          // 旧形式のデータを新しい形式に変換
          console.log(`ProjectFileManager: 旧形式データを新形式に変換: ${phrase.id}`);
          phrase.phrase = phrase.text;
          phrase.start = phrase.inTime;
          phrase.end = phrase.outTime;
          
          // 旧形式フィールドを削除
          delete phrase.text;
          delete phrase.inTime;
          delete phrase.outTime;
        }
        
        // WordUnitとCharUnitの構造も検証
        if (phrase.words && Array.isArray(phrase.words)) {
          for (const word of phrase.words) {
            // WordUnitの新形式検証
            if (!word.id || !word.word || typeof word.start !== 'number' || typeof word.end !== 'number') {
              console.warn(`ProjectFileManager: 不正な単語データを検出: ${word.id || 'unknown'}. 修正を試みます`);
              
              if (!word.id) word.id = `word_${Date.now()}`;
              if (!word.word) word.word = word.text || 'unknown';
              if (typeof word.start !== 'number') word.start = word.inTime || 0;
              if (typeof word.end !== 'number') word.end = word.outTime || 1000;
              
              // 旧形式フィールドを削除
              delete word.text;
              delete word.inTime;
              delete word.outTime;
            }
            
            // CharUnitの検証
            if (word.chars && Array.isArray(word.chars)) {
              for (const char of word.chars) {
                if (!char.id || !char.char || typeof char.start !== 'number' || typeof char.end !== 'number') {
                  console.warn(`ProjectFileManager: 不正な文字データを検出: ${char.id || 'unknown'}. 修正を試みます`);
                  
                  if (!char.id) char.id = `char_${Date.now()}`;
                  if (!char.char) char.char = 'X';
                  if (typeof char.start !== 'number') char.start = char.inTime || 0;
                  if (typeof char.end !== 'number') char.end = char.outTime || 1000;
                  
                  // 旧形式フィールドを削除
                  delete char.inTime;
                  delete char.outTime;
                }
              }
            }
          }
        }
      }
    }
    
    const result = {
      isValid: errors.length === 0,
      errors
    };
    
    console.log('ProjectFileManager: プロジェクトデータの検証完了', {
      isValid: result.isValid,
      errorsCount: result.errors.length,
      errors: result.errors
    });
    
    return result;
  }

  /**
   * バージョン互換性チェック
   */
  private isVersionCompatible(version: string): boolean {
    // 現在は0.1.0のみサポート
    return version === ProjectFileManager.CURRENT_VERSION;
  }
}