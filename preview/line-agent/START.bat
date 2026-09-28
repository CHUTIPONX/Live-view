@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%LOCALAPPDATA%\LineTrackingAgent"
set "APP=%ROOT%\app"
set "PROFILE=%ROOT%\ChromeProfile"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
  echo [ERROR] Chrome not found >> "%ROOT%\agent.log"
  exit /b 1
)

if not exist "%ROOT%\config.json" (
  echo [ERROR] config.json not found. Run SETUP.bat first. >> "%ROOT%\agent.log"
  exit /b 1
)

start "" /min "%CHROME%" ^
  --remote-debugging-port=9222 ^
  --remote-debugging-address=127.0.0.1 ^
  --remote-allow-origins=* ^
  --user-data-dir="%PROFILE%" ^
  --start-minimized ^
  "chrome-extension://ophjlpahpchlmihnnnihgmmeilfjmjjc/index.html"

timeout /t 4 /nobreak >nul

cd /d "%APP%"
node agent.mjs >> "%ROOT%\agent.log" 2>&1
