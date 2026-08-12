@echo off
setlocal EnableExtensions
title Pharmagrowth Stock Control - Complete Uninstall
set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"
if not exist "%INSTALL_ROOT%\UNINSTALL_WINDOWS.bat" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  pause
  exit /b 1
)
echo WARNING: This option can permanently remove Stock Control data.
echo The installed uninstaller will require additional explicit confirmations.
echo.
pause
call "%INSTALL_ROOT%\UNINSTALL_WINDOWS.bat"
exit /b %ERRORLEVEL%
