@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Pharmagrowth Stock Control - Install Server

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator access...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

set "PACKAGE_ROOT=%~dp0"
set "SOURCE_ROOT=%PACKAGE_ROOT%System"
set "CLIENT_SOURCE=%PACKAGE_ROOT%CLIENT DEPLOYMENT"
set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"

if not exist "%SOURCE_ROOT%\ESC_SERVER_SETUP_WINDOWS.bat" (
  echo ERROR: The System folder is incomplete.
  echo Re-extract the complete Pharmagrowth Stock Control package and retry.
  pause
  exit /b 1
)
for %%F in ("01 - INSTALL CLIENT.bat" "02 - UNINSTALL CLIENT.bat" "Configure-Hosts.ps1" "client-config.ini" "README.txt") do (
  if not exist "%CLIENT_SOURCE%\%%~F" (
    echo ERROR: CLIENT DEPLOYMENT is incomplete.
    echo Missing: %%~F
    echo Re-download the latest validated commercial package and retry.
    pause
    exit /b 1
  )
)

echo ============================================================
echo   Pharmagrowth Stock Control - Server Installation
echo ============================================================
echo.
echo Source package: %PACKAGE_ROOT%
echo Install folder: %INSTALL_ROOT%
echo Client package: %CLIENT_SOURCE%
echo.

if not exist "%INSTALL_ROOT%" mkdir "%INSTALL_ROOT%"

echo Copying controlled application files to the local server...
robocopy "%SOURCE_ROOT%" "%INSTALL_ROOT%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP >nul
set "ROBOCOPY_RC=!ERRORLEVEL!"
if !ROBOCOPY_RC! GEQ 8 (
  echo ERROR: Application files could not be copied to %INSTALL_ROOT%.
  pause
  exit /b 1
)

rem Remove obsolete duplicate installer/uninstaller/build files that may remain
rem from an older test installation. Runtime/database/configuration data are not
rem touched here.
del /f /q "%INSTALL_ROOT%\BUILD_WINDOWS_INSTALLERS.bat" >nul 2>&1
del /f /q "%INSTALL_ROOT%\ESC_CLIENT_SETUP_WINDOWS.bat" >nul 2>&1
del /f /q "%INSTALL_ROOT%\UNINSTALL_WINDOWS.bat" >nul 2>&1
del /f /q "%INSTALL_ROOT%\windows\Build-Installers.ps1" >nul 2>&1
del /f /q "%INSTALL_ROOT%\windows\Build-ClientInstaller.ps1" >nul 2>&1
del /f /q "%INSTALL_ROOT%\windows\Self-Extracting-Package.ps1" >nul 2>&1
if exist "%INSTALL_ROOT%\dist" rmdir /s /q "%INSTALL_ROOT%\dist" >nul 2>&1

rem Seed the installed runtime with the exact BAT-based client package supplied
rem in the commercial folder. The server setup then adds only the server-specific
rem CA certificate and network settings, matching the proven working deployment.
echo Preparing the client deployment package...
if exist "%INSTALL_ROOT%\client-deployment" rmdir /s /q "%INSTALL_ROOT%\client-deployment"
mkdir "%INSTALL_ROOT%\client-deployment"
for %%F in ("01 - INSTALL CLIENT.bat" "02 - UNINSTALL CLIENT.bat" "Configure-Hosts.ps1" "client-config.ini" "README.txt") do (
  copy /Y "%CLIENT_SOURCE%\%%~F" "%INSTALL_ROOT%\client-deployment\%%~F" >nul
  if errorlevel 1 (
    echo ERROR: Could not stage client file: %%~F
    pause
    exit /b 1
  )
)
del /f /q "%INSTALL_ROOT%\client-deployment\stock-control-ca.crt" >nul 2>&1

echo Starting the server setup...
pushd "%INSTALL_ROOT%"
call "ESC_SERVER_SETUP_WINDOWS.bat"
set "SETUP_RC=!ERRORLEVEL!"
popd
if not "!SETUP_RC!"=="0" (
  echo.
  echo ERROR: Server setup did not complete successfully.
  echo Review the visible setup error and the troubleshooting documentation.
  pause
  exit /b !SETUP_RC!
)

rem Publish the completed client package back into the SAME commercial folder.
rem Do not delete/recreate the shared folder: update the six controlled files in
rem place so a package stored in a Windows shared folder remains stable for all
rem client computers already browsing that share.
echo Publishing the completed CLIENT DEPLOYMENT package...
for %%F in ("01 - INSTALL CLIENT.bat" "02 - UNINSTALL CLIENT.bat" "Configure-Hosts.ps1" "client-config.ini" "stock-control-ca.crt" "README.txt") do (
  if not exist "%INSTALL_ROOT%\client-deployment\%%~F" goto :client_publish_failed
  copy /Y "%INSTALL_ROOT%\client-deployment\%%~F" "%CLIENT_SOURCE%\%%~F" >nul
  if errorlevel 1 goto :client_publish_failed
)

set "PUBLISHED_SERVER_IP="
for /f "usebackq tokens=1,* delims==" %%A in ("%CLIENT_SOURCE%\client-config.ini") do (
  if /I "%%A"=="SERVER_IP" set "PUBLISHED_SERVER_IP=%%B"
)
if not defined PUBLISHED_SERVER_IP goto :client_publish_failed
if not exist "%CLIENT_SOURCE%\stock-control-ca.crt" goto :client_publish_failed
if not exist "%CLIENT_SOURCE%\01 - INSTALL CLIENT.bat" goto :client_publish_failed
if not exist "%CLIENT_SOURCE%\02 - UNINSTALL CLIENT.bat" goto :client_publish_failed
if not exist "%CLIENT_SOURCE%\Configure-Hosts.ps1" goto :client_publish_failed

echo Client deployment verified for server IP: !PUBLISHED_SERVER_IP!

echo.
echo ============================================================
echo   Server installation completed
echo ============================================================
echo Application: https://stock-control.test:8443/
echo Installed files: %INSTALL_ROOT%
echo Client deployment READY: %CLIENT_SOURCE%
echo.
echo The same CLIENT DEPLOYMENT folder can now be opened from each Windows
echo client computer on the shared network folder.
echo Run 01 - INSTALL CLIENT.bat as Administrator on each client.
echo No client EXE is created or required.
echo.
echo The application requires a new private administrator password at first login.
echo Review the generated IQ report before approving the installation.
echo.
pause
exit /b 0

:client_publish_failed
echo.
echo ============================================================
echo   CLIENT DEPLOYMENT PUBLISH FAILED
echo ============================================================
echo The Stock Control server is installed, but the shared client package was
echo not updated successfully. Do NOT distribute the CLIENT DEPLOYMENT folder
echo until this is corrected.
echo.
echo Installed completed client package:
echo   %INSTALL_ROOT%\client-deployment
echo.
echo Shared package that could not be verified:
echo   %CLIENT_SOURCE%
echo.
echo Check write permission to the shared package folder and retry
echo 01 - INSTALL SERVER.bat from this same commercial package.
echo.
pause
exit /b 1
