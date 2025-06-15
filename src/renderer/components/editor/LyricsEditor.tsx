import React, { useState, useEffect, useRef } from 'react';
import Engine from '../../engine/Engine';
import { PhraseUnit, WordUnit, CharUnit } from '../../types/types';
import { ProjectFileManager } from '../../services/ProjectFileManager';
import { calculateCharacterIndices } from '../../utils/characterIndexCalculator';
import './LyricsEditor.css';

interface LyricsEditorProps {
  engine: Engine;
  onClose?: () => void;
}

interface EditableCell {
  phraseId: string;
  field: 'phrase' | 'start' | 'end';
  value: string | number;
}

const LyricsEditor: React.FC<LyricsEditorProps> = ({ engine, onClose }) => {
  const [lyrics, setLyrics] = useState<PhraseUnit[]>([]);
  const [editingCell, setEditingCell] = useState<EditableCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const projectFileManager = useRef<ProjectFileManager>(new ProjectFileManager(engine));

  // 歌詞データの取得
  useEffect(() => {
    if (engine) {
      const loadLyrics = () => {
        const { lyrics: engineLyrics } = engine.getTimelineData();
        setLyrics(JSON.parse(JSON.stringify(engineLyrics)));
      };

      loadLyrics();

      // タイムライン更新イベントのリスナー
      const handleTimelineUpdated = (event: CustomEvent) => {
        console.log('LyricsEditor: timeline-updatedイベント受信', event.detail.lyrics);
        setLyrics(JSON.parse(JSON.stringify(event.detail.lyrics)));
      };

      window.addEventListener('timeline-updated', handleTimelineUpdated as EventListener);
      return () => {
        window.removeEventListener('timeline-updated', handleTimelineUpdated as EventListener);
      };
    }
  }, [engine]);

  // 編集開始
  const startEdit = (phraseId: string, field: 'phrase' | 'start' | 'end', currentValue: string | number) => {
    setEditingCell({ phraseId, field, value: currentValue });
    setEditValue(String(currentValue));
  };

  // 編集確定
  const confirmEdit = () => {
    if (!editingCell) return;

    const updatedLyrics = lyrics.map(phrase => {
      if (phrase.id === editingCell.phraseId) {
        if (editingCell.field === 'phrase') {
          // フレーズテキストの変更 - 文字タイミングを自動調整
          return updatePhraseText(phrase, editValue);
        } else if (editingCell.field === 'start') {
          // 開始時刻の変更
          const newStart = parseInt(editValue);
          if (!isNaN(newStart) && newStart < phrase.end) {
            return adjustPhraseTiming(phrase, newStart, phrase.end);
          }
        } else if (editingCell.field === 'end') {
          // 終了時刻の変更
          const newEnd = parseInt(editValue);
          if (!isNaN(newEnd) && newEnd > phrase.start) {
            return adjustPhraseTiming(phrase, phrase.start, newEnd);
          }
        }
      }
      return phrase;
    });

    // 文字インデックスを再計算
    const lyricsWithIndices = calculateCharacterIndices(updatedLyrics);
    
    // Engineに反映
    console.log('LyricsEditor: 歌詞データを更新します', lyricsWithIndices);
    engine.updateLyricsData(lyricsWithIndices);
    console.log('LyricsEditor: Engineへの更新完了');
    setEditingCell(null);
  };

  // フレーズテキスト更新と文字タイミング自動調整
  const updatePhraseText = (phrase: PhraseUnit, newText: string): PhraseUnit => {
    console.log('LyricsEditor: updatePhraseText開始', { 
      phraseId: phrase.id, 
      oldText: phrase.phrase, 
      newText,
      duration: phrase.end - phrase.start
    });
    
    const newWords = splitIntoWords(newText);
    const totalDuration = phrase.end - phrase.start;
    
    // 新しい文字数の合計を計算
    const totalChars = newWords.reduce((sum, word) => sum + word.length, 0);
    if (totalChars === 0) {
      console.warn('LyricsEditor: 文字数が0のため、元のフレーズを返します');
      return phrase;
    }

    // 文字あたりの時間を計算
    const timePerChar = totalDuration / totalChars;
    console.log('LyricsEditor: タイミング計算', { 
      totalChars, 
      totalDuration, 
      timePerChar,
      newWordsCount: newWords.length
    });
    
    let currentTime = phrase.start;
    let wordIndex = 0;
    
    const newWordUnits: WordUnit[] = newWords.map((word, wIdx) => {
      const wordStart = currentTime;
      const wordChars = Array.from(word);
      const wordDuration = wordChars.length * timePerChar;
      const wordEnd = Math.min(wordStart + wordDuration, phrase.end);
      
      const charUnits: CharUnit[] = wordChars.map((char, cIdx) => {
        const charStart = wordStart + (cIdx * timePerChar);
        const charEnd = Math.min(charStart + timePerChar, wordEnd);
        
        return {
          id: `${phrase.id}_word_${wIdx}_char_${cIdx}`,
          char: char,
          start: Math.round(charStart),
          end: Math.round(charEnd)
        };
      });
      
      currentTime = wordEnd;
      
      return {
        id: `${phrase.id}_word_${wIdx}`,
        word: word,
        start: Math.round(wordStart),
        end: Math.round(wordEnd),
        chars: charUnits
      };
    });

    const updatedPhrase = {
      ...phrase,
      phrase: newText,
      words: newWordUnits
    };
    
    console.log('LyricsEditor: updatePhraseText完了', {
      phraseId: phrase.id,
      wordsCount: newWordUnits.length,
      totalCharsInWords: newWordUnits.reduce((sum, w) => sum + w.chars.length, 0)
    });
    
    return updatedPhrase;
  };

  // タイミング調整（開始・終了時刻変更時）
  const adjustPhraseTiming = (phrase: PhraseUnit, newStart: number, newEnd: number): PhraseUnit => {
    const oldDuration = phrase.end - phrase.start;
    const newDuration = newEnd - newStart;
    const ratio = newDuration / oldDuration;

    const adjustedWords = phrase.words.map(word => {
      const wordRelativeStart = word.start - phrase.start;
      const wordRelativeEnd = word.end - phrase.start;
      const newWordStart = newStart + (wordRelativeStart * ratio);
      const newWordEnd = newStart + (wordRelativeEnd * ratio);

      const adjustedChars = word.chars.map(char => {
        const charRelativeStart = char.start - phrase.start;
        const charRelativeEnd = char.end - phrase.start;
        return {
          ...char,
          start: Math.round(newStart + (charRelativeStart * ratio)),
          end: Math.round(newStart + (charRelativeEnd * ratio))
        };
      });

      return {
        ...word,
        start: Math.round(newWordStart),
        end: Math.round(newWordEnd),
        chars: adjustedChars
      };
    });

    return {
      ...phrase,
      start: newStart,
      end: newEnd,
      words: adjustedWords
    };
  };

  // テキストを単語に分割
  const splitIntoWords = (text: string): string[] => {
    console.log('LyricsEditor: splitIntoWords実行', { input: text });
    
    // 日本語を含むかチェック
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    
    if (hasJapanese) {
      // 日本語の場合: 句読点や区切り文字で分割
      // より適切な分割パターンを使用（半角・全角の両方に対応）
      const separators = /[、。，．！？!?]/;
      const words: string[] = [];
      
      // 区切り文字で分割し、空でない部分のみを保持
      const parts = text.split(separators);
      
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          // さらに長い単語は意味のある単位で分割することも考慮
          // ただし、今回はシンプルに区切り文字で分割した結果をそのまま使用
          words.push(trimmed);
        }
      }
      
      console.log('LyricsEditor: 日本語分割結果', { 
        originalText: text,
        splitParts: parts,
        filteredWords: words 
      });
      
      // 分割できなかった場合は元のテキストをそのまま返す
      return words.length > 0 ? words : [text.trim()];
    } else {
      // 英語等の場合: スペースとカンマ、ピリオドで分割
      const words = text.split(/[\s,.!?]+/).filter(word => word !== '');
      console.log('LyricsEditor: 英語分割結果', { 
        originalText: text,
        words 
      });
      return words;
    }
  };

  // フレーズの削除
  const deletePhrase = (phraseId: string) => {
    const updatedLyrics = lyrics.filter(phrase => phrase.id !== phraseId);
    // 文字インデックスを再計算
    const lyricsWithIndices = calculateCharacterIndices(updatedLyrics);
    engine.updateLyricsData(lyricsWithIndices);
  };

  // プロジェクトの保存
  const handleSave = async () => {
    setSaveStatus('保存中...');
    console.log('LyricsEditor: 保存開始 - 現在の歌詞データ', lyrics);
    
    // Engineの現在の歌詞データも確認
    const engineLyrics = engine.getTimelineData().lyrics;
    console.log('LyricsEditor: Engine内の歌詞データ', engineLyrics);
    
    // 比較してデータが一致しているかチェック
    const isDataSynced = JSON.stringify(lyrics) === JSON.stringify(engineLyrics);
    console.log('LyricsEditor: UI と Engine のデータ同期状態', { isDataSynced });
    
    try {
      await projectFileManager.current.saveProject('project');
      setSaveStatus('保存しました');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      setSaveStatus('保存エラー');
      console.error('Save error:', error);
    }
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
    <div className="lyrics-editor">
      <div className="lyrics-editor-header">
        <h3>歌詞編集</h3>
        <div className="lyrics-editor-controls">
          <button onClick={handleSave} className="save-button">
            プロジェクトを保存
          </button>
          {saveStatus && <span className="save-status">{saveStatus}</span>}
          {onClose && (
            <button onClick={() => {
              console.log('LyricsEditor: 編集終了処理開始');
              // アニメーション状態を強制更新
              if (engine && engine.instanceManager) {
                console.log('LyricsEditor: エンジン状態を更新');
                engine.arrangeCharsOnStage();
                engine.instanceManager.loadPhrases(engine.phrases, engine.charPositions);
                engine.instanceManager.update(engine.currentTime);
              }
              onClose();
              console.log('LyricsEditor: 編集終了処理完了');
            }} className="close-button">
              閉じる
            </button>
          )}
        </div>
      </div>

      <div className="lyrics-editor-content">
        <table className="lyrics-table">
          <thead>
            <tr>
              <th>フレーズ</th>
              <th>開始時刻 (秒)</th>
              <th>終了時刻 (秒)</th>
              <th>アクション</th>
            </tr>
          </thead>
          <tbody>
            {lyrics.map((phrase) => (
              <tr key={phrase.id}>
                <td 
                  className="editable-cell"
                  onClick={() => startEdit(phrase.id, 'phrase', phrase.phrase)}
                >
                  {editingCell?.phraseId === phrase.id && editingCell.field === 'phrase' ? (
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
                    phrase.phrase
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(phrase.id, 'start', phrase.start)}
                >
                  {editingCell?.phraseId === phrase.id && editingCell.field === 'start' ? (
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
                    formatTime(phrase.start)
                  )}
                </td>
                <td 
                  className="editable-cell time-cell"
                  onClick={() => startEdit(phrase.id, 'end', phrase.end)}
                >
                  {editingCell?.phraseId === phrase.id && editingCell.field === 'end' ? (
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
                    formatTime(phrase.end)
                  )}
                </td>
                <td className="action-cell">
                  <button 
                    onClick={() => deletePhrase(phrase.id)}
                    className="delete-button"
                    title="フレーズを削除"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {lyrics.length === 0 && (
          <div className="no-lyrics">
            歌詞データがありません。まず歌詞タブからJSONファイルを読み込んでください。
          </div>
        )}
      </div>
    </div>
  );
};

export default LyricsEditor;