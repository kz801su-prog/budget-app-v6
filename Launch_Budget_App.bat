@echo off
title Budget Performance Manager Launcher
setlocal

:: アプリケーションのディレクトリに移動
cd /d "%~dp0"

echo ===========================================
echo   Budget Performance Manager を起動しています...
echo ===========================================
echo.

:: ポート3000が使用中か確認
netstat -ano | findstr :3000 > nul
if %errorlevel% equ 0 (
    echo [INFO] サーバーは既に起動しています。
    echo [INFO] ブラウザでアプリを開きます...
    start http://localhost:3000
    timeout /t 3
    exit
)

echo [INFO] 開発サーバーを新しく起動します。
echo [INFO] 起動には数秒かかります。このウィンドウは閉じないでください。
echo.

:: 開発サーバーを別ウィンドウで起動して、このウィンドウでブラウザを待機する
:: または、現在のウィンドウで起動して、数秒後にブラウザを開く
start "Budget App Dev Server" /min npm run dev

echo [WAIT] サーバーの準備ができるまでお待ちください...
:check_server
timeout /t 2 /nobreak > nul
netstat -ano | findstr :3000 > nul
if %errorlevel% neq 0 (
    goto check_server
)

echo [OK] サーバーが起動しました!
echo [INFO] ブラウザを開きます...
start http://localhost:3000

echo.
echo ===========================================
echo   作業を開始できます。
echo   終了する時はこのウィンドウを閉じてください。
echo ===========================================
echo.
pause
