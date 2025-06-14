import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAllTemplates, getTemplateById } from '../../templates/registry/templateRegistry';
import TemplateSelector from '../TemplatePanel/TemplateSelector';
import ParamEditor from '../ParamEditor/ParamEditor';
import Engine from '../../engine/Engine';
import { IAnimationTemplate } from '../../types/types';
import '../../styles/TemplateTab.css';

interface TemplateTabProps {
  selectedTemplate: string;
  onTemplateChange: (templateId: string) => void;
  engine?: Engine; // Engineインスタンスを受け取る
  template?: IAnimationTemplate; // 現在のテンプレート
}

// 設定モード
type EditorMode = 'global' | 'selection';

const TemplateTab: React.FC<TemplateTabProps> = ({
  selectedTemplate,
  onTemplateChange,
  engine,
  template
}) => {
  // テンプレート一覧を取得
  const templateList = getAllTemplates();
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [selectedObjectType, setSelectedObjectType] = useState<string>('');
  const [objectParams, setObjectParams] = useState<Record<string, any>>({});
  
  // 統合された状態管理
  const [state, setState] = useState({
    editorMode: 'global' as EditorMode,
    selectionTemplateMap: new Map<string, string>(),
    hasMixedTemplates: false,
    selectedPhraseTemplateId: 'fadeslidetext',
    selectedWordTemplateId: 'fadeslidetext', 
    selectedCharTemplateId: 'fadeslidetext',
    globalParams: {} as Record<string, any>,
    hasParamsChanged: false
  });

  // 状態更新ヘルパー関数
  const updateState = useCallback((updates: Partial<typeof state>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  
  // 前回のパラメータを記録するRef
  const prevParamsRef = useRef<Record<string, any>>({});
  
  // onTemplateChangeをメモ化
  const memoizedOnTemplateChange = useCallback(onTemplateChange, []);
  
  // タブフォーカス時に現在のエンジン状態を同期する関数
  const syncWithEngineState = useCallback(() => {
    if (!engine) return;
    
    // 現在のグローバルテンプレートIDをエンジンから取得して同期
    const currentTemplateId = engine.getTemplateManager().getDefaultTemplateId();
    if (currentTemplateId !== selectedTemplate) {
      // 親コンポーネントのselectedTemplateを更新
      memoizedOnTemplateChange(currentTemplateId);
    }
    
    // 現在のグローバルパラメータを読み込んで表示
    if (engine.parameterManager) {
      const currentParams = engine.parameterManager.getGlobalParams();
      
      // パラメータが実際に変更された場合のみ更新
      const paramsChanged = JSON.stringify(currentParams) !== JSON.stringify(prevParamsRef.current);
      if (paramsChanged) {
        prevParamsRef.current = currentParams;
        updateState({ globalParams: currentParams });
      }
    }
  }, [engine, selectedTemplate, memoizedOnTemplateChange]);
  
  // テンプレートタブが表示された時に現在のエンジン状態を同期
  useEffect(() => {
    // 初回マウント時と依存関係変更時に同期
    syncWithEngineState();
  }, [syncWithEngineState]);
  
  // タブがフォーカスされた時にも同期（手動で呼び出し可能にする）
  useEffect(() => {
    // タブ切り替えを検知するためのカスタムイベントリスナー
    const handleTabFocus = () => {
      console.log('TemplateTab: タブフォーカス検知、エンジン状態を同期');
      syncWithEngineState();
    };
    
    // カスタムイベントまたはMutationObserverでタブの表示を検知することも可能
    window.addEventListener('template-tab-focused', handleTabFocus);
    
    // プロジェクトロード時にも同期
    const handleProjectLoaded = () => {
      console.log('TemplateTab: プロジェクトロード検知、エンジン状態を同期');
      // 少し遅延を入れてエンジンの状態が完全に更新されるのを待つ
      setTimeout(() => {
        syncWithEngineState();
      }, 100);
    };
    window.addEventListener('project-loaded', handleProjectLoaded);
    
    return () => {
      window.removeEventListener('template-tab-focused', handleTabFocus);
      window.removeEventListener('project-loaded', handleProjectLoaded);
    };
  }, [syncWithEngineState]);
  
  // 選択されたオブジェクトの情報を更新（別のuseEffect）
  useEffect(() => {
    if (!engine || !engine.templateManager || selectedObjectIds.length === 0) return;
    
    const assignments = engine.templateManager.getAssignments();
    const templateMap = new Map<string, string>();
    let commonTemplateId: string | null = null;
    let hasDifferentTemplates = false;
    
    selectedObjectIds.forEach(id => {
      if (assignments.has(id)) {
        const templateId = assignments.get(id)!;
        templateMap.set(id, templateId);
        
        if (commonTemplateId === null) {
          commonTemplateId = templateId;
        } else if (commonTemplateId !== templateId) {
          hasDifferentTemplates = true;
        }
      }
    });
    
    updateState({ 
      selectionTemplateMap: templateMap,
      hasMixedTemplates: hasDifferentTemplates
    });
    
    // 共通のテンプレートIDがある場合は選択状態を更新
    if (commonTemplateId && !hasDifferentTemplates) {
      updateSelectedTemplateId(selectedObjectType, commonTemplateId);
    }
  }, [selectedObjectIds, selectedObjectType, engine, updateState]);
  
  // TemplateManagerのセットアップ
  useEffect(() => {
    if (engine && template) {
      // すべてのテンプレートをEngineのTemplateManagerに登録
      registerAllTemplates();
      
      // グローバルパラメータを取得
      if (engine.parameterManager) {
        updateState({ globalParams: engine.parameterManager.getGlobalParams() });
      }
    }
  }, [engine, template]);
  
  // プロジェクト読み込み時のテンプレート更新を受け取る
  useEffect(() => {
    const handleTemplateLoaded = (event: CustomEvent) => {
      const { templateId, params } = event.detail;
      
      // テンプレートIDを更新
      if (templateId) {
        memoizedOnTemplateChange(templateId);
      }
      
      // パラメータを更新
      if (params) {
        updateState({ globalParams: params });
      }
    };
    
    // プロジェクトロード完了イベントを受け取ってUI初期化を実行
    const handleProjectLoaded = () => {
      console.log('TemplateTab: プロジェクトロード完了イベントを受信');
      
      // 少し遅延を入れてからUI初期化（エンジンの状態が完全に更新されるのを待つ）
      setTimeout(() => {
        if (!engine) return;
        
        // グローバルテンプレートの取得と反映
        const currentTemplateId = engine.getTemplateManager().getDefaultTemplateId();
        if (currentTemplateId && currentTemplateId !== selectedTemplate) {
          memoizedOnTemplateChange(currentTemplateId);
        }
        
        // グローバルパラメータの取得と反映
        if (engine.parameterManager) {
          const globalParams = engine.parameterManager.getGlobalParams();
          updateState({ globalParams });
        }
      }, 100);
    };
    
    window.addEventListener('template-loaded', handleTemplateLoaded as EventListener);
    window.addEventListener('project-loaded', handleProjectLoaded as EventListener);
    
    return () => {
      window.removeEventListener('template-loaded', handleTemplateLoaded as EventListener);
      window.removeEventListener('project-loaded', handleProjectLoaded as EventListener);
    };
  }, [memoizedOnTemplateChange, engine]);
  
  // すべてのテンプレートをTemplateManagerに登録する関数
  const registerAllTemplates = () => {
    if (!engine) return;
    
    // まずエンジンのTemplateManagerに登録されているか確認して、
    // 登録されていないテンプレートを追加する
    templateList.forEach(template => {
      const templateObj = getTemplateById(template.id);
      if (templateObj) {
        try {
          // テンプレートのパラメータ設定からデフォルトパラメータを取得
          const params = {};
          if (typeof templateObj.getParameterConfig === 'function') {
            const paramConfig = templateObj.getParameterConfig();
            paramConfig.forEach((param) => {
              params[param.name] = param.default;
            });
          }
          
          // エンジンにテンプレートを登録
          engine.addTemplate(
            template.id,
            templateObj,
            { name: template.name },
            params
          );
          console.log(`テンプレート「${template.name}」(${template.id})をEngineに登録しました`);
        } catch (error) {
          console.error(`テンプレート「${template.name}」(${template.id})の登録に失敗しました:`, error);
        }
      }
    });
  };
  
  // オブジェクト選択イベントのハンドラ
  useEffect(() => {
    // 従来の単一選択イベント（後方互換性のため）
    const handleSingleObjectSelected = (event: CustomEvent) => {
      const { objectId, objectType, params } = event.detail;
      console.log('TemplateTab: 単一オブジェクト選択イベント受信 –', event.detail);
      
      // エディターモードを選択オブジェクトモードに切り替え
      updateState({ 
        editorMode: 'selection',
        hasParamsChanged: false
      });
      
      setSelectedObjectIds([objectId]);
      setSelectedObjectType(objectType);
      setObjectParams(params || {});
      
      // テンプレートマップをクリア（単一選択なので）
      const templateMap = new Map<string, string>();
      
      // 現在のテンプレートIDを取得（エンジンから取得できる場合）
      if (engine && engine.templateManager) {
        const assignments = engine.templateManager.getAssignments();
        if (assignments.has(objectId)) {
          const templateId = assignments.get(objectId)!;
          templateMap.set(objectId, templateId);
          
          // 適切なテンプレート選択状態を更新
          updateSelectedTemplateId(objectType, templateId);
        }
      }
      
      updateState({ 
        selectionTemplateMap: templateMap,
        hasMixedTemplates: false
      });
    };
    
    // 新しい複数選択イベント
    const handleMultipleObjectsSelected = (event: CustomEvent) => {
      const { objectIds, objectType, params } = event.detail;
      console.log('TemplateTab: 複数オブジェクト選択イベント受信 –', event.detail);
      
      // エディターモードを選択オブジェクトモードに切り替え
      updateState({ 
        editorMode: 'selection',
        hasParamsChanged: false
      });
      
      setSelectedObjectIds(objectIds || []);
      setSelectedObjectType(objectType);
      
      // 複数選択時は共通パラメータのみ（または空オブジェクト）
      setObjectParams(params || {});
      
      // 選択されたオブジェクトのテンプレートIDを取得
      const templateMap = new Map<string, string>();
      let commonTemplateId: string | null = null;
      let hasDifferentTemplates = false;
      
      if (engine && engine.templateManager) {
        const assignments = engine.templateManager.getAssignments();
        
        objectIds.forEach(id => {
          if (assignments.has(id)) {
            const templateId = assignments.get(id)!;
            templateMap.set(id, templateId);
            
            if (commonTemplateId === null) {
              commonTemplateId = templateId;
            } else if (commonTemplateId !== templateId) {
              hasDifferentTemplates = true;
            }
          }
        });
        
        // 共通のテンプレートIDがある場合は選択状態を更新
        if (commonTemplateId && !hasDifferentTemplates) {
          updateSelectedTemplateId(objectType, commonTemplateId);
        }
      }
      
      updateState({ 
        selectionTemplateMap: templateMap,
        hasMixedTemplates: hasDifferentTemplates
      });
    };
    
    // イベントリスナー追加
    window.addEventListener('object-selected', handleSingleObjectSelected as EventListener);
    window.addEventListener('objects-selected', handleMultipleObjectsSelected as EventListener);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('object-selected', handleSingleObjectSelected as EventListener);
      window.removeEventListener('objects-selected', handleMultipleObjectsSelected as EventListener);
    };
  }, [engine]);
  
  // 選択されたオブジェクトタイプに応じてテンプレートID選択状態を更新
  const updateSelectedTemplateId = (objectType: string, templateId: string) => {
    switch (objectType) {
      case 'phrase':
        updateState({ selectedPhraseTemplateId: templateId });
        break;
      case 'word':
        updateState({ selectedWordTemplateId: templateId });
        break;
      case 'char':
        updateState({ selectedCharTemplateId: templateId });
        break;
    }
  };
  
  // グローバルテンプレート変更ハンドラ
  const handleGlobalTemplateChange = (templateId: string) => {
    onTemplateChange(templateId);
    
    // エンジンを介してグローバルテンプレートを設定（可能な場合）
    if (engine) {
      try {
        engine.setDefaultTemplate(templateId, true);
        
        // テンプレートのパラメータ設定を取得して更新
        const templateObj = getTemplateById(templateId);
        if (templateObj && typeof templateObj.getParameterConfig === 'function') {
          const defaultParams: Record<string, any> = {};
          const paramConfig = templateObj.getParameterConfig();
          paramConfig.forEach(param => {
            defaultParams[param.name] = param.default;
          });
          
          // 既存のパラメータを優先し、不足分をデフォルト値で補完
          const existingParams = engine.parameterManager
            ? engine.parameterManager.getGlobalParams()
            : {};
          
          // 既存のパラメータを保持し、新しいパラメータのみデフォルト値を設定
          const mergedParams = { ...defaultParams, ...existingParams };
          updateState({ globalParams: mergedParams });
        }
      } catch (error) {
        console.error('グローバルテンプレート変更エラー:', error);
      }
    }
  };
  
  // オブジェクト選択時のテンプレート適用ハンドラ
  const handleSelectionTemplateChange = (templateId: string) => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    // 適切なテンプレート選択状態を更新
    updateSelectedTemplateId(selectedObjectType, templateId);
    
    // テンプレートオブジェクトを取得
    const templateObj = getTemplateById(templateId);
    if (!templateObj) {
      console.error(`テンプレートID「${templateId}」が見つかりません`);
      return;
    }
    
    try {
      // まずエンジンにテンプレートが登録されているか確認し、登録されていなければ登録する
      const params = {};
      if (typeof templateObj.getParameterConfig === 'function') {
        const paramConfig = templateObj.getParameterConfig();
        paramConfig.forEach((param) => {
          params[param.name] = param.default;
        });
      }
      
      // テンプレート名を取得
      const templateName = templateList.find(t => t.id === templateId)?.name || templateId;
      
      // テンプレートを登録（すでに登録されている場合は上書き）
      engine.addTemplate(
        templateId,
        templateObj,
        { name: templateName },
        params
      );
      console.log(`テンプレート「${templateName}」(${templateId})をEngineに登録しました`);
      
      // 現在のテンプレートと同じかチェック（強制再適用の判定のため）
      const currentTemplateId = selectedObjectIds.length === 1 
        ? engine.getCurrentTemplateId(selectedObjectIds[0]) 
        : null;
      const isSameTemplate = currentTemplateId === templateId;
      const forceReapply = isSameTemplate || state.hasParamsChanged;
      
      console.log(`テンプレート適用: forceReapply=${forceReapply}, isSameTemplate=${isSameTemplate}, hasParamsChanged=${state.hasParamsChanged}`);
      
      // 複数のオブジェクトに対してテンプレートを一括適用
      if (selectedObjectIds.length === 1) {
        // 単一選択の場合は従来の方法
        const success = engine.assignTemplate(selectedObjectIds[0], templateId, true, true, forceReapply);
        if (!success) {
          console.error(`オブジェクト ${selectedObjectIds[0]} のテンプレート適用に失敗しました`);
        } else {
          console.log(`オブジェクト ${selectedObjectIds[0]} にテンプレート「${templateName}」(${templateId})を適用しました`);
          
          // パラメータ変更フラグをリセット
          updateState({ hasParamsChanged: false });
          
          // 選択オブジェクトパラメータを更新
          if (engine.parameterManager) {
            const updatedParams = engine.parameterManager.getObjectParams(selectedObjectIds[0]);
            setObjectParams(updatedParams);
          }
          
          // テンプレートマップを更新
          const newMap = new Map(state.selectionTemplateMap);
          newMap.set(selectedObjectIds[0], templateId);
          updateState({ 
            selectionTemplateMap: newMap,
            hasMixedTemplates: false
          });
        }
      } else {
        // 複数選択の場合は個別に適用（forceReapplyをサポートするため）
        let allSuccess = true;
        const newMap = new Map();
        
        for (const objectId of selectedObjectIds) {
          const success = engine.assignTemplate(objectId, templateId, true, true, forceReapply);
          if (!success) {
            console.error(`オブジェクト ${objectId} のテンプレート適用に失敗しました`);
            allSuccess = false;
          } else {
            newMap.set(objectId, templateId);
          }
        }
        
        if (allSuccess) {
          console.log(`選択された ${selectedObjectIds.length} 個の${selectedObjectType}にテンプレート「${templateName}」(${templateId})を適用しました`);
          
          // パラメータ変更フラグをリセット
          updateState({ hasParamsChanged: false });
          
          // テンプレートマップを更新（全て同じテンプレートになるので混在ではない）
          const newMap = new Map();
          selectedObjectIds.forEach(id => newMap.set(id, templateId));
          updateState({ 
            selectionTemplateMap: newMap,
            hasMixedTemplates: false
          });
          
          // UIフィードバックのためにカスタムイベントを発火
          const event = new CustomEvent('template-batch-applied', {
            detail: {
              objectIds: selectedObjectIds,
              objectType: selectedObjectType,
              templateId: templateId,
              templateName: templateName
            }
          });
          window.dispatchEvent(event);
        }
      }
    } catch (error) {
      console.error(`テンプレート適用に失敗しました`, error);
    }
  };
  
  // 現在選択されているテンプレートID（モードに応じて）
  const getCurrentTemplateId = useCallback(() => {
    if (state.editorMode === 'global') {
      return selectedTemplate;
    } else {
      // 選択オブジェクトモードの場合
      switch (selectedObjectType) {
        case 'phrase':
          return state.selectedPhraseTemplateId;
        case 'word':
          return state.selectedWordTemplateId;
        case 'char':
          return state.selectedCharTemplateId;
        default:
          return selectedTemplate;
      }
    }
  }, [state.editorMode, state.selectedPhraseTemplateId, state.selectedWordTemplateId, state.selectedCharTemplateId, selectedTemplate, selectedObjectType]);

  // グローバルパラメータ変更ハンドラ（統合版）
  const handleGlobalParamChange = useCallback((updatedParams: Record<string, any>) => {
    if (!engine) return;
    
    // エンジンに更新を反映し、状態を更新
    engine.updateGlobalParams(updatedParams);
    updateState({ globalParams: updatedParams });
  }, [engine, updateState]);
  
  // オブジェクトパラメータ変更ハンドラ（統合版）
  const handleObjectParamChange = useCallback((updatedParams: Record<string, any>) => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    // パラメータを更新
    selectedObjectIds.forEach(id => {
      engine.updateObjectParams(id, selectedObjectType as any, updatedParams);
    });
    setObjectParams(updatedParams);
    
    // assignTemplateの呼び出しを削除
    // （updateObjectParams内で既にインスタンス更新が行われているため）
  }, [engine, selectedObjectIds, selectedObjectType]);
  
  // フォント更新のためのリロード状態
  const [fontReloadTrigger, setFontReloadTrigger] = useState(0);
  
  // 選択中のオブジェクトの個別パラメータをクリア
  const handleClearSelectedObjectParams = useCallback(() => {
    if (!engine || selectedObjectIds.length === 0) return;
    
    const confirmMessage = selectedObjectIds.length === 1
      ? `${selectedObjectIds[0]} の個別設定をクリアしますか？`
      : `選択された ${selectedObjectIds.length}個の${selectedObjectType} の個別設定をクリアしますか？`;
    
    if (window.confirm(confirmMessage)) {
      // エンジンで個別パラメータをクリア
      const success = engine.clearSelectedObjectParams(selectedObjectIds);
      
      if (success) {
        console.log(`TemplateTab: ${selectedObjectIds.length}個のオブジェクトの個別パラメータをクリアしました`);
        
        // パラメータ表示をクリア
        setObjectParams({});
        
        // UIフィードバックのためにカスタムイベントを発火
        const event = new CustomEvent('params-cleared', {
          detail: {
            objectIds: selectedObjectIds,
            objectType: selectedObjectType
          }
        });
        window.dispatchEvent(event);
      } else {
        console.error('TemplateTab: 個別パラメータのクリアに失敗しました');
      }
    }
  }, [engine, selectedObjectIds, selectedObjectType]);
  
  // fontsLoadedイベントリスナーの設定
  useEffect(() => {
    const handleFontsLoaded = () => {
      console.log('TemplateTab: fontsLoadedイベントを受信しました');
      setFontReloadTrigger(prev => prev + 1);
    };
    
    window.addEventListener('fontsLoaded', handleFontsLoaded);
    
    return () => {
      window.removeEventListener('fontsLoaded', handleFontsLoaded);
    };
  }, []);
  
  // 選択されたテンプレートのパラメータ情報を取得
  const getTemplateParamConfig = (templateId: string) => {
    const templateObj = getTemplateById(templateId);
    
    // パラメータ設定を取得
    if (templateObj && typeof templateObj.getParameterConfig === 'function') {
      const paramConfig = templateObj.getParameterConfig();
      return paramConfig;
    }
    
    // getParameterConfig()が未実装の場合はエラー
    console.error(`Template ${templateId} must implement getParameterConfig() method`);
    return [];
  };
  
  
  return (
    <div className="template-tab">
      <h2>テンプレート</h2>
      
      {/* モード切り替えスイッチ */}
      <div className="editor-mode-switch">
        <div className="switch-container">
          <button 
            className={`mode-button ${state.editorMode === 'global' ? 'active' : ''}`}
            onClick={() => updateState({ editorMode: 'global' })}
          >
            グローバル設定
          </button>
          <button 
            className={`mode-button ${state.editorMode === 'selection' ? 'active' : ''}`}
            onClick={() => updateState({ editorMode: 'selection' })}
            disabled={selectedObjectIds.length === 0}
          >
            選択オブジェクト設定
          </button>
        </div>
      </div>
      
      {/* グローバル設定モード */}
      {state.editorMode === 'global' && (
        <div className="global-settings">
          <div className="template-section">
            <h3>アニメーションテンプレート</h3>
            <p>アニメーション全体に適用するテンプレートを選択してください。</p>
            
            {/* グローバルテンプレートセレクタ */}
            <TemplateSelector
              templates={templateList}
              selectedTemplateId={selectedTemplate}
              onSelect={handleGlobalTemplateChange}
            />
          </div>
          
          {/* グローバルパラメータ編集セクション */}
          {template && typeof template.getParameterConfig === 'function' && (
            <div className="params-section">
              <h3>グローバルパラメータ設定</h3>
              <p>全体に適用されるパラメータを調整してください。</p>
              
              <ParamEditor
                key={`global-${selectedTemplate}-${fontReloadTrigger}`}
                params={state.globalParams}
                paramConfig={getTemplateParamConfig(selectedTemplate)}
                onChange={handleGlobalParamChange}
              />
            </div>
          )}
        </div>
      )}
      
      {/* 選択オブジェクト設定モード */}
      {state.editorMode === 'selection' && selectedObjectIds.length > 0 && (
        <div className="selection-settings">
          <div className="object-template-section">
            <h3>
              {selectedObjectType === 'phrase' && 'フレーズテンプレート'}
              {selectedObjectType === 'word' && '単語テンプレート'}
              {selectedObjectType === 'char' && '文字テンプレート'}
            </h3>
            
            {selectedObjectIds.length === 1 ? (
              <p>選択中の{selectedObjectType}: {selectedObjectIds[0]}</p>
            ) : (
              <p>{selectedObjectIds.length}個の{selectedObjectType}を選択中</p>
            )}
            
            {/* 混在テンプレートの警告 */}
            {state.hasMixedTemplates && (
              <div className="mixed-templates-warning">
                <p>選択されたオブジェクトに異なるテンプレートが適用されています。テンプレートを選択すると全てのオブジェクトに同じテンプレートが適用されます。</p>
              </div>
            )}
            
            {/* オブジェクト種類に応じたテンプレートセレクタ */}
            <TemplateSelector
              templates={templateList}
              selectedTemplateId={
                selectedObjectType === 'phrase' ? state.selectedPhraseTemplateId : 
                selectedObjectType === 'word' ? state.selectedWordTemplateId : 
                selectedObjectType === 'char' ? state.selectedCharTemplateId : 'fadeslidetext'
              }
              onSelect={handleSelectionTemplateChange}
              selectedPhraseIds={selectedObjectIds}
            />
          </div>
          
          {/* パラメータ編集セクション */}
          <div className="params-section">
            <h3>パラメータ設定</h3>
            
            {selectedObjectIds.length === 1 ? (
              <p>選択オブジェクト: {selectedObjectIds[0]} のパラメータを調整</p>
            ) : (
              <p>選択された {selectedObjectIds.length}個の{selectedObjectType} のパラメータを一括調整</p>
            )}
            
            {/* 個別パラメータクリアボタン */}
            <div className="clear-params-section">
              <button 
                className="clear-params-button"
                onClick={() => handleClearSelectedObjectParams()}
                title="選択中のオブジェクトの個別設定をすべてクリアします"
              >
                個別設定をクリア
              </button>
            </div>
            
            {/* 複数選択で異なるテンプレートが混在する場合はパラメータ編集を無効化 */}
            {state.hasMixedTemplates ? (
              <div className="param-editor-disabled">
                <p>異なるテンプレートが選択されているため、パラメータ編集はできません。<br />
                テンプレートを統一するか、単一のオブジェクトを選択してください。</p>
              </div>
            ) : (
              <ParamEditor
                key={`object-${getCurrentTemplateId()}-${fontReloadTrigger}`}
                params={objectParams}
                paramConfig={getTemplateParamConfig(getCurrentTemplateId())}
                onChange={handleObjectParamChange}
                disabled={state.hasMixedTemplates}
              />
            )}
          </div>
        </div>
      )}
      
      {/* 選択オブジェクトがない場合の表示 */}
      {state.editorMode === 'selection' && selectedObjectIds.length === 0 && (
        <div className="no-selection-message">
          <p>フレーズ、単語、または文字を選択してください。</p>
        </div>
      )}
    </div>
  );
};

export default TemplateTab;