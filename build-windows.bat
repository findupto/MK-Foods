@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title MK Foods POS - Build Windows Installers

rem Use the user's standard Rust locations.
set "CARGO_HOME=%USERPROFILE%\.cargo"
set "RUSTUP_HOME=%USERPROFILE%\.rustup"
set "PATH=%CARGO_HOME%\bin;%PATH%"
set "OUT=%CD%\dist"

set "TARGET_X64=x86_64-pc-windows-msvc"
set "TARGET_X86=i686-pc-windows-msvc"
set "TARGET_ARM64=aarch64-pc-windows-msvc"

echo.
echo ================================================================
echo       MK FOODS POS - WINDOWS INSTALLER BUILD
echo      x64 + x86 + ARM64 / NSIS / GUI INSTALLER
echo ================================================================
echo.

where node >nul 2>nul || goto :node_missing
where npm.cmd >nul 2>nul || goto :node_missing
if not exist "%CARGO_HOME%\bin\cargo.exe" goto :rust_missing
if not exist "%CARGO_HOME%\bin\rustc.exe" goto :rust_missing
if not exist "%RUSTUP_HOME%" goto :rust_missing

call :step "1/8" "Checking Node.js / npm"
node --version
call npm.cmd --version
if errorlevel 1 goto :node_missing

call :step "2/8" "Checking Rust / Cargo"
cargo --version
rustc --version
rustup --version
if errorlevel 1 goto :rust_missing

call :step "3/8" "Installing / repairing npm dependencies"
call npm.cmd install --include=dev
if errorlevel 1 goto :npm_error

call :step "4/8" "Running project tests"
call npm.cmd test
if errorlevel 1 goto :test_error

call :step "5/8" "Checking Tauri CLI and Windows targets"
call npx.cmd --no-install tauri --version
if errorlevel 1 goto :tauri_error
call rustup.exe target add %TARGET_X64%
if errorlevel 1 goto :target_error
call rustup.exe target add %TARGET_X86%
if errorlevel 1 goto :target_error
call rustup.exe target add %TARGET_ARM64%
if errorlevel 1 goto :target_error

call :step "6/8" "Preparing application icon"
if not exist "src-tauri\icons" mkdir "src-tauri\icons"
if not exist "src-tauri\icons\mk-foods-icon.svg" (
  >"src-tauri\icons\mk-foods-icon.svg" echo ^<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"^>^<rect width="1024" height="1024" rx="180" fill="#111111"/^>^<circle cx="512" cy="512" r="360" fill="#ffffff"/^>^<text x="512" y="625" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="300" font-weight="700" fill="#111111"^>MK^</text^>^<circle cx="512" cy="205" r="34" fill="#111111"/^>^</svg^>
)
if not exist "src-tauri\icons\icon.ico" (
  call npx.cmd --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
  if errorlevel 1 goto :icon_error
)
if not exist "src-tauri\icons\icon.ico" goto :icon_error

call :step "7/8" "Validating Tauri project"
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 goto :cargo_error

call :step "8/8" "Building NSIS installers for x64, x86 and ARM64"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"

call :build_target "%TARGET_X64%" "x64"
if errorlevel 1 goto :build_error
call :build_target "%TARGET_X86%" "x86"
if errorlevel 1 goto :build_error
call :build_target "%TARGET_ARM64%" "ARM64"
if errorlevel 1 goto :build_error

echo.
echo ================================================================
echo SUCCESS - ALL WINDOWS INSTALLERS ARE READY
echo ================================================================
echo.
echo x64 installer:
echo   %OUT%\MK-Foods-POS-Windows-Setup-x64.exe
echo.
echo x86 installer:
echo   %OUT%\MK-Foods-POS-Windows-Setup-x86.exe
echo.
echo ARM64 installer:
echo   %OUT%\MK-Foods-POS-Windows-Setup-ARM64.exe
echo.
echo End users do NOT need Node.js, npm, Rust, Cargo or Git.
echo.
start "" explorer.exe "%OUT%"
exit /b 0

:build_target
set "TARGET=%~1"
set "ARCH=%~2"
set "TARGET_BUNDLE=%CD%\src-tauri\target\%TARGET%\release\bundle\nsis"
set "FOUND="
echo.
echo ---------------------------------------------------------------
echo Building %ARCH% - %TARGET%
echo ---------------------------------------------------------------
if exist "%TARGET_BUNDLE%" rmdir /s /q "%TARGET_BUNDLE%"
call npx.cmd --no-install tauri build --bundles nsis --target "%TARGET%"
if errorlevel 1 exit /b 1
for /r "%TARGET_BUNDLE%" %%F in (*-setup.exe) do if not defined FOUND set "FOUND=%%~fF"
if not defined FOUND (
  echo ERROR: No NSIS installer was produced for %ARCH%.
  echo Expected: %TARGET_BUNDLE%
  exit /b 1
)
copy /y "%FOUND%" "%OUT%\MK-Foods-POS-Windows-Setup-%ARCH%.exe" >nul
if errorlevel 1 exit /b 1
echo %ARCH% installer created successfully.
exit /b 0

:step
echo.
echo [%~1] %~2
echo ---------------------------------------------------------------
exit /b 0

:node_missing
echo ERROR: Node.js/npm is missing or failed.
echo Install Node.js LTS and reopen the terminal.
pause
exit /b 1

:rust_missing
echo ERROR: Rust/Cargo/rustup is missing or failed.
echo Install Rustup with the MSVC toolchain and reopen the terminal.
pause
exit /b 1

:npm_error
echo ERROR: npm dependency installation failed.
pause
exit /b 1

:test_error
echo ERROR: Project tests failed. The installer build was stopped.
pause
exit /b 1

:tauri_error
echo ERROR: Tauri CLI is unavailable.
pause
exit /b 1

:target_error
echo ERROR: A required Rust Windows target could not be installed.
echo x64: %TARGET_X64%
echo x86: %TARGET_X86%
echo ARM64: %TARGET_ARM64%
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

:build_error
echo ERROR: A Windows installer build failed.
echo x86/ARM64 also require the matching Visual Studio C++ MSVC build tools.
pause
exit /b 1
