@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Build Windows Installers
cd /d "%~dp0"

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Windows PowerShell is required.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Build-Installers.ps1" -RepositoryRoot "%CD%" -OutputDirectory "%CD%\dist"
if errorlevel 1 (
  echo.
  echo ERROR: The Windows executable package could not be built.
  pause
  exit /b 1
)

echo.
echo Executables are available in:
echo   %CD%\dist
echo.
pause
