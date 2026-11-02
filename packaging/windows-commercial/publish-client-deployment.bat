@echo off
setlocal EnableExtensions
title StkFlo - Publish Client Deployment
rem Run on the StkFlo Windows VM as the same user who can write to the release share.
rem Do not elevate: UAC may remove access to mapped drives such as N:.
set "PACKAGE_ROOT=%~dp0"
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
set "PUBLISH_SCRIPT=%PACKAGE_ROOT%Support\Publish-ClientDeployment.ps1"
set "QUIET=0"
if /I "%~1"=="--quiet" set "QUIET=1"

if not exist "%PUBLISH_SCRIPT%" (
  echo ERROR: The publication utility is missing from this StkFlo release.
  goto :fail
)
if not exist "%INSTALL_ROOT%\client-deployment\stock-control-ca.crt" (
  echo ERROR: No completed client deployment was found on this Windows VM.
  echo Install StkFlo server first. Do not distribute a client template.
  goto :fail
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PUBLISH_SCRIPT%" -InstallRoot "%INSTALL_ROOT%" -Destination "%PACKAGE_ROOT%CLIENT DEPLOYMENT"
if errorlevel 1 goto :fail
echo.
echo StkFlo client deployment is published and ready for client installations.
if "%QUIET%"=="0" pause
exit /b 0

:fail
echo.
echo StkFlo server files are not changed by this publication error.
echo Run this publisher ON THE VM with write access to the source release folder.
if "%QUIET%"=="0" pause
exit /b 1
