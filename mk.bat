@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title MK Foods POS - One Click Setup Repair Start

echo.
echo ========================================
echo        MK FOODS POS - ONE CLICK
echo ========================================
echo.

REM IMPORTANT: npm is a .cmd file on Windows and MUST be called from a .bat file.
REM Otherwise Windows terminates this launcher immediately after npm --version.

where node >nul 2>nul
if errorlevel 1 goto :node_missing
where npm >nul 2>nul
if errorlevel 1 goto :node_missing

echo [1/8] Node.js / npm
node --version
call npm --version
if errorlevel 1 goto :node_missing

REM Rust / Cargo: use the existing per-user installation first.
echo.
echo [2/8] Rust / Cargo
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>nul
if errorlevel 1 (
  echo Cargo not found. Installing Rust automatically...
  where winget >nul 2>nul
  if not errorlevel 1 (
    winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
  )
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
where cargo >nul 2>nul
if errorlevel 1 (
  echo Winget did not provide Cargo. Downloading rustup directly...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing 'https://win.rustup.rs/x86_64' -OutFile (Join-Path $env:TEMP 'rustup-init.exe')"
  if errorlevel 1 goto :rust_install_error
  "%TEMP%\rustup-init.exe" -y --default-toolchain stable-x86_64-pc-windows-msvc
  if errorlevel 1 goto :rust_install_error
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
where cargo >nul 2>nul
if errorlevel 1 goto :rust_missing
cargo --version
rustc --version

where rustup >nul 2>nul
if not errorlevel 1 rustup default stable-x86_64-pc-windows-msvc
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

REM Repair npm dependencies.
echo.
echo [3/8] Installing / repairing npm dependencies...
call npm install --include=dev
if errorlevel 1 (
  echo npm install failed. Retrying after cleaning npm cache...
  call npm cache verify
  call npm install --include=dev
  if errorlevel 1 goto :npm_error
)

REM Verify local Tauri CLI.
echo.
echo [4/8] Verifying Tauri CLI...
if not exist "node_modules\@tauri-apps\cli" (
  call npm install --save-dev @tauri-apps/cli@^2.11.4
  if errorlevel 1 goto :tauri_error
)
call npx --no-install tauri --version
if errorlevel 1 (
  echo Local Tauri CLI failed. Reinstalling it...
  call npm install --save-dev @tauri-apps/cli@^2.11.4
  call npx --no-install tauri --version
  if errorlevel 1 goto :tauri_error
)

REM Generate a known-good source icon, then every platform icon.
echo.
echo [5/8] Creating MK Foods source icon...
if not exist "src-tauri\icons" mkdir "src-tauri\icons"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $bmp=New-Object System.Drawing.Bitmap(1024,1024); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias; $g.Clear([System.Drawing.Color]::White); $font=New-Object System.Drawing.Font('Arial',260,[System.Drawing.FontStyle]::Bold); $brush=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black); $fmt=New-Object System.Drawing.StringFormat; $fmt.Alignment=[System.Drawing.StringAlignment]::Center; $fmt.LineAlignment=[System.Drawing.StringAlignment]::Center; $rect=New-Object System.Drawing.RectangleF(0,0,1024,1024); $g.DrawString('MK',$font,$brush,$rect,$fmt); $out=Join-Path (Get-Location) 'src-tauri\icons\icon.png'; $bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png); $fmt.Dispose(); $brush.Dispose(); $font.Dispose(); $g.Dispose(); $bmp.Dispose(); if (!(Test-Path $out)) { throw 'icon.png was not created' }"
if errorlevel 1 goto :icon_error

echo.
echo [6/8] Generating all Tauri icons...
call npx --no-install tauri icon "src-tauri\icons\icon.png"
if errorlevel 1 (
  echo Icon generation failed. Reinstalling Tauri and retrying...
  call npm install --save-dev @tauri-apps/cli@^2.11.4
  call npx --no-install tauri icon "src-tauri\icons\icon.png"
  if errorlevel 1 goto :icon_error
)

REM Validate the exact metadata command Tauri needs.
echo.
echo [7/8] Validating Cargo metadata...
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>nul
if errorlevel 1 goto :rust_missing
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 (
  echo Cargo metadata failed. Repairing Rust toolchain...
  where rustup >nul 2>nul
  if not errorlevel 1 (
    rustup toolchain install stable-x86_64-pc-windows-msvc
    rustup default stable-x86_64-pc-windows-msvc
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
echo Tauri failed with code %EXITCODE%. Running automatic Rust repair/check...
call cargo check --manifest-path "src-tauri\Cargo.toml"
call npm install --include=dev
call npx --no-install tauri dev
set "EXITCODE=%ERRORLEVEL%"

echo.
echo MK Foods POS exited with code %EXITCODE%.
pause
exit /b %EXITCODE%

:node_missing
echo ERROR: Node.js/npm is missing or npm could not start.
echo Install Node.js LTS and run this again.
pause
exit /b 1

:rust_install_error
echo ERROR: Automatic Rust installation failed.
pause
exit /b 1

:rust_missing
echo ERROR: Cargo is still unavailable. Rust is required by Tauri.
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

:cargo_error
echo ERROR: Cargo metadata still fails after automatic Rust repair.
pause
exit /b 1
