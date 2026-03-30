@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   予算管理アプリ 配布用パッケージ作成
echo   (Node.js不要のスタンドアロン版)
echo ========================================
echo.

:: 1. ビルド実行
echo [1/3] アプリケーションをビルド中...
echo (これには数分かかる場合があります)
call npm run dist

:: dist\win-unpacked が作成されたか確認
if not exist "dist\win-unpacked\" (
    echo.
    echo [ERROR] ビルド成果物 (dist\win-unpacked) が見つかりません。
    echo ビルド中にエラーが発生した可能性があります。
    pause
    exit /b 1
)

:: 2. ZIP作成
echo.
echo [2/3] 配布用ZIPファイルを作成中...
powershell -Command "if (Test-Path 'BudgetApp-Standalone.zip') { Remove-Item 'BudgetApp-Standalone.zip' }; Compress-Archive -Path 'dist\win-unpacked\*' -DestinationPath 'BudgetApp-Standalone.zip' -Force"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] ZIPファイルの作成に失敗しました。
    pause
    exit /b 1
)

:: 3. 完了
echo.
echo ========================================
echo   完了！
echo ========================================
echo.
echo 作成されたファイル: BudgetApp-Standalone.zip
echo 場所: %CD%\BudgetApp-Standalone.zip
echo.
echo 使い方: 
echo 1. このZIPファイルを配布してください。
echo 2. 受け取った人はZIPを解凍します。
echo 3. 中にある「Budget Performance Manager.exe」を
echo    ダブルクリックするだけでアプリが起動します。
echo.
pause
