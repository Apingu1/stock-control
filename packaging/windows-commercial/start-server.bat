@echo off
setlocal EnableExtensions
title Pharmagrowth Stock Control - Start Server
set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"
if not exist "%INSTALL_ROOT%\START_WINDOWS.bat" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  echo Run 01 - INSTALL SERVER.bat first.
  pause
  exit /b 1
)
call "%INSTALL_ROOT%\START_WINDOWS.bat"
exit /b %ERRORLEVEL%
