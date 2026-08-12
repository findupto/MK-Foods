@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title MK Foods POS - Setup

echo.
echo ========================================
echo        MK FOODS POS - WINDOWS SETUP
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  echo Install the current Node.js LTS release, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not available in PATH.
  echo Reinstall Node.js LTS and ensure npm is added to PATH.
  pause
  exit /b 1
)

echo Node.js:
npm --version
node --version

echo.
echo Installing MK Foods POS dependencies...
call npm install --include=dev
if errorlevel 1 (
  echo.
  echo ERROR: Dependency installation failed.
  pause
  exit /b 1
)

echo.
echo Setup complete. Launching MK Foods POS...
call npm start
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo MK Foods POS exited with code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
