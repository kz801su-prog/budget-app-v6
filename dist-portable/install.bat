@echo off
REM スクリプトのあるディレクトリに移動
cd /d "%~dp0"

chcp 65001 >nul
echo ========================================
echo Budget Performance Manager
echo 初回セットアップ
echo ========================================
echo.
echo 作業ディレクトリ: %CD%
echo.
echo Node.jsのバージョンを確認中...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo エラー: Node.jsがインストールされていません。
    echo.
    echo https://nodejs.org/ からNode.jsをインストールしてください。
    echo インストール後、PCを再起動してから再度実行してください。
    pause
    exit /b 1
)

echo Node.js: インストール済み
echo.
echo 依存関係をインストール中...
echo （初回のみ数分かかります）
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo エラー: インストールに失敗しました。
    echo インターネット接続を確認して、再度実行してください。
    pause
    exit /b 1
)

echo.
echo ========================================
echo インストール完了！
echo ========================================
echo.
echo 次回からは start.bat をダブルクリックして起動してください。
echo.
pause
