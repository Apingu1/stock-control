@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Backup Settings

net session >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Backup-Settings.ps1" -InstallRoot "%CD%"
if errorlevel 1 (
  echo.
  echo Backup Settings ended with an error.
  echo Review logs\backup-settings.log.
  pause
  exit /b 1
)
