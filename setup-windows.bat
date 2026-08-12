@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MK Foods POS - One Click Setup / Repair

echo Launching MK Foods POS automatic setup and repair...
echo.
call "%~dp0mk.bat"
exit /b %ERRORLEVEL%
