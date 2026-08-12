@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title MK Foods POS - One Click Setup / Repair / Start

echo.
echo ========================================
echo        MK FOODS POS - ONE CLICK
echo ========================================
echo.

REM ---------- Node.js ----------
where node >nul 2>nul
if errorlevel 1 goto :node_missing
where npm >nul 2>nul
if errorlevel 1 goto :node_missing

echo [1/7] Checking Node.js and npm...
node --version
npm --version

REM ---------- Rust / Cargo ----------
echo.
echo [2/7] Checking Rust and Cargo...
where cargo >nul 2>nul
if errorlevel 1 (
  echo Cargo not found. Attempting automatic Rust installation...
  where winget >nul 2>nul
  if not errorlevel 1 (
    winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
  ) else (
    where rustup-init >nul 2>nul
    if not errorlevel 1 (
      rustup-init -y
    ) else (
      goto :rust_missing
    )
  )
  call refreshenv >nul 2>nul
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
where cargo >nul 2>nul
if errorlevel 1 (
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)
where cargo >nul 2>nul
if errorlevel 1 goto :rust_missing
cargo --version
rustc --version

REM ---------- npm dependencies ----------
echo.
echo [3/7] Installing / repairing project dependencies...
if not exist "package-lock.json" (
  call npm install
) else (
  call npm install
)
if errorlevel 1 goto :npm_error

REM ---------- Tauri CLI ----------
echo.
echo [4/7] Verifying Tauri CLI...
call npx tauri --version
if errorlevel 1 (
  echo Tauri CLI failed. Repairing npm dependencies...
  call npm install --include=dev
  if errorlevel 1 goto :npm_error
  call npx tauri --version
  if errorlevel 1 goto :tauri_error
)

REM ---------- Source icon ----------
echo.
echo [5/7] Creating / repairing MK Foods source icon...
if not exist "src-tauri\icons" mkdir "src-tauri\icons"

REM Always regenerate the source icon so a corrupt or empty icon cannot survive.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $bmp=New-Object System.Drawing.Bitmap(1024,1024); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias; $g.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit; $g.Clear([System.Drawing.Color]::White); $font=New-Object System.Drawing.Font('Arial',260,[System.Drawing.FontStyle]::Bold); $brush=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black); $fmt=New-Object System.Drawing.StringFormat; $fmt.Alignment=[System.Drawing.StringAlignment]::Center; $fmt.LineAlignment=[System.Drawing.StringAlignment]::Center; $rect=New-Object System.Drawing.RectangleF(0,0,1024,1024); $g.DrawString('MK',$font,$brush,$rect,$fmt); $out=Join-Path (Get-Location) 'src-tauri\icons\icon.png'; $bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png); $fmt.Dispose(); $brush.Dispose(); $font.Dispose(); $g.Dispose(); $bmp.Dispose(); if (!(Test-Path $out)) { throw 'Icon generation failed.' }"
if errorlevel 1 (
  echo Primary icon generation failed. Trying fallback icon generation...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $bmp=New-Object System.Drawing.Bitmap(512,512); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::White); $brush=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black); $font=[System.Drawing.Font]::new('Segoe UI',150,[System.Drawing.FontStyle]::Bold); $g.DrawString('MK',$font,$brush,105,155); $bmp.Save((Join-Path (Get-Location) 'src-tauri\icons\icon.png'),[System.Drawing.Imaging.ImageFormat]::Png); $font.Dispose(); $brush.Dispose(); $g.Dispose(); $bmp.Dispose()"
  if errorlevel 1 goto :icon_error
)

REM ---------- All platform icons ----------
echo.
echo [6/7] Generating all Tauri icons...
call npx tauri icon "src-tauri\icons\icon.png"
if errorlevel 1 (
  echo Icon generation failed. Reinstalling Tauri CLI and retrying...
  call npm install --include=dev
  call npx tauri icon "src-tauri\icons\icon.png"
  if errorlevel 1 goto :icon_error
)

REM ---------- Build metadata / auto repair ----------
echo.
echo [7/7] Validating Rust project and starting MK Foods POS...
cargo metadata --no-deps --format-version 1 >nul 2>nul
if errorlevel 1 (
  echo Cargo metadata failed. Attempting automatic Cargo repair...
  call rustup update stable
  if errorlevel 1 echo Rust update could not complete; continuing with existing toolchain.
  cargo metadata --no-deps --format-version 1 >nul 2>nul
  if errorlevel 1 goto :cargo_error
)

call npm run tauri dev
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo ========================================
  echo Tauri exited with code %EXITCODE%.
  echo Attempting one automatic dependency repair...
  echo ========================================
  call npm install --include=dev
  call cargo check --manifest-path src-tauri\Cargo.toml
  echo.
  echo Repair attempt finished. Starting again...
  call npm run tauri dev
  set "EXITCODE=%ERRORLEVEL%"
)

echo.
echo MK Foods POS exited with code %EXITCODE%.
pause
exit /b %EXITCODE%

:node_missing
echo.
echo ERROR: Node.js/npm is not installed or not available in PATH.
echo Install Node.js LTS, then run mk.bat again.
pause
exit /b 1

:rust_missing
echo.
echo ERROR: Rust/Cargo could not be installed or found.
echo Install Rust from https://rustup.rs/ and run mk.bat again.
pause
exit /b 1

:npm_error
echo.
echo ERROR: npm dependency installation failed.
pause
exit /b 1

:tauri_error
echo.
echo ERROR: Tauri CLI could not be repaired.
pause
exit /b 1

:icon_error
echo.
echo ERROR: Tauri icons could not be generated.
pause
exit /b 1

:cargo_error
echo.
echo ERROR: Cargo metadata still fails after automatic repair.
pause
exit /b 1
