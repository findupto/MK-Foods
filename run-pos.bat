@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title MK Foods POS

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  echo Run setup-windows.bat after installing Node.js LTS.
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
  echo Run setup-windows.bat after installing Rust with the MSVC toolchain.
  pause
  exit /b 1
)

if not exist "node_modules\@tauri-apps\cli" (
  echo Tauri CLI is not installed. Installing project dependencies...
  call npm install --include=dev
  if errorlevel 1 (
    echo.
    echo ERROR: Could not install Tauri dependencies.
    pause
    exit /b 1
  )
)

echo Starting MK Foods POS with Tauri...
call npm start
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo MK Foods POS exited with code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
