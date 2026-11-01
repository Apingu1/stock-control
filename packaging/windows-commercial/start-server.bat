@echo off
setlocal EnableExtensions
title StkFlo - Start Server
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
if not exist "%INSTALL_ROOT%\START_WINDOWS.bat" (
  echo ERROR: StkFlo is not installed at:
  echo   %INSTALL_ROOT%
  echo Run 01 - INSTALL SERVER.bat first.
  pause
  exit /b 1
)
call "%INSTALL_ROOT%\START_WINDOWS.bat"
exit /b %ERRORLEVEL%
