@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title MK Foods POS - Build Windows Installers

set "CARGO_HOME=%USERPROFILE%\.cargo"
set "RUSTUP_HOME=%USERPROFILE%\.rustup"
set "PATH=%CARGO_HOME%\bin;%PATH%"
set "OUT=%CD%\dist"
set "TARGET_X64=x86_64-pc-windows-msvc"
set "TARGET_X86=i686-pc-windows-msvc"
set "TARGET_ARM64=aarch64-pc-windows-msvc"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VSINSTALL="

if exist "%VSWHERE%" goto :vswhere_ready
if exist "%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" goto :vswhere_ready
goto :msvc_missing

:vswhere_ready
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

echo [1/9] Checking Node.js / npm
echo ---------------------------------------------------------------
node --version
call npm.cmd --version
if errorlevel 1 goto :node_missing

echo.
echo [2/9] Checking Rust / Cargo
echo ---------------------------------------------------------------
cargo --version
rustc --version
rustup --version
if errorlevel 1 goto :rust_missing

echo.
echo [3/9] Detecting Visual Studio C++ MSVC tools
echo ---------------------------------------------------------------
for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do if not defined VSINSTALL set "VSINSTALL=%%I"
if not defined VSINSTALL goto :msvc_not_found
echo Visual Studio: %VSINSTALL%

rem Do not put the VSINSTALL path inside an IF/parenthesized block. Visual Studio
rem commonly lives under "Program Files (x86)", whose parentheses can break cmd.exe
rem parsing. Push into the Tools directory and invoke VsDevCmd by filename instead.
pushd "%VSINSTALL%\Common7\Tools" >nul 2>nul
if errorlevel 1 goto :vsdevcmd_missing
call VsDevCmd.bat -arch=x64 -host_arch=x64 >nul
set "VSDEV_ERROR=%errorlevel%"
popd
if not "%VSDEV_ERROR%"=="0" goto :msvc_init_failed
where cl.exe >nul 2>nul
if errorlevel 1 goto :cl_missing
echo MSVC compiler ready.

echo.
echo [4/9] Installing / repairing npm dependencies
echo ---------------------------------------------------------------
call npm.cmd install --include=dev
if errorlevel 1 goto :npm_error

echo.
echo [5/9] Running project tests
echo ---------------------------------------------------------------
call npm.cmd test
if errorlevel 1 goto :test_error

echo.
echo [6/9] Checking Tauri CLI and Windows targets
echo ---------------------------------------------------------------
call npx.cmd --no-install tauri --version
if errorlevel 1 goto :tauri_error
call rustup.exe target add %TARGET_X64%
if errorlevel 1 goto :target_error
call rustup.exe target add %TARGET_X86%
if errorlevel 1 goto :target_error
call rustup.exe target add %TARGET_ARM64%
if errorlevel 1 goto :target_error

echo.
echo [7/9] Preparing application icon
echo ---------------------------------------------------------------
if not exist "src-tauri\icons" mkdir "src-tauri\icons"
if not exist "src-tauri\icons\mk-foods-icon.svg" goto :create_svg
if exist "src-tauri\icons\icon.ico" goto :icon_ready
call npx.cmd --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
if errorlevel 1 goto :icon_error
goto :icon_ready

:create_svg
>"src-tauri\icons\mk-foods-icon.svg" echo ^<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"^>^<rect width="1024" height="1024" rx="180" fill="#111111"/^>^<circle cx="512" cy="512" r="360" fill="#ffffff"/^>^<text x="512" y="625" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="300" font-weight="700" fill="#111111"^>MK^</text^>^<circle cx="512" cy="205" r="34" fill="#111111"/^>^</svg^
call npx.cmd --no-install tauri icon "src-tauri\icons\mk-foods-icon.svg"
if errorlevel 1 goto :icon_error

:icon_ready
if not exist "src-tauri\icons\icon.ico" goto :icon_error

echo.
echo [8/9] Validating Tauri project
echo ---------------------------------------------------------------
cargo metadata --no-deps --format-version 1 --manifest-path "src-tauri\Cargo.toml" >nul
if errorlevel 1 goto :cargo_error

echo.
echo [9/9] Building NSIS installers for x64, x86 and ARM64
echo ---------------------------------------------------------------
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
set "VSCMD_ARCH=x64"
if /i "%ARCH%"=="x86" set "VSCMD_ARCH=x86"
if /i "%ARCH%"=="ARM64" set "VSCMD_ARCH=arm64"
pushd "%VSINSTALL%\Common7\Tools" >nul 2>nul
if errorlevel 1 goto :target_msvc_init_failed
call VsDevCmd.bat -arch=%VSCMD_ARCH% -host_arch=x64 >nul
set "TARGET_VSDEV_ERROR=%errorlevel%"
popd
if not "%TARGET_VSDEV_ERROR%"=="0" goto :target_msvc_init_failed
where cl.exe >nul 2>nul
if errorlevel 1 goto :target_cl_missing
if exist "%TARGET_BUNDLE%" rmdir /s /q "%TARGET_BUNDLE%"
call npx.cmd --no-install tauri build --bundles nsis --target "%TARGET%"
if errorlevel 1 exit /b 1
for /r "%TARGET_BUNDLE%" %%F in (*-setup.exe) do if not defined FOUND set "FOUND=%%~fF"
if not defined FOUND goto :installer_missing
copy /y "%FOUND%" "%OUT%\MK-Foods-POS-Windows-Setup-%ARCH%.exe" >nul
if errorlevel 1 exit /b 1
echo %ARCH% installer created successfully.
exit /b 0

:installer_missing
echo ERROR: No NSIS installer was produced for %ARCH%.
echo Expected: %TARGET_BUNDLE%
exit /b 1

:target_msvc_init_failed
echo ERROR: Visual Studio could not initialize the %ARCH% compiler environment.
exit /b 1

:target_cl_missing
echo ERROR: cl.exe is unavailable for %ARCH%.
echo Install the matching Visual Studio C++ workload and Windows SDK.
exit /b 1

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

:msvc_missing
echo.
echo ERROR: Visual Studio Installer / vswhere.exe was not found.
echo Install Visual Studio Build Tools with Desktop development with C++.
pause
exit /b 1

:msvc_not_found
echo ERROR: Visual Studio C++ MSVC build tools were not found.
echo Install Desktop development with C++, MSVC C++ build tools, ARM64 C++ tools, and a Windows SDK.
pause
exit /b 1

:vsdevcmd_missing
echo ERROR: VsDevCmd.bat was not found under the detected Visual Studio installation:
echo   %VSINSTALL%
pause
exit /b 1

:msvc_init_failed
echo ERROR: Visual Studio could not initialize its MSVC environment.
pause
exit /b 1

:cl_missing
echo ERROR: cl.exe is unavailable after initializing Visual Studio.
echo Install the required MSVC C++ workload and Windows SDK.
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
echo Check the compiler error above.
pause
exit /b 1
