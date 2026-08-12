@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Client Uninstall

set "STAGED=0"
if /I "%~1"=="--staged" set "STAGED=1"
set "SELF_NAME=%~nx0"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator access...
  set "STAGE=%TEMP%\EaststoneStockControlClientUninstall-%RANDOM%-%RANDOM%"
  mkdir "!STAGE!" >nul 2>&1
  xcopy "%~dp0*" "!STAGE!\" /E /I /Y /Q >nul
  if not exist "!STAGE!\!SELF_NAME!" (
    echo ERROR: Client uninstall files could not be staged before elevation.
    pause
    exit /b 1
  )
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '!STAGE!\!SELF_NAME!' -ArgumentList '--staged' -Verb RunAs -WorkingDirectory '!STAGE!'"
  exit /b
)

cd /d "%~dp0"
set "TLS_HOSTNAME=stock-control.test"
set "CA_THUMBPRINT="
set "RUNNING_ON_SERVER=0"

if exist "client-config.ini" (
  for /f "usebackq tokens=1,* delims==" %%A in ("client-config.ini") do (
    if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"
  )
)

for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Eaststone\StockControlClient" /v ServerHostname 2^>nul ^| find /I "ServerHostname"') do set "TLS_HOSTNAME=%%B"
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Eaststone\StockControlClient" /v CAThumbprint 2^>nul ^| find /I "CAThumbprint"') do set "CA_THUMBPRINT=%%B"

if not defined CA_THUMBPRINT if exist "stock-control-ca.crt" (
  for /f "usebackq delims=" %%T in (`powershell.exe -NoProfile -Command "$c=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path -LiteralPath 'stock-control-ca.crt').Path);$c.Thumbprint"`) do set "CA_THUMBPRINT=%%T"
)

reg query "HKLM\SOFTWARE\Eaststone\StockControl" /v InstallPath >nul 2>&1
if not errorlevel 1 set "RUNNING_ON_SERVER=1"

echo ============================================================
echo   Eaststone Stock Control - Client Uninstall
echo ============================================================
echo.
echo This removes this computer's Stock Control client configuration only.
echo It does NOT remove the server, database, shared deployment folder or stock data.
if "%RUNNING_ON_SERVER%"=="1" (
  echo.
  echo Local server installation detected.
  echo Server certificate trust and the server hosts mapping will be preserved.
)
echo.
set /p "CONFIRM=Type UNINSTALL CLIENT to continue: "
if /I not "%CONFIRM%"=="UNINSTALL CLIENT" goto :cancelled

echo Removing application shortcuts...
del /f /q "%USERPROFILE%\Desktop\Eaststone Stock Control.lnk" >nul 2>&1
del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Eaststone Stock Control.lnk" >nul 2>&1

if not "%RUNNING_ON_SERVER%"=="1" (
  echo Removing the Stock Control hostname mapping...
  if exist "Configure-Hosts.ps1" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -Remove >nul 2>&1

  if defined CA_THUMBPRINT (
    echo Removing the Stock Control trusted-root certificate from this client...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p='Cert:\LocalMachine\Root\%CA_THUMBPRINT%'; if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}" >nul 2>&1
  )
)

echo Removing client registration...
reg delete "HKLM\SOFTWARE\Eaststone\StockControlClient" /f >nul 2>&1

echo.
echo ============================================================
echo   Client uninstall completed successfully
echo ============================================================
echo The shared CLIENT DEPLOYMENT folder has not been changed or deleted.
set "RESULT=0"
goto :finish

:cancelled
echo Client uninstall cancelled. Nothing was removed.
set "RESULT=0"

:finish
echo.
pause
if "%STAGED%"=="1" (
  set "STAGE_DIR=%~dp0"
  set "CLEANUP=%TEMP%\eaststone-client-uninstall-cleanup-%RANDOM%.cmd"
  >"!CLEANUP!" echo @echo off
  >>"!CLEANUP!" echo timeout /t 3 /nobreak ^>nul
  >>"!CLEANUP!" echo rmdir /s /q "!STAGE_DIR!"
  >>"!CLEANUP!" echo del /f /q "%%~f0"
  start "" /min cmd.exe /c ""!CLEANUP!""
)
exit /b %RESULT%
