@echo off
setlocal EnableExtensions
title Pharmagrowth Stock Control - Stop Server
set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"
if not exist "%INSTALL_ROOT%\STOP_WINDOWS.bat" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  pause
  exit /b 1
)
call "%INSTALL_ROOT%\STOP_WINDOWS.bat"
exit /b %ERRORLEVEL%
