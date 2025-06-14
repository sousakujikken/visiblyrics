import React, { useEffect, useState } from 'react';
import './TemplateSelector.css';

interface TemplateSelectorProps {
  templates: Array<{id: string, name: string, description?: string, thumbnailUrl?: string}>;
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
  selectedPhraseIds?: string[]; // 複数選択対応
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ 
  templates, 
  selectedTemplateId, 
  onSelect,
  selectedPhraseIds
}) => {
  const [filter, setFilter] = useState('');
  
  // 選択されるテンプレートIDが有効かどうかを確認
  useEffect(() => {
    // テンプレートIDが存在するか確認
    const templateExists = templates.some(template => template.id === selectedTemplateId);
    if (!templateExists && templates.length > 0) {
      // 存在しない場合は最初のテンプレートを選択
      console.log(`選択されたテンプレートID "${selectedTemplateId}" は存在しません。最初のテンプレートを選択します。`);
      onSelect(templates[0].id);
    }
  }, [selectedTemplateId, templates, onSelect]);
  
  // 表示用のテンプレートID状態 - 必ず有効な値にバックアップ
  const displayTemplateId = templates.some(t => t.id === selectedTemplateId) 
    ? selectedTemplateId 
    : templates.length > 0 ? templates[0].id : '';
  
  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(filter.toLowerCase()) ||
    template.description?.toLowerCase().includes(filter.toLowerCase())
  );
  
  // テンプレート一括適用イベントのハンドラを追加
  useEffect(() => {
    const handleTemplateBatchApplied = (event: CustomEvent) => {
      // 一括適用成功時の通知UIを表示
      const notification = document.getElementById('batch-notification');
      if (notification) {
        notification.style.display = 'block';
        notification.textContent = `${event.detail.templateName}テンプレートを${event.detail.objectIds.length}個の${event.detail.objectType}に適用しました`;
        
        // 2秒後に非表示にする
        setTimeout(() => {
          notification.style.display = 'none';
        }, 2000);
      }
    };
    
    // イベントリスナーを追加
    window.addEventListener('template-batch-applied', handleTemplateBatchApplied as EventListener);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('template-batch-applied', handleTemplateBatchApplied as EventListener);
    };
  }, []);
  
  return (
    <div className="template-selector">
      <div className="template-selector-header">
        <h3>テンプレート選択</h3>
        {/* 選択状態表示を複数選択に対応 */}
        {selectedPhraseIds && selectedPhraseIds.length > 0 && (
          <div className="selected-phrase">
            {selectedPhraseIds.length === 1 ? (
              // 1つだけ選択されている場合
              <span>選択中のフレーズ: {selectedPhraseIds[0]}</span>
            ) : (
              // 複数選択されている場合
              <span>{selectedPhraseIds.length}個のフレーズを選択中</span>
            )}
          </div>
        )}
        <input
          type="text"
          placeholder="テンプレートを検索..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      
      <div className="template-list">
        {filteredTemplates.map(template => (
          <div 
            key={template.id}
            className={`template-item ${displayTemplateId === template.id ? 'selected' : ''}`}
            onClick={() => onSelect(template.id)}
          >
            <div className="template-thumbnail">
              {template.thumbnailUrl ? (
                <img src={template.thumbnailUrl} alt={template.name} />
              ) : (
                <div className="template-thumbnail-placeholder">
                  {template.name.substring(0, 2)}
                </div>
              )}
            </div>
            <div className="template-info">
              <h4>{template.name}</h4>
              {template.description && <p>{template.description}</p>}
            </div>
          </div>
        ))}
        
        {filteredTemplates.length === 0 && (
          <div className="template-empty-message">
            検索条件に一致するテンプレートがありません。
          </div>
        )}
      </div>
      
      {/* 複数選択時に一括適用のボタンを表示 */}
      {selectedPhraseIds && selectedPhraseIds.length > 1 && (
        <div className="batch-actions">
          <button 
            className="batch-apply-button"
            onClick={() => onSelect(displayTemplateId)}
          >
            選択した{selectedPhraseIds.length}個のフレーズに適用
          </button>
        </div>
      )}
      
      {/* テンプレート一括適用成功時の通知 */}
      <div 
        id="batch-notification" 
        className="batch-notification" 
        style={{
          display: 'none', 
          background: 'rgba(0, 128, 0, 0.8)', 
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          transition: 'opacity 0.3s ease'
        }}
      >
        テンプレートを一括適用しました
      </div>
    </div>
  );
};

export default TemplateSelector;