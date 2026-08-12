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

echo Node.js:
node --version
npm --version

echo.
echo Installing MK Foods POS runtime from the npm registry...
REM Runtime installation deliberately omits devDependencies.
REM electron-builder pulls @electron/rebuild, whose historical versions use
REM an Electron Git dependency. The POS runtime does not need electron-builder.
call npm install --omit=dev
if errorlevel 1 (
  echo.
  echo ERROR: POS runtime installation failed.
  pause
  exit /b 1
)

echo.
echo Verifying local Electron...
if not exist "node_modules\electron\cli.js" (
  echo ERROR: Electron was not installed correctly.
  pause
  exit /b 1
)
call node_modules\.bin\electron.cmd --version
if errorlevel 1 (
  echo ERROR: Electron runtime verification failed.
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
