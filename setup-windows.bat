@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title MK Foods POS - Setup

echo.
echo ========================================
echo        MK FOODS POS - TAURI SETUP
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm is not available in PATH.
  pause
  exit /b 1
)
where cargo >nul 2>&1
if errorlevel 1 (
  echo ERROR: Rust/Cargo is not installed or not available in PATH.
  echo Install Rust with the MSVC toolchain, then run this file again.
  pause
  exit /b 1
)

echo Node.js:
node --version
echo npm:
npm --version
echo Cargo:
cargo --version

echo.
echo Installing MK Foods POS Tauri dependencies...
call npm install --include=dev
if errorlevel 1 (
  echo.
  echo ERROR: Tauri dependency installation failed.
  pause
  exit /b 1
)

echo.
echo Starting MK Foods POS with Tauri...
call npm start
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo MK Foods POS exited with code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
