@echo off
cd /d "%~dp0"
echo Starting Budget Performance Manager V6...
echo.
echo The application will open in your default browser.
echo Press Ctrl+C to stop the server when you're done.
echo.
start http://localhost:3000
npm run dev
