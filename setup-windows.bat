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
node --version
npm --version

echo.
echo Installing MK Foods POS dependencies from the npm registry...
call npm install --include=dev
if errorlevel 1 (
  echo.
  echo ERROR: Dependency installation failed.
  echo.
  echo If you see EALLOWGIT or a Git URL such as @electron/node-gyp,
  echo your npm configuration/policy is blocking Git package downloads.
  echo The project itself does not require a global Electron installation.
  echo.
  echo Run these diagnostics and review the output:
  echo   npm config get git
  echo   npm config get registry
  echo   npm config get ignore-scripts
  echo.
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
