@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Start
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist. Run ESC Server Setup or INSTALL_WINDOWS.bat first.
  pause
  exit /b 1
)

if exist "deployment\manual-stop.flag" del /f /q "deployment\manual-stop.flag" >nul 2>&1

echo Starting Docker and Stock Control services...
if exist "windows\Health-Monitor.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Health-Monitor.ps1" -InstallRoot "%CD%"
) else (
  docker compose -f "infra\docker-compose.production.yml" --env-file ".env" up -d
)
if errorlevel 1 (
  echo ERROR: The application could not be started.
  echo Review logs\health-monitor.log or run STATUS_WINDOWS.bat.
  pause
  exit /b 1
)

set "APP_HTTP_PORT=8088"
set "APP_HTTPS_PORT=8443"
set "TLS_HOSTNAME=stock-control.test"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTP_PORT=" ".env" 2^>nul') do set "APP_HTTP_PORT=%%B"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTPS_PORT=" ".env" 2^>nul') do set "APP_HTTPS_PORT=%%B"
if exist "deployment\server-config.ini" for /f "usebackq tokens=1,* delims==" %%A in ("deployment\server-config.ini") do if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"

if exist "infra\certs\stock-control.crt" (
  set "APP_URL=https://%TLS_HOSTNAME%:%APP_HTTPS_PORT%/"
) else (
  set "APP_URL=http://localhost:%APP_HTTP_PORT%/"
)

start "" "%APP_URL%"
echo Stock Control started at %APP_URL%
pause
