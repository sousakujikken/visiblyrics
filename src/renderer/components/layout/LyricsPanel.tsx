import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Engine from '../../engine/Engine';
import { PhraseUnit, WordUnit, CharUnit } from '../../types/types';
import '../../styles/components.css';

interface LyricsPanelProps {
  engine?: Engine; // Engineインスタンスを受け取る
  onLyricsEditModeToggle?: () => void; // 歌詞編集モード切り替え
}

const LyricsPanel: React.FC<LyricsPanelProps> = ({ engine, onLyricsEditModeToggle }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lyricsText, setLyricsText] = useState<string>('');
  const [phraseTime, setPhraseTime] = useState<number>(3000); // デフォルト3秒/フレーズ
  const [wordTime, setWordTime] = useState<number>(500); // デフォルト0.5秒/単語
  const [charTime, setCharTime] = useState<number>(100); // デフォルト0.1秒/文字

  // プレーンテキストの歌詞をPhraseUnit[]形式に変換する関数
  const parsePlainTextLyrics = (text: string): PhraseUnit[] => {
    const lines = text.trim().split('\n').filter(line => line.trim() !== '');
    const phrases: PhraseUnit[] = [];
    let currentTime = 0;

    lines.forEach((line, lineIndex) => {
      const phraseStart = currentTime;
      const phraseEnd = phraseStart + phraseTime;
      
      // 単語に分割（スペースで分割、または日本語の場合は文節で分割）
      let words: string[] = [];
      
      // 日本語を含むかチェック
      const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(line);
      
      if (hasJapanese) {
        // 日本語の場合: 助詞や句読点で区切る簡易的な文節分割
        words = line.split(/([はがをにへとでやかもねよりからまでの、。！？\s]+)/)
          .filter(word => word.trim() !== '' && !/^[はがをにへとでやかもねよりからまでの、。！？\s]+$/.test(word));
      } else {
        // 英語等の場合: スペースで分割
        words = line.split(/\s+/).filter(word => word !== '');
      }
      const wordUnits: WordUnit[] = [];
      
      let wordStartTime = phraseStart;
      const timePerWord = (phraseEnd - phraseStart) / words.length;

      words.forEach((word, wordIndex) => {
        const wordStart = wordStartTime;
        const wordEnd = Math.min(wordStart + timePerWord, phraseEnd);
        
        // 文字に分割
        const chars = Array.from(word);
        const charUnits: CharUnit[] = [];
        
        let charStartTime = wordStart;
        const timePerChar = (wordEnd - wordStart) / chars.length;

        chars.forEach((char, charIndex) => {
          const charStart = charStartTime;
          const charEnd = Math.min(charStart + timePerChar, wordEnd);
          
          charUnits.push({
            id: `phrase_${lineIndex}_word_${wordIndex}_char_${charIndex}`,
            char: char,
            start: Math.round(charStart),
            end: Math.round(charEnd)
          });
          
          charStartTime = charEnd;
        });

        wordUnits.push({
          id: `phrase_${lineIndex}_word_${wordIndex}`,
          word: word,
          start: Math.round(wordStart),
          end: Math.round(wordEnd),
          chars: charUnits
        });
        
        wordStartTime = wordEnd;
      });

      phrases.push({
        id: `phrase_${lineIndex}`,
        phrase: line,
        start: Math.round(phraseStart),
        end: Math.round(phraseEnd),
        words: wordUnits
      });
      
      currentTime = phraseEnd;
    });

    return phrases;
  };

  // 歌詞データのバリデーション関数
  const validateLyricsData = (data: any): boolean => {
    if (!Array.isArray(data)) {
      setError('歌詞データは配列である必要があります。');
      return false;
    }
    
    for (let i = 0; i < data.length; i++) {
      const phrase = data[i];
      
      // フレーズの必須フィールドをチェック
      if (!phrase.phrase || typeof phrase.phrase !== 'string') {
        setError(`フレーズ ${i}: phraseフィールドが必要です。`);
        return false;
      }
      
      if (typeof phrase.start !== 'number' || typeof phrase.end !== 'number') {
        setError(`フレーズ ${i}: start/endフィールドは数値である必要があります。`);
        return false;
      }
      
      if (phrase.start >= phrase.end) {
        setError(`フレーズ ${i}: start時間がend時間以上になっています。`);
        return false;
      }
      
      // 単語配列をチェック
      if (!Array.isArray(phrase.words)) {
        setError(`フレーズ ${i}: wordsフィールドは配列である必要があります。`);
        return false;
      }
      
      // 各単語をチェック
      for (let j = 0; j < phrase.words.length; j++) {
        const word = phrase.words[j];
        
        if (!word.word || typeof word.word !== 'string') {
          setError(`フレーズ ${i}, 単語 ${j}: wordフィールドが必要です。`);
          return false;
        }
        
        if (typeof word.start !== 'number' || typeof word.end !== 'number') {
          setError(`フレーズ ${i}, 単語 ${j}: start/endフィールドは数値である必要があります。`);
          return false;
        }
        
        // 文字配列をチェック
        if (!Array.isArray(word.chars)) {
          setError(`フレーズ ${i}, 単語 ${j}: charsフィールドは配列である必要があります。`);
          return false;
        }
        
        // 各文字をチェック
        for (let k = 0; k < word.chars.length; k++) {
          const char = word.chars[k];
          
          if (!char.char || typeof char.char !== 'string') {
            setError(`フレーズ ${i}, 単語 ${j}, 文字 ${k}: charフィールドが必要です。`);
            return false;
          }
          
          if (typeof char.start !== 'number' || typeof char.end !== 'number') {
            setError(`フレーズ ${i}, 単語 ${j}, 文字 ${k}: start/endフィールドは数値である必要があります。`);
            return false;
          }
        }
      }
    }
    
    return true;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    setSuccessMessage(null);
    const file = acceptedFiles[0];
    
    if (file) {
      setFileName(file.name);
      
      file.text().then(text => {
        try {
          const json = JSON.parse(text);
          
          // データバリデーション
          if (!validateLyricsData(json)) {
            return; // エラーはvalidateData内で設定済み
          }
          
          // Engineが利用可能な場合、歌詞をロード
          if (engine) {
            engine.loadLyrics(json);
            console.log('歌詞データをEngineにロードしました:', file.name);
            setError(null); // エラーをクリア
            setSuccessMessage(`歌詞データ "${file.name}" を正常に読み込みました。`);
            
            // 5秒後に成功メッセージを消去
            setTimeout(() => {
              setSuccessMessage(null);
            }, 5000);
          } else {
            setError('Engineが初期化されていません。');
            console.error('Engine not available for loading lyrics');
          }
        } catch (e) {
          setError('JSONの解析中にエラーが発生しました。');
          console.error('JSON parse error:', e);
        }
      }).catch(err => {
        setError('ファイルの読み込み中にエラーが発生しました。');
        console.error('File read error:', err);
      });
    }
  }, [engine, validateLyricsData]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json']
    },
    multiple: false
  });

  // テキストフィールドから歌詞を読み込む関数
  const handleLoadTextLyrics = () => {
    setError(null);
    setSuccessMessage(null);

    if (!lyricsText.trim()) {
      setError('歌詞テキストを入力してください。');
      return;
    }

    if (!engine) {
      setError('Engineが初期化されていません。');
      return;
    }

    try {
      const phrases = parsePlainTextLyrics(lyricsText);
      engine.loadLyrics(phrases);
      setSuccessMessage('テキストから歌詞データを正常に読み込みました。');
      
      // 5秒後に成功メッセージを消去
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (e) {
      setError('歌詞の変換中にエラーが発生しました。');
      console.error('Lyrics parsing error:', e);
    }
  };

  return (
    <div className="panel-content">
      <h3>歌詞データ</h3>
      
      {/* 歌詞編集ボタン */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onLyricsEditModeToggle}
          disabled={!engine}
          style={{
            padding: '10px 16px',
            backgroundColor: engine ? '#28a745' : '#666',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: engine ? 'pointer' : 'not-allowed',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          歌詞を編集
        </button>
        {!engine && (
          <div style={{ color: '#ffaa00', marginTop: '8px', fontSize: '12px' }}>
            注意: 先にテンプレートを選択してEngineを初期化してください
          </div>
        )}
      </div>
      
      {/* テキスト入力セクション */}
      <div style={{ marginBottom: '20px' }}>
        <h4>テキストから歌詞を入力</h4>
        <textarea
          value={lyricsText}
          onChange={(e) => setLyricsText(e.target.value)}
          placeholder="歌詞を入力してください（1行1フレーズ）"
          style={{
            width: '100%',
            height: '150px',
            padding: '10px',
            backgroundColor: '#111',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: '4px',
            resize: 'vertical',
            fontFamily: 'monospace'
          }}
        />
        
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px' }}>
            フレーズ間隔:
            <input
              type="number"
              value={phraseTime}
              onChange={(e) => setPhraseTime(Number(e.target.value))}
              min="100"
              step="100"
              style={{
                width: '80px',
                marginLeft: '5px',
                padding: '4px',
                backgroundColor: '#111',
                color: '#fff',
                border: '1px solid #333',
                borderRadius: '4px'
              }}
            />
            ms
          </label>
          
          <button
            onClick={handleLoadTextLyrics}
            style={{
              padding: '8px 16px',
              backgroundColor: '#09f',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            テキストを読み込む
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
        <h4>または JSONファイルから読み込み</h4>
      </div>
      
      <div 
        {...getRootProps()} 
        className="dropzone"
        style={{
          borderColor: isDragActive ? '#09f' : undefined
        }}
      >
        <input {...getInputProps()} />
        
        {fileName ? (
          <p>読み込み済み: {fileName}</p>
        ) : (
          <>
            <p>JSONファイルをドラッグ＆ドロップ</p>
            <p>または</p>
            <button
              style={{
                padding: '8px 16px',
                backgroundColor: '#444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ファイルを選択
            </button>
          </>
        )}
      </div>
      
      {successMessage && (
        <div style={{ color: '#4caf50', marginTop: '10px' }}>
          ✓ {successMessage}
        </div>
      )}
      
      {error && (
        <div style={{ color: '#ff6b6b', marginTop: '10px' }}>
          エラー: {error}
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <h4>使用方法</h4>
        {!engine && (
          <div style={{ color: '#ffaa00', marginBottom: '10px' }}>
            注意: Engineが初期化されていません。先にテンプレートを選択してください。
          </div>
        )}
        <p style={{ marginBottom: '10px' }}>
          <strong>方法1: テキスト入力</strong><br />
          歌詞を直接テキストエリアに入力し、「テキストを読み込む」ボタンをクリックします。
          1行が1フレーズとして処理されます。フレーズ間隔は調整可能です。
        </p>
        <p style={{ marginBottom: '10px' }}>
          <strong>方法2: JSONファイル</strong><br />
          Visiblyrics フォーマットのJSON歌詞ファイルをドロップするか、ボタンをクリックして選択してください。
        </p>
        <p>
          JSONは以下の形式に従う必要があります:
        </p>
        <pre style={{ 
          backgroundColor: '#111', 
          padding: '10px',
          borderRadius: '4px',
          overflowX: 'auto',
          fontSize: '12px'
        }}>
{`[
  {
    "phrase": "こんにちは",
    "start": 1000,
    "end": 3500,
    "words": [
      {
        "word": "こんにちは",
        "start": 1000,
        "end": 3500,
        "chars": [
          {"char": "こ", "start": 1000, "end": 1500},
          {"char": "ん", "start": 1500, "end": 2000},
          ...
        ]
      }
    ]
  },
  ...
]`}
        </pre>
      </div>
    </div>
  );
};

export default LyricsPanel;
