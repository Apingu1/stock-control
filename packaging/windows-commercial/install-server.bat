@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Pharmagrowth Stock Control - Install Server

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator access...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

set "PACKAGE_ROOT=%~dp0"
set "SOURCE_ROOT=%PACKAGE_ROOT%System"
set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"

if not exist "%SOURCE_ROOT%\ESC_SERVER_SETUP_WINDOWS.bat" (
  echo ERROR: The System folder is incomplete.
  echo Re-extract the complete Pharmagrowth Stock Control package and retry.
  pause
  exit /b 1
)

echo ============================================================
echo   Pharmagrowth Stock Control - Server Installation
echo ============================================================
echo.
echo Source package: %PACKAGE_ROOT%
echo Install folder: %INSTALL_ROOT%
echo.

if not exist "%INSTALL_ROOT%" mkdir "%INSTALL_ROOT%"

echo Copying controlled application files to the local server...
robocopy "%SOURCE_ROOT%" "%INSTALL_ROOT%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP >nul
set "ROBOCOPY_RC=%ERRORLEVEL%"
if %ROBOCOPY_RC% GEQ 8 (
  echo ERROR: Application files could not be copied to %INSTALL_ROOT%.
  pause
  exit /b 1
)

echo Starting the server setup...
pushd "%INSTALL_ROOT%"
call "ESC_SERVER_SETUP_WINDOWS.bat"
set "SETUP_RC=%ERRORLEVEL%"
popd
if not "%SETUP_RC%"=="0" (
  echo.
  echo ERROR: Server setup did not complete successfully.
  echo Review the visible setup error and the troubleshooting documentation.
  pause
  exit /b %SETUP_RC%
)

echo Refreshing the distributable CLIENT DEPLOYMENT folder...
if exist "%INSTALL_ROOT%\client-deployment" (
  if exist "%PACKAGE_ROOT%CLIENT DEPLOYMENT" rmdir /s /q "%PACKAGE_ROOT%CLIENT DEPLOYMENT"
  mkdir "%PACKAGE_ROOT%CLIENT DEPLOYMENT"
  robocopy "%INSTALL_ROOT%\client-deployment" "%PACKAGE_ROOT%CLIENT DEPLOYMENT" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP >nul
  set "CLIENT_COPY_RC=%ERRORLEVEL%"
  if !CLIENT_COPY_RC! GEQ 8 (
    echo WARNING: The client deployment folder could not be copied back into the release package.
    echo It is still available at:
    echo   %INSTALL_ROOT%\client-deployment
  )
)

echo.
echo ============================================================
echo   Server installation completed
echo ============================================================
echo Application: https://stock-control.test:8443/
echo Installed files: %INSTALL_ROOT%
echo Client deployment: %PACKAGE_ROOT%CLIENT DEPLOYMENT
echo.
echo Change the initial administrator password immediately after first login.
echo Review the generated IQ report before approving the installation.
echo.
pause
exit /b 0
