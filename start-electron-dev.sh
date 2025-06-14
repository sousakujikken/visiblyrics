#!/bin/bash

echo "Starting Electron development environment..."

# ViteサーバーがReactアプリでElectronTestコンポーネントを表示していることを確認
echo "ElectronTest component should be active in src/renderer/main.tsx"

# Electronを開発モードで起動
echo "Starting Electron app..."
NODE_ENV=development npx electron dist/main/main/main.js