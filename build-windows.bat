@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title MK Foods POS - Build Windows Installer
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "OUT=%CD%\dist"
set "BUNDLE=%CD%\src-tauri\target\release\bundle\nsis"

echo.
echo ================================================
echo      MK FOODS POS - WINDOWS INSTALLER BUILD
echo ================================================
echo.

where node >nul 2>nul || goto :node_missing
where npm >nul 2>nul || goto :node_missing
if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_missing
if not exist "%USERPROFILE%\.cargo\bin\rustc.exe" goto :rust_missing

call :step "1/8" "Checking Node.js / npm"
node --version
npm --version
if errorlevel 1 goto :node_missing

call :step "2/8" "Checking Rust / Cargo"
cargo --version
rustc --version
if errorlevel 1 goto :rust_missing

call :step "3/8" "Installing / repairing npm dependencies"
call npm install --include=dev
if errorlevel 1 goto :npm_error

call :step "4/8" "Checking Tauri CLI"
call npx --no-install tauri --version
if errorlevel 1 goto :tauri_error

call :step "5/8" "Preparing application icon"
if not exist "src-tauri\icons" mkdir "src-tauri\icons"
if not exist "src-tauri\icons\mk-foods-icon.svg" (
  >"src-tauri\icons\mk-foods-icon.svg" echo ^<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"^>^<rect width="1024" height="1024" rx="180" fill="#111111"/^>^<circle cx="512" cy="512" r="360" fill="#ffffff"/^>^<text x="512" y="625" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="300" font-weight="700" fill="#111111"^>MK^</text^>^<circle cx="512" cy="205" r="34" fill="#111111"/^>^</svg^>
)
if not exist "src-tauri\icons\icon.ico" (
  call npx --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
  if errorlevel 1 goto :icon_error
)
if not exist "src-tauri\icons\icon.ico" goto :icon_error

call :step "6/8" "Validating Tauri project"
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 goto :cargo_error
call npx --no-install tauri info
if errorlevel 1 goto :tauri_info_error

call :step "7/8" "Building Windows NSIS installer"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
call npx --no-install tauri build --bundles nsis
if errorlevel 1 goto :build_error

set "FOUND="
for /r "%BUNDLE%" %%F in (*-setup.exe) do if not defined FOUND set "FOUND=%%~fF"
if not defined FOUND goto :installer_missing
copy /y "%FOUND%" "%OUT%\MK-Foods-POS-Windows-Setup-x64.exe" >nul
if errorlevel 1 goto :copy_error

call :step "8/8" "Installer ready"
echo.
echo SUCCESS!
echo.
echo Standalone installer:
echo %OUT%\MK-Foods-POS-Windows-Setup-x64.exe
echo.
echo End users do NOT need Node.js, npm, Rust, Cargo or Git.
echo WebView2 is embedded in the installer when required.
echo The installed POS is a GUI application and does not open CMD.
echo.
start "" explorer.exe "%OUT%"
exit /b 0

:step
echo.
echo [%~1] %~2
echo ------------------------------------------------
exit /b 0

:node_missing
echo ERROR: Node.js/npm is missing or failed.
echo Install Node.js LTS and reopen the terminal.
pause
exit /b 1

:rust_missing
echo ERROR: Rust/Cargo is missing or failed.
echo Install Rustup with the MSVC toolchain, then reopen the terminal.
pause
exit /b 1

:npm_error
echo ERROR: npm dependency installation failed.
pause
exit /b 1

:tauri_error
echo ERROR: Tauri CLI is unavailable.
pause
exit /b 1

:icon_error
echo ERROR: Could not create the Windows application icon.
pause
exit /b 1

:cargo_error
echo ERROR: Cargo metadata validation failed.
pause
exit /b 1

:tauri_info_error
echo ERROR: Tauri project validation failed.
pause
exit /b 1

:build_error
echo ERROR: Tauri Windows build failed.
echo Review the Rust/Tauri error printed above.
pause
exit /b 1

:installer_missing
echo ERROR: Build completed but no NSIS installer was found.
echo Expected folder: %BUNDLE%
pause
exit /b 1

:copy_error
echo ERROR: Could not copy the generated installer.
pause
exit /b 1
