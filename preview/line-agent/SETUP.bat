@echo off
setlocal EnableExtensions
chcp 65001 >nul
title LINE Tracking Agent - Setup

set "ROOT=%LOCALAPPDATA%\LineTrackingAgent"
set "APP=%ROOT%\app"
set "PROFILE=%ROOT%\ChromeProfile"

echo.
echo ===============================================
echo   LINE Tracking Agent - ติดตั้งครั้งแรก
echo ===============================================
echo.

where node >nul 2>nul || (
  echo [ERROR] ไม่พบ Node.js 20+
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo [ERROR] ต้องใช้ Node.js 20 ขึ้นไป
  pause
  exit /b 1
)

if not exist "%ROOT%" mkdir "%ROOT%"
if not exist "%APP%" mkdir "%APP%"

echo [1/5] Copy agent files...
xcopy "%~dp0*" "%APP%\" /E /I /Y /EXCLUDE:"%~dp0setup-exclude.txt" >nul

echo [2/5] Install local dependency...
pushd "%APP%"
call npm install --omit=dev
if errorlevel 1 (
  popd
  echo [ERROR] npm install ไม่สำเร็จ
  pause
  exit /b 1
)
popd

echo.
set /p "SERVER_URL=ใส่ URL เว็บ Vercel เช่น https://your-project.vercel.app : "
if "%SERVER_URL%"=="" (
  echo [ERROR] ต้องใส่ URL Vercel
  pause
  exit /b 1
)

for /f %%S in ('powershell -NoProfile -Command "$b=New-Object byte[] 32; $r=[Security.Cryptography.RandomNumberGenerator]::Create(); $r.GetBytes($b); (($b|ForEach-Object {$_.ToString('x2')}) -join '')"') do set "AGENT_SECRET=%%S" 

echo [3/5] Save local config...
powershell -NoProfile -Command "$o=[ordered]@{serverUrl='%SERVER_URL%';secret='%AGENT_SECRET%';debugPort=9222;roomName='ติดตามของ ขอเลขพัสดุ'}; $j=$o|ConvertTo-Json; [IO.File]::WriteAllText('%ROOT%\config.json',$j,(New-Object Text.UTF8Encoding($false)))"

echo [4/5] Create auto-start task...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Join-Path $env:LOCALAPPDATA 'LineTrackingAgent\app\START-HIDDEN.vbs'; $a=New-ScheduledTaskAction -Execute 'wscript.exe' -Argument (([char]34)+$p+([char]34)); $t=New-ScheduledTaskTrigger -AtLogOn; Register-ScheduledTask -TaskName 'LINE Tracking Agent' -Action $a -Trigger $t -Description 'Background LINE parcel tracking agent' -Force | Out-Null"
if errorlevel 1 echo [WARN] สร้าง Task Scheduler ไม่สำเร็จ สามารถใช้ START.bat เองได้

echo [5/5] Open dedicated Chrome profile for LINE setup...

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if exist "%CHROME%" (
  start "" "%CHROME%" --user-data-dir="%PROFILE%" "https://chromewebstore.google.com/detail/line/ophjlpahpchlmihnnnihgmmeilfjmjjc"
) else (
  echo [WARN] หา Chrome ไม่เจอ เปิด Chrome เองแล้วใช้ profile แยกได้
)

echo.
echo ==============================================================
echo   สำคัญ: ตั้งค่า Vercel Environment Variable
echo ==============================================================
echo.
echo LINE_AGENT_SECRET
echo %AGENT_SECRET%
echo.
echo ถ้าโปรเจกต์ยังไม่มี Vercel Blob ให้เชื่อม Blob Storage ก่อน
echo ถ้าเว็บเดิมใช้ PLSM_CONFIG_STORE=blob อยู่แล้ว ปกติใช้ Blob เดิมได้เลย
echo.
echo ขั้นต่อไป:
echo 1. Copy secret ด้านบนไปใส่ Vercel Project - Settings - Environment Variables
echo 2. ใน Chrome ที่เปิดขึ้นมา ติดตั้ง LINE Extension
echo 3. Login LINE ด้วย QR ตามปกติ
echo 4. เปิดกลุ่ม "ติดตามของ ขอเลขพัสดุ" ค้างไว้
echo 5. รัน "%APP%\START.bat" หนึ่งครั้งเพื่อทดสอบ
echo.
echo หลังจากนี้ Task Scheduler จะเปิด Agent ให้อัตโนมัติตอน Login Windows
echo.
pause
