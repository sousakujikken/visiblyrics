import React, { useState, useEffect, useRef } from 'react';
import { PhraseUnit, WordUnit, CharUnit } from '../../types/types';
import { generateUniqueId } from '../../utils/idGenerator';
import './WordSplitEditor.css';

// 階層的ID生成用のヘルパー関数
const generateHierarchicalWordId = (phraseId: string, wordIndex: number): string => {
  return `${phraseId}_word_${wordIndex}`;
};

const generateHierarchicalCharId = (wordId: string, charIndex: number): string => {
  return `${wordId}_char_${charIndex}`;
};

interface WordSplitEditorProps {
  phrase: PhraseUnit;
  onSave: (updatedPhrase: PhraseUnit) => void;
  onClose: () => void;
}

interface EditableWordCell {
  wordId: string;
  field: 'word' | 'start' | 'end';
  value: string | number;
}

const WordSplitEditor: React.FC<WordSplitEditorProps> = ({ phrase, onSave, onClose }) => {
  const [words, setWords] = useState<WordUnit[]>([]);
  const [editingCell, setEditingCell] = useState<EditableWordCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // 初期化時に現在のフレーズの単語データを設定
  useEffect(() => {
    setWords(JSON.parse(JSON.stringify(phrase.words)));
  }, [phrase]);

  // 日本語対応の単語分割関数
  const splitIntoWords = (text: string): string[] => {
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    
    if (hasJapanese) {
      // 日本語の場合: 句読点や区切り文字で分割
      const separators = /[、。，．！？!?\s]/;
      const words: string[] = [];
      const parts = text.split(separators);
      
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          words.push(trimmed);
        }
      }
      return words.length > 0 ? words : [text.trim()];
    } else {
      // 英語等の場合: スペースとカンマ、ピリオドで分割
      return text.split(/[\s,.!?]+/).filter(word => word !== '');
    }
  };

  // 文字を新しい単語に再分配する関数
  const redistributeCharactersToWords = (newWords: string[], originalPhrase: PhraseUnit): WordUnit[] => {
    const totalDuration = originalPhrase.end - originalPhrase.start;
    const totalChars = originalPhrase.phrase.length;
    
    let globalCharIndex = 0; // フレーズ全体での連続インデックス
    const newWordUnits: WordUnit[] = [];
    
    newWords.forEach((wordText, wordIndex) => {
      const wordLength = wordText.length;
      const wordStartTime = originalPhrase.start + (globalCharIndex / totalChars) * totalDuration;
      const wordEndTime = originalPhrase.start + ((globalCharIndex + wordLength) / totalChars) * totalDuration;
      
      // 単語内の文字を作成
      const chars: CharUnit[] = [];
      for (let i = 0; i < wordLength; i++) {
        const charStartTime = wordStartTime + (i / wordLength) * (wordEndTime - wordStartTime);
        const charEndTime = wordStartTime + ((i + 1) / wordLength) * (wordEndTime - wordStartTime);
        
        const charId = generateHierarchicalCharId(`${originalPhrase.id}_word_${wordIndex}`, i);
        
        chars.push({
          id: charId,
          char: wordText[i],
          start: Math.round(charStartTime),
          end: Math.round(charEndTime),
          charIndex: globalCharIndex + i, // フレーズ全体での連続番号
          totalChars: totalChars
        });
      }
      
      const wordId = generateHierarchicalWordId(originalPhrase.id, wordIndex);
      
      newWordUnits.push({
        id: wordId,
        word: wordText,
        start: Math.round(wordStartTime),
        end: Math.round(wordEndTime),
        chars: chars
      });
      
      globalCharIndex += wordLength;
    });
    
    return newWordUnits;
  };

  // 自動分割機能
  const handleAutoSplit = () => {
    const newWordTexts = splitIntoWords(phrase.phrase);
    const newWords = redistributeCharactersToWords(newWordTexts, phrase);
    setWords(newWords);
  };

  // 編集開始
  const startEdit = (wordId: string, field: 'word' | 'start' | 'end', value: string | number) => {
    setEditingCell({ wordId, field, value });
    setEditValue(value.toString());
  };

  // 編集確定
  const confirmEdit = () => {
    if (!editingCell) return;

    const updatedWords = words.map(word => {
      if (word.id === editingCell.wordId) {
        const newWord = { ...word };
        
        if (editingCell.field === 'word') {
          newWord.word = editValue;
          // 単語テキストが変更された場合、文字も再生成
          const chars: CharUnit[] = [];
          const wordDuration = word.end - word.start;
          
          const baseCharIndex = word.chars[0]?.charIndex || 0;
          
          for (let i = 0; i < editValue.length; i++) {
            const charStart = word.start + (i / editValue.length) * wordDuration;
            const charEnd = word.start + ((i + 1) / editValue.length) * wordDuration;
            const charId = generateHierarchicalCharId(word.id, i);
            
            chars.push({
              id: charId,
              char: editValue[i],
              start: Math.round(charStart),
              end: Math.round(charEnd),
              charIndex: baseCharIndex + i, // 元の位置を基準に連続番号
              totalChars: phrase.phrase.length
            });
          }
          newWord.chars = chars;
          // 注意: 全体のcharIndex整合性はEngineで再計算される
        } else if (editingCell.field === 'start') {
          const startTime = parseFloat(editValue) * 1000;
          newWord.start = Math.round(startTime);
          // 文字の時間も調整
          const wordDuration = newWord.end - newWord.start;
          newWord.chars = newWord.chars.map((char, index) => ({
            ...char,
            start: Math.round(newWord.start + (index / newWord.chars.length) * wordDuration),
            end: Math.round(newWord.start + ((index + 1) / newWord.chars.length) * wordDuration)
          }));
        } else if (editingCell.field === 'end') {
          const endTime = parseFloat(editValue) * 1000;
          newWord.end = Math.round(endTime);
          // 文字の時間も調整
          const wordDuration = newWord.end - newWord.start;
          newWord.chars = newWord.chars.map((char, index) => ({
            ...char,
            start: Math.round(newWord.start + (index / newWord.chars.length) * wordDuration),
            end: Math.round(newWord.start + ((index + 1) / newWord.chars.length) * wordDuration)
          }));
        }
        
        return newWord;
      }
      return word;
    });

    setWords(updatedWords);
    setEditingCell(null);
  };

  // 単語追加
  const addWord = (afterWordId?: string) => {
    // 新しい単語のインデックスを決定
    const newWordIndex = words.length;
    const newWordId = generateHierarchicalWordId(phrase.id, newWordIndex);
    const newCharId = generateHierarchicalCharId(newWordId, 0);
    
    const newWord: WordUnit = {
      id: newWordId,
      word: '新しい単語',
      start: phrase.start,
      end: phrase.end,
      chars: [{
        id: newCharId,
        char: '新',
        start: phrase.start,
        end: phrase.end,
        charIndex: 0,
        totalChars: 1
      }]
    };

    if (afterWordId) {
      const index = words.findIndex(w => w.id === afterWordId);
      const updatedWords = [...words];
      updatedWords.splice(index + 1, 0, newWord);
      setWords(updatedWords);
    } else {
      setWords([...words, newWord]);
    }
  };

  // 単語削除
  const deleteWord = (wordId: string) => {
    setWords(words.filter(w => w.id !== wordId));
  };

  // 保存処理
  const handleSave = () => {
    // charIndexはredistributeCharactersToWordsで正しく設定済み
    // calculateCharacterIndicesはEngineで実行されるため呼び出さない
    const updatedPhrase: PhraseUnit = {
      ...phrase,
      words: words
    };
    
    onSave(updatedPhrase);
  };

  // 時間フォーマット
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
  };

  // キーボードイベント処理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      confirmEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // 編集入力フィールドのフォーカス
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  return (
    <div className="word-split-editor">
      <div className="word-split-editor-header">
        <h3>単語分割編集: "{phrase.phrase}"</h3>
        <div className="word-split-editor-controls">
          <button onClick={handleAutoSplit} className="auto-split-button">
            自動分割
          </button>
          <button onClick={handleSave} className="save-button">
            保存
          </button>
          <button onClick={onClose} className="close-button">
            キャンセル
          </button>
        </div>
      </div>

      <div className="word-split-editor-content">
        <table className="words-table">
          <thead>
            <tr>
              <th>単語</th>
              <th>開始時刻 (秒)</th>
              <th>終了時刻 (秒)</th>
              <th>アクション</th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => (
              <tr key={word.id}>
                <td 
                  className="editable-cell"
                  onClick={() => startEdit(word.id, 'word', word.word)}
                >
                  {editingCell?.wordId === word.id && editingCell.field === 'word' ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={confirmEdit}
                      onKeyDown={handleKeyDown}
                      className="edit-input"
                    />
                  ) : (
                    word.word
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(word.id, 'start', word.start)}
                >
                  {editingCell?.wordId === word.id && editingCell.field === 'start' ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={confirmEdit}
                      onKeyDown={handleKeyDown}
                      className="edit-input time-input"
                    />
                  ) : (
                    formatTime(word.start)
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(word.id, 'end', word.end)}
                >
                  {editingCell?.wordId === word.id && editingCell.field === 'end' ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={confirmEdit}
                      onKeyDown={handleKeyDown}
                      className="edit-input time-input"
                    />
                  ) : (
                    formatTime(word.end)
                  )}
                </td>
                <td className="action-cell">
                  <button 
                    onClick={() => addWord(word.id)}
                    className="insert-button"
                    title="下に単語を追加"
                  >
                    ↓追加
                  </button>
                  <button 
                    onClick={() => deleteWord(word.id)}
                    className="delete-button"
                    title="単語を削除"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {words.length === 0 && (
          <div className="no-words">
            単語がありません。「自動分割」ボタンを押すかテーブルから単語を追加してください。
          </div>
        )}
        
        <div className="add-word-section">
          <button onClick={() => addWord()} className="add-word-button">
            + 単語を追加
          </button>
        </div>
      </div>
    </div>
  );
};

export default WordSplitEditor;