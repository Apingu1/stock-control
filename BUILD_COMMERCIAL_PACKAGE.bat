@echo off
setlocal EnableExtensions
title Pharmagrowth Stock Control - Build Commercial Package
cd /d "%~dp0"

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Windows PowerShell is required.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Build-CommercialPackage.ps1" -RepositoryRoot "%CD%"
if errorlevel 1 (
  echo.
  echo ERROR: The commercial package could not be created.
  pause
  exit /b 1
)

echo.
echo Commercial package is available under:
echo   %CD%\release
echo.
pause
