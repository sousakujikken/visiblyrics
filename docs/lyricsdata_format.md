# 歌詞データ仕様書

本ドキュメントでは、Visiblyricsプロジェクトで使用される歌詞データの構造について説明します。

## データ構造概要

歌詞データは階層構造で構成されており、以下の3つのレベルがあります：

1. **フレーズ（Phrase）** - 歌詞の句や文単位
2. **単語（Word）** - フレーズ内の個別の単語
3. **文字（Character）** - 単語内の個別の文字

## JSONスキーマ

### ルートレベル

歌詞データは配列形式で、各要素がフレーズオブジェクトです。

```json
[
  {フレーズオブジェクト},
  {フレーズオブジェクト},
  ...
]
```

### フレーズオブジェクト

```typescript
interface Phrase {
  id: string;        // フレーズの一意識別子（例: "phrase_0"）
  phrase: string;    // フレーズ全体のテキスト
  start: number;     // 開始時間（ミリ秒）
  end: number;       // 終了時間（ミリ秒）
  words: Word[];     // 含まれる単語の配列
}
```

### 単語オブジェクト

```typescript
interface Word {
  id: string;        // 単語の一意識別子（例: "phrase_0_word_0"）
  word: string;      // 単語のテキスト
  start: number;     // 開始時間（ミリ秒）
  end: number;       // 終了時間（ミリ秒）
  chars: Character[]; // 含まれる文字の配列
}
```

### 文字オブジェクト

```typescript
interface Character {
  id: string;        // 文字の一意識別子（例: "phrase_0_word_0_char_0"）
  char: string;      // 文字
  start: number;     // 開始時間（ミリ秒）
  end: number;       // 終了時間（ミリ秒）
}
```

## ID命名規則

- フレーズID: `phrase_{フレーズ番号}`
- 単語ID: `phrase_{フレーズ番号}_word_{単語番号}`
- 文字ID: `phrase_{フレーズ番号}_word_{単語番号}_char_{文字番号}`

番号は0から開始します。

## タイミング仕様

- すべての時間はミリ秒単位で指定
- 階層構造において、子要素のタイミングは親要素の範囲内に収まる必要があります
- 各レベルでの時間範囲：
  - フレーズ: そのフレーズ全体の発音時間
  - 単語: その単語の発音時間（フレーズ内）
  - 文字: その文字の発音時間（単語内）

## 実例

以下は`src/renderer/data/testLyrics.json`からの実際の例です：

### 英語フレーズの例

```json
{
  "id": "phrase_0",
  "phrase": "Hello",
  "start": 1000,
  "end": 3500,
  "words": [
    {
      "id": "phrase_0_word_0",
      "word": "Hello",
      "start": 1000,
      "end": 3500,
      "chars": [
        {"id": "phrase_0_word_0_char_0", "char": "H", "start": 1000, "end": 1500},
        {"id": "phrase_0_word_0_char_1", "char": "e", "start": 1500, "end": 2000},
        {"id": "phrase_0_word_0_char_2", "char": "l", "start": 2000, "end": 2500},
        {"id": "phrase_0_word_0_char_3", "char": "l", "start": 2500, "end": 3000},
        {"id": "phrase_0_word_0_char_4", "char": "o", "start": 3000, "end": 3500}
      ]
    }
  ]
}
```

### 日本語フレーズの例

```json
{
  "id": "phrase_1",
  "phrase": "世界の国から",
  "start": 4000,
  "end": 8000,
  "words": [
    {
      "id": "phrase_1_word_0",
      "word": "世界",
      "start": 4000,
      "end": 5000,
      "chars": [
        {"id": "phrase_1_word_0_char_0", "char": "世", "start": 4000, "end": 4500},
        {"id": "phrase_1_word_0_char_1", "char": "界", "start": 4500, "end": 5000}
      ]
    },
    {
      "id": "phrase_1_word_1",
      "word": "の",
      "start": 5000,
      "end": 5500,
      "chars": [
        {"id": "phrase_1_word_1_char_0", "char": "の", "start": 5000, "end": 5500}
      ]
    }
    // ...その他の単語
  ]
}
```

## 使用上の注意

1. **一意性**: 各IDは全体を通して一意である必要があります
2. **時間の整合性**: 子要素の時間範囲は親要素内に収まる必要があります
3. **文字エンコーディング**: UTF-8エンコーディングを使用
4. **言語対応**: 日本語、英語など多言語対応
5. **精度**: タイミングはミリ秒単位で正確に指定してください

## データ生成・編集について

このデータ構造は手動編集も可能ですが、通常は以下の方法で生成されます：

- SRTファイルからの変換
- 音声解析ツールによる自動生成
- タイミング調整ツールによる編集

詳細な生成・編集方法については、プロジェクトの他のドキュメントを参照してください。