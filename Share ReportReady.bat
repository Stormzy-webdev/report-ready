@echo off
rem Double-click to get a temporary link to ReportReady that works from any device.
rem The link only works while this window stays open. Close it to switch the link off.
title ReportReady - sharing link
cd /d "%~dp0"

rem Make sure the app is running first.
netstat -ano | find ":5173 " | find "LISTENING" >nul
if errorlevel 1 (
  echo Starting ReportReady first...
  start "ReportReady" "Start ReportReady.bat"
  timeout /t 15 >nul
)

set CLOUDFLARED=%ProgramFiles(x86)%\cloudflared\cloudflared.exe
if not exist "%CLOUDFLARED%" set CLOUDFLARED=cloudflared

echo.
echo ================================================================
echo  Creating your link. In a few seconds, look below for a line like
echo     https://some-random-words.trycloudflare.com
echo  Copy that link and send it. It works while this window is open.
echo  Close this window to switch the link off.
echo ================================================================
echo.
"%CLOUDFLARED%" tunnel --no-autoupdate --url http://localhost:5173
pause
