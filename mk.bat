@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MK Foods POS - One Click Launcher

echo.
echo ========================================
echo        MK FOODS POS - ONE CLICK
echo ========================================
echo.

where node >nul 2>nul || goto :node_missing
where npm >nul 2>nul || goto :node_missing
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_missing

call :step "1/8" "Node.js / npm"
node --version
call npm --version
if errorlevel 1 goto :node_missing

call :step "2/8" "Rust / Cargo"
cargo --version
rustc --version
where rustup >nul 2>nul
if not errorlevel 1 call rustup default stable-x86_64-pc-windows-msvc

call :step "3/8" "Checking MSVC C++ compiler"
call :prepare_msvc
if errorlevel 1 goto :msvc_error

call :step "4/8" "Checking npm dependencies"
if not exist "node_modules\@tauri-apps\cli" (
  call npm install --include=dev
  if errorlevel 1 goto :npm_error
) else (
  echo Dependencies already installed - skipping npm install.
)

call :step "5/8" "Verifying Tauri CLI"
call npx --no-install tauri --version
if errorlevel 1 goto :tauri_error

call :step "6/8" "Checking MK Foods icon"
if not exist "src-tauri\icons\icon.ico" (
  if not exist "src-tauri\icons" mkdir "src-tauri\icons"
  >"src-tauri\icons\mk-foods-icon.svg" echo ^<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"^>^<rect width="1024" height="1024" rx="180" fill="white"/^>^<text x="512" y="650" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif" font-size="390" font-weight="700" fill="black"^>MK^</text^>^</svg^>
  call npx --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
  if errorlevel 1 goto :icon_error
) else echo Existing icons found - skipping regeneration.

call :step "7/8" "Validating Cargo metadata"
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 goto :cargo_error

call :step "8/8" "Starting MK Foods POS"
call npx --no-install tauri dev
set "EXITCODE=%ERRORLEVEL%"
echo.
echo MK Foods POS exited with code %EXITCODE%.
pause
exit /b %EXITCODE%

:prepare_msvc
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" if exist "%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" exit /b 1
set "VSINSTALL="
for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do if not defined VSINSTALL set "VSINSTALL=%%I"
if not defined VSINSTALL exit /b 1
if not exist "%VSINSTALL%\Common7\Tools\VsDevCmd.bat" exit /b 1
call "%VSINSTALL%\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b 1
where cl.exe >nul 2>nul
if errorlevel 1 exit /b 1
echo MSVC compiler ready.
exit /b 0

:step
echo.
echo [%~1] %~2
echo ------------------------------------------------
exit /b 0

:node_missing
echo ERROR: Node.js/npm is missing.
pause
exit /b 1
:rust_missing
echo ERROR: Cargo is unavailable. Install Rustup with the MSVC toolchain.
pause
exit /b 1
:msvc_error
echo ERROR: Visual Studio C++ MSVC build tools are required by bundled SQLite.
echo Install Desktop development with C++, MSVC C++ build tools and a Windows SDK.
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
