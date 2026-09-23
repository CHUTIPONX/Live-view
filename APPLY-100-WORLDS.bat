@echo off
chcp 65001 >nul
title Live-view v1.9.0 - 100 WORLDS
echo.
echo ==========================================
echo   LIVE-VIEW v1.9.0 - 100 WORLDS PATCH
echo ==========================================
echo.
python apply_100_worlds.py
if errorlevel 1 (
  echo.
  echo PATCH FAILED - no deploy was performed.
  pause
  exit /b 1
)
echo.
echo Running npm test...
call npm test
if errorlevel 1 (
  echo.
  echo TEST FAILED - check the error above.
  pause
  exit /b 1
)
echo.
echo ALL TESTS PASSED.
echo You can now commit/push and redeploy Vercel.
pause
