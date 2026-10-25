@echo off
setlocal
cd /d "%~dp0.."

where pwsh >nul 2>nul
if errorlevel 1 (
  echo PowerShell 7 is required to run this script.
  pause
  exit /b 1
)

pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" %*
set "exitCode=%ERRORLEVEL%"

echo.
if not "%exitCode%"=="0" (
  echo Start failed with exit code %exitCode%.
  goto finished
)
if /i "%~1"=="-Stop" goto stopped
if /i "%~1"=="-Status" goto finished
echo PiChat services are running in the background.
echo Closing this window will not stop them.
echo To stop: scripts\start-local.cmd -Stop
goto finished
:stopped
echo Stop command finished.
:finished
pause
exit /b %exitCode%
