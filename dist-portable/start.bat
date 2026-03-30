@echo off
chcp 65001 >nul
echo ========================================
echo Budget Performance Manager 起動中...
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo エラー: 依存関係がインストールされていません。
    echo.
    echo 先に install.bat を実行してください。
    echo.
    pause
    exit /b 1
)

REM Check if port 3000 is already in use
netstat -ano | findstr ":3000" >nul
if %errorlevel% equ 0 (
    echo ポート3000は既に使用中です。
    echo 既存のサーバーに接続します...
    timeout /t 2 /nobreak >nul
    start http://localhost:3000
    echo.
    echo ブラウザでアプリが開きました。
    echo.
    pause
    exit /b 0
)

echo サーバーを起動しています...
echo （ブラウザが自動的に開きます）
echo.
echo アプリを終了するには、このウィンドウを閉じてください。
echo.

REM Start the Next.js server
start /B npm run start

REM Wait for server to start
timeout /t 5 /nobreak >nul

REM Open browser
start http://localhost:3000

REM Keep the window open
echo.
echo アプリが起動しました。
echo このウィンドウを閉じるとアプリも終了します。
echo.
pause >nul
