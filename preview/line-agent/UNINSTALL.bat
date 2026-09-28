@echo off
setlocal
chcp 65001 >nul
echo Removing LINE Tracking Agent auto-start...
schtasks /Delete /TN "LINE Tracking Agent" /F >nul 2>nul
echo.
echo Auto-start removed.
echo Local data is still kept at:
echo %LOCALAPPDATA%\LineTrackingAgent
echo.
echo ถ้าต้องการลบข้อมูลด้วย ให้ปิด Agent/Chrome profile ก่อน แล้วลบโฟลเดอร์นี้เอง
pause
