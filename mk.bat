@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title MK Foods POS - Setup and Start

echo.
echo ========================================
echo        MK Foods POS - Launcher
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS and run mk.bat again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not installed or not in PATH.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Rust/Cargo is not installed or not in PATH.
  echo Tauri requires Cargo to build the desktop application.
  echo.
  echo Install Rust from:
  echo https://rustup.rs/
  echo.
  echo After installation, close and reopen this terminal, then run mk.bat again.
  pause
  exit /b 1
)

echo [1/4] Checking project dependencies...
if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto :error
) else (
  echo node_modules already exists - skipping npm install.
)

if not exist "src-tauri\icons" mkdir "src-tauri\icons"

if not exist "src-tauri\icons\icon.png" (
  echo.
  echo [2/4] Creating MK Foods source icon...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Add-Type -AssemblyName System.Drawing; $bmp=New-Object System.Drawing.Bitmap(1024,1024); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias; $g.Clear([System.Drawing.Color]::White); $font=New-Object System.Drawing.Font('Arial',260,[System.Drawing.FontStyle]::Bold); $brush=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black); $fmt=New-Object System.Drawing.StringFormat; $fmt.Alignment=[System.Drawing.StringAlignment]::Center; $fmt.LineAlignment=[System.Drawing.StringAlignment]::Center; $rect=New-Object System.Drawing.RectangleF(0,0,1024,1024); $g.DrawString('MK',$font,$brush,$rect,$fmt); $bmp.Save((Join-Path (Get-Location) 'src-tauri\icons\icon.png'),[System.Drawing.Imaging.ImageFormat]::Png); $fmt.Dispose(); $brush.Dispose(); $font.Dispose(); $g.Dispose(); $bmp.Dispose()"
  if errorlevel 1 goto :error
) else (
  echo Source icon already exists - skipping generation.
)

echo.
echo [3/4] Generating all Tauri platform icons...
call npx tauri icon "src-tauri\icons\icon.png"
if errorlevel 1 goto :error

echo.
echo [4/4] Starting MK Foods POS...
echo.
call npm run tauri dev
set EXITCODE=%ERRORLEVEL%

echo.
echo MK Foods POS exited with code %EXITCODE%.
pause
exit /b %EXITCODE%

:error
echo.
echo ========================================
echo ERROR: Setup failed.
echo ========================================
echo.
pause
exit /b 1
