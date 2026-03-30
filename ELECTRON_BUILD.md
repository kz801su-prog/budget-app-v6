# Electron Desktop App のビルド方法

## 前提条件
- Node.js と npm がインストールされていること
- プロジェクトの依存関係がインストール済みであること

## 開発モードで実行（テスト用）
```bash
npm run electron-dev
```
これでElectronウィンドウが開き、アプリが起動します。

## インストーラーの作成

### 方法1: 簡易版（ポータブル実行ファイル）
現在のNext.jsアプリは`"use client"`を多用しているため、静的エクスポートに制限があります。
代わりに、以下の手順でポータブル版を作成できます：

1. **Next.jsをビルド**
```bash
npm run build
```

2. **配布用フォルダを作成**
```bash
mkdir dist-portable
xcopy /E /I .next dist-portable\.next
xcopy /E /I public dist-portable\public
xcopy /E /I electron dist-portable\electron
copy package.json dist-portable\
copy next.config.ts dist-portable\
```

3. **依存関係をインストール（本番用のみ）**
```bash
cd dist-portable
npm install --production
```

4. **起動スクリプトを作成**
`dist-portable/start.bat` を作成：
```bat
@echo off
start /B npm run start
timeout /t 3
start http://localhost:3000
```

### 方法2: Vercel等のWebホスティング（推奨）
このアプリはブラウザベースなので、Webホスティングが最も簡単です：

1. GitHubにコードをプッシュ
2. Vercelでデプロイ
3. URLを共有

## トラブルシューティング

### Electronビルドエラーが出る場合
Next.js 16.1.1は静的エクスポートに一部制限があります。
代わりに、上記の「ポータブル版」を使用してください。

### 他のPCで使用する場合
1. `dist-portable`フォルダ全体をコピー
2. Node.jsをインストール（https://nodejs.org/）
3. `start.bat`をダブルクリック
