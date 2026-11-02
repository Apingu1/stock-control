@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Server Installer
rem Always stage a network package locally BEFORE UAC elevation.
rem The original user context publishes the completed client package back to the share.
set "PACKAGE_ROOT=%~dp0"
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
set "STAGED=0"
if /I "%~1"=="--staged" set "STAGED=1"

if "!STAGED!"=="0" (
  set "STAGE=%TEMP%\StkFlo-Installer-%RANDOM%-%RANDOM%"
  mkdir "!STAGE!" || goto :stage_failed
  echo Staging the release package locally before elevation...
  robocopy "%PACKAGE_ROOT%." "!STAGE!" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP
  set "COPY_RC=!ERRORLEVEL!"
  if !COPY_RC! GEQ 8 goto :stage_failed
  if not exist "!STAGE!\System\ESC_SERVER_SETUP_WINDOWS.bat" goto :stage_failed
  if not exist "!STAGE!\CLIENT DEPLOYMENT\01 - INSTALL CLIENT.bat" goto :stage_failed
  set "STAGE_PATH=!STAGE!"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath (Join-Path $env:STAGE_PATH '01 - INSTALL SERVER.bat') -ArgumentList '--staged' -WorkingDirectory $env:STAGE_PATH -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
  set "RUN_RC=!ERRORLEVEL!"
  if not "!RUN_RC!"=="0" (
    echo ERROR: Elevated installation failed. Staged files remain at !STAGE! for troubleshooting.
    pause
    exit /b !RUN_RC!
  )
  echo Publishing the verified public CA and connection settings back to the original share...
  if not exist "%PACKAGE_ROOT%05 - PUBLISH CLIENT DEPLOYMENT.bat" goto :publish_failed
  call "%PACKAGE_ROOT%05 - PUBLISH CLIENT DEPLOYMENT.bat" --quiet
  if errorlevel 1 goto :publish_failed
  if not exist "%PACKAGE_ROOT%CLIENT DEPLOYMENT\stock-control-ca.crt" goto :publish_failed
  if not exist "%PACKAGE_ROOT%CLIENT DEPLOYMENT\STKFLO_CLIENT_DEPLOYMENT_READY.txt" goto :publish_failed
  rmdir /s /q "!STAGE!" >nul 2>&1
  echo.
  echo StkFlo installation and client package publishing completed.
  echo Clients may now run CLIENT DEPLOYMENT\01 - INSTALL CLIENT.bat from this share.
  pause
  exit /b 0
)

net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Elevated permissions are required to install StkFlo.
  exit /b 1
)
set "PACKAGE_ROOT=%~dp0"
set "SOURCE_ROOT=%PACKAGE_ROOT%System"
set "CLIENT_SOURCE=%PACKAGE_ROOT%CLIENT DEPLOYMENT"
if not exist "%SOURCE_ROOT%\ESC_SERVER_SETUP_WINDOWS.bat" exit /b 1
if not exist "%CLIENT_SOURCE%\01 - INSTALL CLIENT.bat" exit /b 1
if not exist "%INSTALL_ROOT%" mkdir "%INSTALL_ROOT%"
echo Installing StkFlo into %INSTALL_ROOT% ...
robocopy "%SOURCE_ROOT%" "%INSTALL_ROOT%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP
if !ERRORLEVEL! GEQ 8 (
  echo ERROR: The server runtime could not be copied to local storage.
  exit /b 1
)
if not exist "%INSTALL_ROOT%\client-deployment" mkdir "%INSTALL_ROOT%\client-deployment"
for %%F in ("01 - INSTALL CLIENT.bat" "02 - UNINSTALL CLIENT.bat" "Configure-Hosts.ps1" "client-config.ini" "README.txt" "stkflo.ico") do (
  copy /Y "%CLIENT_SOURCE%\%%~F" "%INSTALL_ROOT%\client-deployment\%%~F" >nul
  if errorlevel 1 exit /b 1
)
pushd "%INSTALL_ROOT%"
call "ESC_SERVER_SETUP_WINDOWS.bat"
set "RUN_RC=!ERRORLEVEL!"
popd
if not "!RUN_RC!"=="0" exit /b !RUN_RC!
rem The unprivileged original caller publishes directly from the installed VM
rem directory to the network share after UAC has exited. Never require an
rem elevated process to write N: and never silently publish an incomplete client.
if not exist "%INSTALL_ROOT%\client-deployment\client-config.ini" exit /b 1
if not exist "%INSTALL_ROOT%\client-deployment\stock-control-ca.crt" exit /b 1
exit /b 0

:stage_failed
echo ERROR: Cannot stage the complete installation package locally.
pause
exit /b 1
:publish_failed
echo ERROR: StkFlo installed on VM, but the shared client package could not be updated.
echo Completed client files remain at %INSTALL_ROOT%\client-deployment.
echo StkFlo server is installed; only N: client publication remains incomplete.
echo On this VM, log in as a user with write access to the approved share and run:
echo   05 - PUBLISH CLIENT DEPLOYMENT.bat
echo Do not distribute the client installer until the READY marker exists.
pause
exit /b 1
