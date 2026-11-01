@echo off
setlocal EnableExtensions
title StkFlo - Backup and Restore
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
if not exist "%INSTALL_ROOT%\ESC_BACKUP_RESTORE_WINDOWS.bat" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  pause
  exit /b 1
)
call "%INSTALL_ROOT%\ESC_BACKUP_RESTORE_WINDOWS.bat"
exit /b %ERRORLEVEL%
