@echo off
setlocal
cd /d "%~dp0"

rem IMPORTANT: Keep this launcher intentionally tiny. All Visual Studio discovery,
rem architecture handling and build logic lives in PowerShell so cmd.exe never
rem parses paths such as "C:\Program Files (x86)\..." inside IF/FOR blocks.
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Windows PowerShell was not found.
  echo Windows 10 normally includes powershell.exe.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
set "BUILD_ERROR=%errorlevel%"
if not "%BUILD_ERROR%"=="0" (
  echo.
  echo ================================================================
  echo BUILD FAILED - see the PowerShell error output above.
  echo ================================================================
  pause
)
exit /b %BUILD_ERROR%
