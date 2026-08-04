@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Client Setup

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator access...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

cd /d "%~dp0"
set "CONFIG=client-config.ini"
set "CA_CERT=stock-control-ca.crt"

if not exist "%CONFIG%" (
  echo ERROR: client-config.ini is missing from the client deployment package.
  pause
  exit /b 1
)
if not exist "%CA_CERT%" (
  echo ERROR: stock-control-ca.crt is missing from the client deployment package.
  pause
  exit /b 1
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
  pause
  exit /b 1
)

echo ============================================================
echo   Eaststone Stock Control - Client Setup
echo ============================================================
echo Server: https://%TLS_HOSTNAME%:%APP_HTTPS_PORT%
echo.

echo Installing the Stock Control trusted-root certificate...
certutil.exe -addstore -f Root "%CA_CERT%" >nul
if errorlevel 1 goto :cert_failed

echo Configuring the Stock Control hostname...
if exist "Configure-Hosts.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -IpAddress "%SERVER_IP%"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p='$env:SystemRoot\System32\drivers\etc\hosts';$h='%TLS_HOSTNAME%';$ip='%SERVER_IP%';$l=Get-Content $p;$l=$l^|?{($_ -split '#')[0] -notmatch ('(^|\s)'+[regex]::Escape($h)+'(\s|$)')};$l+=\"$ip`t$h`t# Eaststone Stock Control\";$l^|Set-Content $p -Encoding ascii;ipconfig /flushdns^|Out-Null"
)
if errorlevel 1 goto :hosts_failed

set "APP_URL=https://%TLS_HOSTNAME%:%APP_HTTPS_PORT%/"
echo Creating application shortcuts...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop');$start=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source;if(-not $edge){$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'};$shell=New-Object -ComObject WScript.Shell;foreach($dir in @($desktop,$start)){if(Test-Path $dir){$s=$shell.CreateShortcut((Join-Path $dir 'Eaststone Stock Control.lnk'));if(Test-Path $edge){$s.TargetPath=$edge;$s.Arguments='--app=%APP_URL%';$s.IconLocation=$edge}else{$s.TargetPath='%SystemRoot%\System32\cmd.exe';$s.Arguments='/c start "" "%APP_URL%"'};$s.WorkingDirectory='%~dp0';$s.Description='Eaststone Stock Control';$s.Save()}}"
if errorlevel 1 goto :shortcut_failed

echo Verifying trusted HTTPS access...
curl.exe -fsS "%APP_URL%api/health" >nul 2>&1
if errorlevel 1 goto :health_failed

reg add "HKLM\SOFTWARE\Eaststone\StockControlClient" /v ServerUrl /t REG_SZ /d "%APP_URL%" /f >nul
reg add "HKLM\SOFTWARE\Eaststone\StockControlClient" /v InstalledOn /t REG_SZ /d "%DATE% %TIME%" /f >nul

echo.
echo ============================================================
echo   Client setup completed successfully
echo ============================================================
echo The trusted certificate, hostname and application shortcuts are configured.
start "" "%APP_URL%"
pause
exit /b 0

:cert_failed
echo ERROR: The trusted-root certificate could not be installed.
goto :failed
:hosts_failed
echo ERROR: The Windows hosts entry could not be configured.
goto :failed
:shortcut_failed
echo ERROR: The application shortcut could not be created.
goto :failed
:health_failed
echo ERROR: The client cannot reach %APP_URL%
echo Check that the server is running, the IP address is correct, and port %APP_HTTPS_PORT% is allowed.
goto :failed
:failed
echo.
pause
exit /b 1
