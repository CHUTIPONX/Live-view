@echo off
setlocal
cd /d %~dp0
echo ============================================
echo   Pancake Live Sales Monitor - INSTALL
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 20+ first.
  pause
  exit /b 1
)
node -e "const m=Number(process.versions.node.split('.')[0]); if(m<20) process.exit(1)"
if errorlevel 1 (
  echo [ERROR] Node.js 20+ is required.
  node -v
  pause
  exit /b 1
)
call npm i
if errorlevel 1 goto :fail
call npm test
if errorlevel 1 goto :fail
echo.
echo [OK] Install + self-test complete.
echo Run START.bat
pause
exit /b 0
:fail
echo.
echo [ERROR] Installation/test failed.
pause
exit /b 1
