# Visiblyrics

Visiblyrics（ビジブリリックス）は、歌詞アニメーション動画を作成するためのデスクトップアプリケーションです。カラオケスタイルのテキストアニメーションをテンプレートベースで簡単に作成できます。

## 機能

- 階層的なタイムライン編集（フレーズ、単語、文字単位）
- テンプレートベースのアニメーションシステム
- リアルタイムプレビュー
- 高品質な動画エクスポート（WebCodecs使用）
- カスタマイズ可能なテンプレートパラメータ

## インストール方法

### 必要な環境

- Node.js 18以上
- npm または yarn

### セットアップ

1. リポジトリをクローン
```bash
git clone https://github.com/sousakujikken/visiblyrics.git
cd visiblyrics
```

2. 依存関係をインストール
```bash
npm install
```

## 起動方法

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` にアクセスしてください。

### プロダクションビルド

```bash
npm run build
npm run preview  # ビルド結果をプレビュー
```

## 使い方

### 基本的な操作手順

1. **プロジェクトの新規作成**
   - アプリケーションを起動後、新しいプロジェクトが自動的に作成されます

2. **歌詞の入力**
   - 左側のパネルで「歌詞」タブを選択
   - テキストエリアに歌詞を入力（1行1フレーズ）
   - 「歌詞を解析」ボタンをクリック

3. **タイミングの設定**
   - タイムライン上でフレーズマーカーをドラッグして開始/終了時間を調整
   - 各フレーズをクリックして選択し、詳細なタイミングを設定

4. **テンプレートの適用**
   - 「テンプレート」タブでアニメーションテンプレートを選択
   - 「選択したフレーズに適用」または「すべてのフレーズに適用」をクリック

5. **パラメータの調整**
   - 「パラメータ」タブで各テンプレートのパラメータを細かく調整
   - リアルタイムでプレビューを確認

6. **動画のエクスポート**
   - 「エクスポート」タブを選択
   - 解像度とフレームレートを設定
   - 「エクスポート開始」ボタンをクリック

### プロジェクトファイルの管理

- **保存**: Ctrl/Cmd + S でプロジェクトを保存
- **開く**: 「ファイル」メニューから既存のプロジェクト（.vly）を開く
- **エクスポート**: プロジェクトデータをJSONファイルとして保存

## テンプレート開発

新しいアニメーションテンプレートを作成する場合は、以下のドキュメントを参照してください：

📚 **テンプレート実装ガイド**: `/docs/template-implementation-guide.md`

このガイドには以下の内容が含まれています：
- テンプレートの基本構造
- 階層アニメーションモデルの説明
- 実装に必要なメソッドの詳細
- サンプルコード

## プロジェクト構造

```
visiblyrics/
├── src/
│   ├── components/    # UIコンポーネント
│   ├── engine/        # アニメーションエンジン
│   ├── templates/     # アニメーションテンプレート
│   ├── types/         # TypeScript型定義
│   └── export/        # 動画エクスポート機能
├── docs/             # ドキュメント
└── public/           # 静的ファイル
```

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド
npm run lint     # ESLintの実行
npm run preview  # ビルド結果のプレビュー
```

## ライセンス

このソフトウェアは GNU General Public License v3.0 (GPL-3.0) の下でライセンスされています。

詳細については、[LICENSE](./LICENSE) ファイルを参照してください。

### GPL-3.0 ライセンスについて

- このソフトウェアを自由に使用、研究、共有、改変することができます
- 改変版を配布する場合は、同じGPL-3.0ライセンスを適用する必要があります
- 商用利用も可能ですが、ソースコードの開示が必要です

Copyright (C) 2024 Visiblyrics Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

## 貢献

プルリクエストを歓迎します。大きな変更を行う場合は、まずissueを作成して変更内容について議論してください。

## サポート

問題が発生した場合は、GitHubのissueセクションで報告してください。