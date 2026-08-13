@echo off
setlocal EnableExtensions
title Pharmagrowth Stock Control - Backup Settings
set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"
if not exist "%INSTALL_ROOT%\ESC_BACKUP_SETTINGS_WINDOWS.bat" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  pause
  exit /b 1
)
call "%INSTALL_ROOT%\ESC_BACKUP_SETTINGS_WINDOWS.bat"
exit /b %ERRORLEVEL%
