@echo off
setlocal EnableExtensions
title StkFlo - Server Status
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
if not exist "%INSTALL_ROOT%\STATUS_WINDOWS.bat" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  pause
  exit /b 1
)
call "%INSTALL_ROOT%\STATUS_WINDOWS.bat"
exit /b %ERRORLEVEL%
