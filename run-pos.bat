@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MK Foods POS - One Click Launcher

echo Launching MK Foods POS through the automatic repair launcher...
echo.
call "%~dp0mk.bat"
exit /b %ERRORLEVEL%
