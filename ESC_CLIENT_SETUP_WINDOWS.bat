@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Client Setup

set "STAGED=0"
if /I "%~1"=="--staged" set "STAGED=1"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator access...
  set "STAGE=%TEMP%\EaststoneStockControlClientSetup-%RANDOM%-%RANDOM%"
  mkdir "!STAGE!" >nul 2>&1
  xcopy "%~dp0*" "!STAGE!\" /E /I /Y /Q >nul
  if not exist "!STAGE!\ESC_CLIENT_SETUP_WINDOWS.bat" (
    echo ERROR: Client setup files could not be staged before elevation.
    pause
    exit /b 1
  )
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '!STAGE!\ESC_CLIENT_SETUP_WINDOWS.bat' -ArgumentList '--staged' -Verb RunAs -WorkingDirectory '!STAGE!'"
  exit /b
)

cd /d "%~dp0"
set "CONFIG=client-config.ini"
set "CA_CERT=stock-control-ca.crt"

if not exist "%CONFIG%" (
  echo ERROR: client-config.ini is missing from the client deployment package.
  set "RESULT=1"
  goto :finish
)
if not exist "%CA_CERT%" (
  echo ERROR: stock-control-ca.crt is missing from the client deployment package.
  set "RESULT=1"
  goto :finish
)

set "TLS_HOSTNAME=stock-control.test"
set "SERVER_IP="
set "APP_HTTPS_PORT=8443"
for /f "usebackq tokens=1,* delims==" %%A in ("%CONFIG%") do (
  if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"
  if /I "%%A"=="SERVER_IP" set "SERVER_IP=%%B"
  if /I "%%A"=="APP_HTTPS_PORT" set "APP_HTTPS_PORT=%%B"
)

if not defined SERVER_IP (
  echo ERROR: SERVER_IP is missing from client-config.ini.
  set "RESULT=1"
  goto :finish
)

rem A real client maps the application hostname to the server's LAN address.
rem When this client package is deliberately tested on the server itself, keep
rem the hostname on loopback so the server does not try to hairpin through its
rem own LAN/WAN address.
set "HOSTS_IP=%SERVER_IP%"
set "RUNNING_ON_SERVER=0"
reg query "HKLM\SOFTWARE\Eaststone\StockControl" /v InstallPath >nul 2>&1
if not errorlevel 1 (
  set "HOSTS_IP=127.0.0.1"
  set "RUNNING_ON_SERVER=1"
)

echo ============================================================
echo   Eaststone Stock Control - Client Setup
echo ============================================================
echo Server: https://%TLS_HOSTNAME%:%APP_HTTPS_PORT%
if "%RUNNING_ON_SERVER%"=="1" echo Local server installation detected - using 127.0.0.1 for this computer only.
echo.

echo Installing the Stock Control trusted-root certificate...
certutil.exe -addstore -f Root "%CA_CERT%" >nul
if errorlevel 1 goto :cert_failed
for /f "usebackq delims=" %%T in (`powershell.exe -NoProfile -Command "$c=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path -LiteralPath '%CA_CERT%').Path);$c.Thumbprint"`) do set "CA_THUMBPRINT=%%T"

echo Configuring the Stock Control hostname...
if exist "Configure-Hosts.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -IpAddress "%HOSTS_IP%"
) else (
  echo ERROR: Configure-Hosts.ps1 is missing.
  goto :hosts_failed
)
if errorlevel 1 goto :hosts_failed

set "APP_URL=https://%TLS_HOSTNAME%:%APP_HTTPS_PORT%/"
echo Creating application shortcuts...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop');$start=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source;if(-not $edge){$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'};$shell=New-Object -ComObject WScript.Shell;foreach($dir in @($desktop,$start)){if(Test-Path $dir){$s=$shell.CreateShortcut((Join-Path $dir 'Eaststone Stock Control.lnk'));if(Test-Path $edge){$s.TargetPath=$edge;$s.Arguments='--app=%APP_URL%';$s.IconLocation=$edge}else{$s.TargetPath='%SystemRoot%\System32\cmd.exe';$s.Arguments='/c start "" "%APP_URL%"'};$s.Description='Eaststone Stock Control';$s.Save()}}"
if errorlevel 1 goto :shortcut_failed

echo Verifying trusted HTTPS access...
rem Windows curl uses Schannel. A private CA without CRL/OCSP distribution
rem points can return CRYPT_E_NO_REVOCATION_CHECK even when the certificate
rem chain and hostname are otherwise valid. Best-effort revocation keeps normal
rem certificate and hostname validation while tolerating an unavailable
rem revocation endpoint.
curl.exe --ssl-revoke-best-effort -fsS "%APP_URL%api/health" >nul 2>&1
if errorlevel 1 goto :health_failed

reg add "HKLM\SOFTWARE\Eaststone\StockControlClient" /v ServerUrl /t REG_SZ /d "%APP_URL%" /f >nul
reg add "HKLM\SOFTWARE\Eaststone\StockControlClient" /v ServerHostname /t REG_SZ /d "%TLS_HOSTNAME%" /f >nul
reg add "HKLM\SOFTWARE\Eaststone\StockControlClient" /v ServerIP /t REG_SZ /d "%SERVER_IP%" /f >nul
if defined CA_THUMBPRINT reg add "HKLM\SOFTWARE\Eaststone\StockControlClient" /v CAThumbprint /t REG_SZ /d "%CA_THUMBPRINT%" /f >nul
reg add "HKLM\SOFTWARE\Eaststone\StockControlClient" /v InstalledOn /t REG_SZ /d "%DATE% %TIME%" /f >nul

echo.
echo ============================================================
echo   Client setup completed successfully
echo ============================================================
echo The trusted certificate, hostname and application shortcuts are configured.
start "" "%APP_URL%"
set "RESULT=0"
goto :finish

:cert_failed
echo ERROR: The trusted-root certificate could not be installed.
set "RESULT=1"
goto :finish
:hosts_failed
echo ERROR: The Windows hosts entry could not be configured.
set "RESULT=1"
goto :finish
:shortcut_failed
echo ERROR: The application shortcut could not be created.
set "RESULT=1"
goto :finish
:health_failed
echo ERROR: The client cannot reach %APP_URL%
echo Check that the server is running, the IP address is correct, and port %APP_HTTPS_PORT% is allowed.
set "RESULT=1"

:finish
echo.
pause
if "%STAGED%"=="1" (
  set "STAGE_DIR=%~dp0"
  set "CLEANUP=%TEMP%\eaststone-client-stage-cleanup-%RANDOM%.cmd"
  >"!CLEANUP!" echo @echo off
  >>"!CLEANUP!" echo timeout /t 3 /nobreak ^>nul
  >>"!CLEANUP!" echo rmdir /s /q "!STAGE_DIR!"
  >>"!CLEANUP!" echo del /f /q "%%~f0"
  start "" /min cmd.exe /c ""!CLEANUP!""
)
exit /b %RESULT%
