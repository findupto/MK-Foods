@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title MK Foods POS - Build Windows Installer

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "OUT=%CD%\dist"
set "BUNDLE=%CD%\src-tauri\target\release\bundle\nsis"

call :banner
where node >nul 2>nul || goto :node_missing
where npm >nul 2>nul || goto :node_missing
if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_missing
if not exist "%USERPROFILE%\.cargo\bin\rustc.exe" goto :rust_missing

call :step "1/7" "Checking Node.js / npm"
node --version
npm --version

call :step "2/7" "Checking Rust / Cargo"
cargo --version
rustc --version

call :step "3/7" "Installing / repairing npm dependencies"
call npm install --include=dev
if errorlevel 1 goto :npm_error

call :step "4/7" "Verifying Tauri CLI"
call npx --no-install tauri --version
if errorlevel 1 goto :tauri_error

call :step "5/7" "Preparing Windows application icon"
if not exist "src-tauri\icons" mkdir "src-tauri\icons"
if not exist "src-tauri\icons\mk-foods-icon.svg" (
  >"src-tauri\icons\mk-foods-icon.svg" echo ^<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"^>^<rect width="1024" height="1024" rx="180" fill="#111111"/^>^<circle cx="512" cy="512" r="360" fill="#ffffff"/^>^<text x="512" y="625" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="300" font-weight="700" fill="#111111"^>MK^</text^>^<circle cx="512" cy="205" r="34" fill="#111111"/^>^</svg^
)
if not exist "src-tauri\icons\icon.ico" (
  call npx --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
  if errorlevel 1 goto :icon_error
)
if not exist "src-tauri\icons\icon.ico" goto :icon_error

call :step "6/7" "Validating Tauri Cargo metadata"
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 goto :cargo_error

call :step "7/7" "Building MK Foods POS standalone Windows installer"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
call npx --no-install tauri build --bundles nsis
if errorlevel 1 goto :build_error

set "FOUND="
for /r "%BUNDLE%" %%F in (*-setup.exe) do if not defined FOUND set "FOUND=%%~fF"
if not defined FOUND goto :installer_missing

copy /y "%FOUND%" "%OUT%\MK-Foods-POS-Windows-Setup-x64.exe" >nul
if errorlevel 1 goto :copy_error

call :banner
echo BUILD SUCCESSFUL
echo.
echo Installer:
echo %OUT%\MK-Foods-POS-Windows-Setup-x64.exe
echo.
echo The generated EXE is a normal GUI Windows installer.
echo End users do NOT need Node.js, npm, Rust or Cargo.
echo The Tauri app uses a Windows GUI subsystem, so the installed POS does not open a CMD window.
echo WebView2 bootstrapper is embedded in the installer.
echo.
start "" explorer.exe "%OUT%"
exit /b 0

:banner
echo.
echo ================================================
echo          MK FOODS POS - WINDOWS BUILD
echo ================================================
echo.
exit /b 0

:step
echo.
echo [%~1] %~2
echo ------------------------------------------------
exit /b 0

:node_missing
echo ERROR: Node.js/npm is missing from PATH.
echo Install Node.js LTS and run this file again.
pause
exit /b 1

:rust_missing
echo ERROR: Rust/Cargo is missing.
echo Expected: %USERPROFILE%\.cargo\bin\cargo.exe
echo Install Rustup, then reopen Windows Terminal and run this file again.
pause
exit /b 1

:npm_error
echo ERROR: npm dependency installation failed.
pause
exit /b 1

:tauri_error
echo ERROR: Tauri CLI is unavailable.
echo npm install should have repaired it; check the npm error above.
pause
exit /b 1

:icon_error
echo ERROR: Could not create src-tauri\icons\icon.ico.
echo Check the Tauri icon command output above.
pause
exit /b 1

:cargo_error
echo ERROR: Tauri Cargo metadata validation failed.
echo If you see an error mentioning the repository root Cargo.toml, update to the latest repository version.
pause
exit /b 1

:build_error
echo ERROR: Tauri Windows build failed.
pause
exit /b 1

:installer_missing
echo ERROR: Build completed but no NSIS installer was found.
echo Expected folder: %BUNDLE%
pause
exit /b 1

:copy_error
echo ERROR: Could not copy the generated installer to dist.
pause
exit /b 1
