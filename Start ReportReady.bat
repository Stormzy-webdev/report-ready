@echo off
rem Double-click to start ReportReady: the AI (Ollama), the app, and a browser tab.
rem Close this window to stop the app.
title ReportReady
cd /d "%~dp0"

rem Start Ollama for AI drafting if it isn't running yet.
tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
    echo Starting Ollama for AI drafting...
    start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
  ) else (
    echo Ollama is not installed, so AI drafting won't work. Everything else will.
  )
)

rem If the app is already running, just open it.
netstat -ano | find ":5173 " | find "LISTENING" >nul
if not errorlevel 1 (
  echo ReportReady is already running. Opening it...
  start "" http://localhost:5173
  timeout /t 3 >nul
  exit /b
)

echo Starting ReportReady... a browser tab will open in a few seconds.
echo Keep this window open while you use the app. Close it to stop.
echo.
start "" cmd /c "timeout /t 8 >nul && start http://localhost:5173"
call npm run dev
pause
