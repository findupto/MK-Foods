@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title MK Foods POS - One Click Setup Repair Start

echo.
echo ========================================
echo        MK FOODS POS - ONE CLICK
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :node_missing
where npm >nul 2>nul
if errorlevel 1 goto :node_missing

echo [1/8] Node.js / npm
node --version
call npm --version

:rust_check
echo.
echo [2/8] Rust / Cargo
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  echo Cargo found in user Rust installation.
) else (
  echo Cargo not found. Installing Rust automatically...
  where winget >nul 2>nul
  if not errorlevel 1 (
    call winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
  )
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  echo Rust still missing. Downloading rustup directly...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing 'https://win.rustup.rs/x86_64' -OutFile (Join-Path $env:TEMP 'rustup-init.exe')"
  if errorlevel 1 goto :rust_install_error
  "%TEMP%\rustup-init.exe" -y --default-toolchain stable-x86_64-pc-windows-msvc
  if errorlevel 1 goto :rust_install_error
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_missing
cargo --version
rustc --version
where rustup >nul 2>nul
if not errorlevel 1 call rustup default stable-x86_64-pc-windows-msvc
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

:deps
echo.
echo [3/8] Installing / repairing npm dependencies...
call npm install --include=dev
if errorlevel 1 (
  echo npm install failed. Retrying...
  call npm cache verify
  call npm install --include=dev
  if errorlevel 1 goto :npm_error
)

echo.
echo [4/8] Verifying Tauri CLI...
if not exist "node_modules\@tauri-apps\cli" (
  call npm install --save-dev @tauri-apps/cli@^2.11.4
  if errorlevel 1 goto :tauri_error
)
call npx --no-install tauri --version
if errorlevel 1 (
  echo Local Tauri CLI failed. Reinstalling...
  call npm install --save-dev @tauri-apps/cli@^2.11.4
  call npx --no-install tauri --version
  if errorlevel 1 goto :tauri_error
)

:icon
echo.
echo [5/8] Creating MK Foods source icon...
if not exist "src-tauri\icons" mkdir "src-tauri\icons"
if exist "src-tauri\icons\icon.png" del /q "src-tauri\icons\icon.png" >nul 2>nul

REM Use SVG as the reliable source; Tauri converts SVG to every required platform icon.
>"src-tauri\icons\mk-foods-icon.svg" echo ^<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"^>^<rect width="1024" height="1024" rx="180" fill="white"/^>^<text x="512" y="650" text-anchor="middle" font-family="Arial,Segoe UI,sans-serif" font-size="390" font-weight="700" fill="black"^>MK^</text^>^</svg^>
if not exist "src-tauri\icons\mk-foods-icon.svg" goto :icon_error

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; if (Get-Command magick -ErrorAction SilentlyContinue) { magick 'src-tauri\icons\mk-foods-icon.svg' -background white -resize 1024x1024 'src-tauri\icons\icon.png' } elseif (Get-Command rsvg-convert -ErrorAction SilentlyContinue) { rsvg-convert -w 1024 -h 1024 'src-tauri\icons\mk-foods-icon.svg' -o 'src-tauri\icons\icon.png' }"
if not exist "src-tauri\icons\icon.png" (
  echo PNG converter unavailable. Installing/using Tauri SVG input directly...
  call npx --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
) else (
  call npx --no-install tauri icon "src-tauri\icons\icon.png"
)
if errorlevel 1 goto :icon_error

:repair
echo.
echo [6/8] Auto-repairing MK Foods Rust source...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='src-tauri\src\main.rs'; if(Test-Path $p){$s=Get-Content -Raw $p; $s=$s.Replace('x.insert(k.clone(),v.clone())}}arr(&mut s.db,\"audit\")','x.insert(k.clone(),v.clone());}}arr(&mut s.db,\"audit\")'); $s=$s.Replace('entry(k.clone()).or_insert(v.clone())}if let Some(ps)','entry(k.clone()).or_insert(v.clone());}if let Some(ps)'); $s=$s.Replace('json!(if status==\"completed\"{\"done\"}else{status.clone()})','json!(if status==\"completed\"{\"done\"}else{status.as_str()})'); Set-Content -Path $p -Value $s -Encoding UTF8 -NoNewline}"
if errorlevel 1 goto :repair_error

:metadata
echo.
echo [7/8] Validating Cargo metadata...
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_missing
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 (
  echo Cargo metadata failed. Repairing Rust toolchain...
  where rustup >nul 2>nul
  if not errorlevel 1 (
    call rustup toolchain install stable-x86_64-pc-windows-msvc
    call rustup default stable-x86_64-pc-windows-msvc
  )
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
  if errorlevel 1 goto :cargo_error
)

echo.
echo [8/8] Starting MK Foods POS...
call npx --no-install tauri dev
set "EXITCODE=%ERRORLEVEL%"
if "%EXITCODE%"=="0" exit /b 0

echo.
echo Tauri failed with code %EXITCODE%. Running automatic repair/check...
call cargo check --manifest-path "src-tauri\Cargo.toml"
if errorlevel 1 (
  echo Rust check failed. Re-running automatic source repair...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='src-tauri\src\main.rs'; $s=Get-Content -Raw $p; $s=$s.Replace('x.insert(k.clone(),v.clone())}}arr(&mut s.db,\"audit\")','x.insert(k.clone(),v.clone());}}arr(&mut s.db,\"audit\")'); $s=$s.Replace('entry(k.clone()).or_insert(v.clone())}if let Some(ps)','entry(k.clone()).or_insert(v.clone());}if let Some(ps)'); $s=$s.Replace('json!(if status==\"completed\"{\"done\"}else{status.clone()})','json!(if status==\"completed\"{\"done\"}else{status.as_str()})'); Set-Content -Path $p -Value $s -Encoding UTF8 -NoNewline"
  call cargo check --manifest-path "src-tauri\Cargo.toml"
)
call npm install --include=dev
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
:rust_install_error
echo ERROR: Automatic Rust installation failed.
pause
exit /b 1
:rust_missing
echo ERROR: Cargo is unavailable even though Rust should be installed.
echo Expected: %USERPROFILE%\.cargo\bin\cargo.exe
pause
exit /b 1
:npm_error
echo ERROR: npm dependencies could not be repaired.
pause
exit /b 1
:tauri_error
echo ERROR: Tauri CLI could not be installed/repaired.
pause
exit /b 1
:icon_error
echo ERROR: MK Foods Tauri icons could not be generated.
pause
exit /b 1
:repair_error
echo ERROR: Automatic Rust source repair failed.
pause
exit /b 1
:cargo_error
echo ERROR: Cargo metadata still fails after automatic Rust repair.
pause
exit /b 1
