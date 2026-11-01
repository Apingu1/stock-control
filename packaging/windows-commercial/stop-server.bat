@echo off
setlocal EnableExtensions
title StkFlo - Stop Server
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
if not exist "%INSTALL_ROOT%\STOP_WINDOWS.bat" (
  echo ERROR: StkFlo is not installed at:
  echo   %INSTALL_ROOT%
  pause
  exit /b 1
)
call "%INSTALL_ROOT%\STOP_WINDOWS.bat"
exit /b %ERRORLEVEL%
