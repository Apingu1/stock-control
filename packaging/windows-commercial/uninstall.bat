@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Pharmagrowth Stock Control - Complete Uninstall

set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"
for %%I in ("%~dp0..") do set "PACKAGE_ROOT=%%~fI"

if not exist "%INSTALL_ROOT%\UNINSTALL_WINDOWS.bat" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  echo.
  echo The extracted commercial package is separate from the installed application:
  echo   %PACKAGE_ROOT%
  pause
  exit /b 1
)

echo ============================================================
echo   Pharmagrowth Stock Control - Complete Uninstall
echo ============================================================
echo.
echo Installed application:
echo   %INSTALL_ROOT%
echo.
echo Extracted installation package:
echo   %PACKAGE_ROOT%
echo.
echo WARNING: The installed uninstaller can permanently remove Stock Control data.
echo It will require additional explicit confirmations before data is deleted.
echo.
pause

call "%INSTALL_ROOT%\UNINSTALL_WINDOWS.bat"
set "UNINSTALL_RC=%ERRORLEVEL%"
if not "%UNINSTALL_RC%"=="0" (
  echo.
  echo The installed application uninstall did not complete successfully.
  echo The commercial installation package will be retained.
  pause
  exit /b %UNINSTALL_RC%
)

echo.
echo ============================================================
echo   Installed application uninstall completed
echo ============================================================
echo.
echo The extracted commercial installation package is separate and has not been deleted:
echo   %PACKAGE_ROOT%
echo.

rem Never delete a centrally stored/shared deployment package automatically.
if "%PACKAGE_ROOT:~0,2%"=="\\" goto :shared_package
set "PACKAGE_DRIVE=%PACKAGE_ROOT:~0,2%"
net use %PACKAGE_DRIVE% >nul 2>&1
if not errorlevel 1 goto :shared_package

echo If this is only a local extracted copy and you also want to remove it,
echo type DELETE PACKAGE below. Any other response will keep it.
set /p "DELETE_PACKAGE=Delete this local commercial package? Type DELETE PACKAGE to confirm: "
if /I not "%DELETE_PACKAGE%"=="DELETE PACKAGE" goto :keep_package

set "CLEANUP=%TEMP%\remove-pharmagrowth-stock-control-package-%RANDOM%.bat"
(
  echo @echo off
  echo timeout /t 3 /nobreak ^>nul
  echo cd /d "%TEMP%"
  echo attrib -h -s -r "%PACKAGE_ROOT%\*" /s /d ^>nul 2^>^&1
  echo rmdir /s /q "%PACKAGE_ROOT%"
  echo del /f /q "%%~f0"
) > "%CLEANUP%"

echo.
echo The local commercial package folder will now be deleted:
echo   %PACKAGE_ROOT%
start "" /min cmd.exe /c ""%CLEANUP%""
exit /b 0

:shared_package
echo This commercial package appears to be on a network/shared location.
echo For safety it will NOT be deleted automatically.
echo Remove the distribution copy manually only if authorised by IT.
pause
exit /b 0

:keep_package
echo Commercial installation package retained.
pause
exit /b 0
