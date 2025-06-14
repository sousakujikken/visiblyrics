import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Engine from '../../engine/Engine';
import { PhraseUnit } from '../../types/types';
import '../../styles/components.css';

interface LyricsPanelProps {
  engine?: Engine; // Engineインスタンスを受け取る
}

const LyricsPanel: React.FC<LyricsPanelProps> = ({ engine }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  return (
    <div className="panel-content">
      <h3>歌詞データ</h3>
      
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
        <p>
          Visiblyrics フォーマットのJSON歌詞ファイルをドロップするか、ボタンをクリックして選択してください。
        </p>
        {!engine && (
          <div style={{ color: '#ffaa00', marginBottom: '10px' }}>
            注意: Engineが初期化されていません。先にテンプレートを選択してください。
          </div>
        )}
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
