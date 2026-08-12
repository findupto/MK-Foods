@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MK Foods POS - Lightweight One Click Launcher

echo.
echo ========================================
echo        MK FOODS POS - ONE CLICK
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :node_missing
where npm >nul 2>nul
if errorlevel 1 goto :node_missing

echo [1/7] Node.js / npm
node --version
call npm --version

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo.
echo [2/7] Rust / Cargo
if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  echo Cargo not found. Installing Rust...
  where winget >nul 2>nul
  if not errorlevel 1 call winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_missing
cargo --version
rustc --version
where rustup >nul 2>nul
if not errorlevel 1 call rustup default stable-x86_64-pc-windows-msvc

:deps
echo.
echo [3/7] Checking npm dependencies...
if not exist "node_modules\@tauri-apps\cli" (
  echo Installing Tauri dependencies for the first run...
  call npm install --include=dev
  if errorlevel 1 goto :npm_error
) else (
  echo Dependencies already installed - skipping npm install.
)

echo.
echo [4/7] Verifying Tauri CLI...
call npx --no-install tauri --version
if errorlevel 1 (
  echo Tauri CLI missing/broken. Repairing...
  call npm install --include=dev
  call npx --no-install tauri --version
  if errorlevel 1 goto :tauri_error
)

echo.
echo [5/7] Checking MK Foods icon...
if not exist "src-tauri\icons\icon.ico" (
  if not exist "src-tauri\icons" mkdir "src-tauri\icons"
  >"src-tauri\icons\mk-foods-icon.svg" echo ^<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"^>^<rect width="1024" height="1024" rx="180" fill="white"/^>^<text x="512" y="650" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif" font-size="390" font-weight="700" fill="black"^>MK^</text^>^</svg^>
  if not exist "src-tauri\icons\mk-foods-icon.svg" goto :icon_error
  call npx --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
  if errorlevel 1 goto :icon_error
) else (
  echo Existing icons found - skipping regeneration.
)

echo.
echo [6/7] Validating Cargo metadata...
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 goto :cargo_error

echo.
echo [7/7] Starting MK Foods POS...
call npx --no-install tauri dev
set "EXITCODE=%ERRORLEVEL%"
echo.
echo MK Foods POS exited with code %EXITCODE%.
pause
exit /b %EXITCODE%

:node_missing
echo ERROR: Node.js/npm is missing.
pause
exit /b 1
:rust_missing
echo ERROR: Cargo is unavailable. Expected %USERPROFILE%\.cargo\bin\cargo.exe
pause
exit /b 1
:npm_error
echo ERROR: npm dependencies could not be installed.
pause
exit /b 1
:tauri_error
echo ERROR: Tauri CLI could not be installed/repaired.
pause
exit /b 1
:icon_error
echo ERROR: MK Foods icons could not be generated.
pause
exit /b 1
:cargo_error
echo ERROR: Cargo metadata validation failed.
pause
exit /b 1
