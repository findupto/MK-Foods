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

if not exist "node_modules\electron\cli.js" (
  echo Electron is not installed. Installing project dependencies...
  call npm install --include=dev
  if errorlevel 1 (
    echo.
    echo ERROR: Could not install dependencies.
    pause
    exit /b 1
  )
)

echo Starting MK Foods POS...
call npm start
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo MK Foods POS exited with code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
