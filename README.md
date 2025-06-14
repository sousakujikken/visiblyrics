# Visiblyrics

Visiblyrics（ビジブリリックス）は、歌詞アニメーション動画を作成するためのElectronベースのデスクトップアプリケーションです。カラオケスタイルのテキストアニメーションをテンプレートベースで簡単に作成し、高品質な動画として出力できます。

## 機能

- 階層的なタイムライン編集（フレーズ、単語、文字単位）
- テンプレートベースのアニメーションシステム
- リアルタイムプレビュー（PIXI.js WebGL レンダリング）
- 高品質な動画エクスポート（WebCodecs使用）
- カスタマイズ可能なテンプレートパラメータ
- 音声ファイル対応とタイミング同期
- プロジェクトファイル保存・読み込み機能
- デスクトップアプリケーションとしての快適な操作性

## インストール方法

### 必要な環境

- Node.js 18以上
- npm
- Electron対応OS（Windows、macOS、Linux）

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

3. アプリケーションをビルド
```bash
npm run build
```

## 起動方法

### 開発モードでの起動

```bash
npm run dev
```

このコマンドでRenderer（UI）とMain（Electron）プロセスの両方が起動し、開発用のElectronアプリケーションが起動します。

### Electronアプリケーションの起動

```bash
npm run electron
```

### アプリケーションのパッケージ化

```bash
npm run package      # 現在のプラットフォーム用
npm run package:all  # 全プラットフォーム用（Windows、macOS、Linux）
```

## 使い方

### 基本的な操作手順

1. **アプリケーションの起動**
   - Electronアプリケーションを起動すると、メインウィンドウが表示されます

2. **音声ファイルの読み込み**
   - 「音楽」タブから音声ファイル（MP3、WAVなど）をドラッグ&ドロップまたは選択
   - 波形が表示され、再生コントロールが利用可能になります

3. **歌詞の入力**
   - 「歌詞」タブでテキストエリアに歌詞を入力（1行1フレーズ）
   - 「歌詞を解析」ボタンで階層的なタイムラインマーカーを生成

4. **タイミングの設定**
   - タイムライン上でフレーズマーカーをドラッグして開始/終了時間を調整
   - 階層構造（フレーズ→単語→文字）でより細かいタイミング制御が可能

5. **テンプレートの適用**
   - 「テンプレート」タブでアニメーションテンプレートを選択
   - 選択したフレーズまたは全フレーズにテンプレートを適用

6. **パラメータの調整**
   - パラメータエディタで各テンプレートの詳細設定を調整
   - リアルタイムプレビューで即座に結果を確認

7. **動画のエクスポート**
   - 「エクスポート」タブで解像度、フレームレート、品質を設定
   - 「エクスポート開始」で動画ファイルを生成・保存

### プロジェクトファイルの管理

- **保存**: 「保存」タブまたはCtrl/Cmd + S でプロジェクトを保存（.vly形式）
- **開く**: ファイルメニューまたはドラッグ&ドロップで既存プロジェクトを開く
- **自動保存**: 作業中の変更は自動的に保存されます
- **エクスポート**: プロジェクトデータのJSONエクスポート機能

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
npm run dev              # 開発モード起動（Renderer + Main）
npm run dev:renderer     # Rendererプロセスのみ開発モード
npm run dev:main         # Mainプロセスのみビルド（watch）
npm run build            # プロダクションビルド
npm run build:renderer   # Rendererプロセスビルド
npm run build:main       # Mainプロセスビルド
npm run lint             # ESLintの実行
npm run electron         # Electronアプリ起動
npm run package          # アプリパッケージ化
npm run package:all      # 全プラットフォーム向けパッケージ化
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