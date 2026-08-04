@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Status
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist. Run ESC Server Setup first.
  pause
  exit /b 1
)

set "APP_HTTP_PORT=8088"
set "APP_HTTPS_PORT=8443"
set "TLS_HOSTNAME=stock-control.test"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTP_PORT=" ".env" 2^>nul') do set "APP_HTTP_PORT=%%B"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTPS_PORT=" ".env" 2^>nul') do set "APP_HTTPS_PORT=%%B"
if exist "deployment\server-config.ini" for /f "usebackq tokens=1,* delims==" %%A in ("deployment\server-config.ini") do if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"

echo ============================================================
echo   Eaststone Stock Control - Status
echo ============================================================
if exist "deployment\manual-stop.flag" (
  echo STATE: CONTROLLED STOP
  type "deployment\manual-stop.flag"
) else (
  echo STATE: Automatic recovery enabled
)
echo.

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker engine: NOT RUNNING
) else (
  echo Docker engine: RUNNING
  docker compose -f "infra\docker-compose.production.yml" --env-file ".env" ps
)

echo.
echo HTTP API health:
curl.exe -fsS "http://127.0.0.1:%APP_HTTP_PORT%/api/health" 2>nul || echo FAILED
echo.

if exist "infra\certs\stock-control.crt" (
  echo HTTPS API health:
  curl.exe -kfsS "https://127.0.0.1:%APP_HTTPS_PORT%/api/health" 2>nul || echo FAILED
  echo.
  echo User address: https://%TLS_HOSTNAME%:%APP_HTTPS_PORT%/
)

if exist "logs\health-status.json" (
  echo.
  echo Latest automatic health record:
  type "logs\health-status.json"
)

echo.
echo Scheduled maintenance tasks:
schtasks /Query /TN "Eaststone Stock Control - Health Monitor" /FO LIST 2>nul | findstr /I "TaskName Status Next Run"
schtasks /Query /TN "Eaststone Stock Control - Certificate Renewal" /FO LIST 2>nul | findstr /I "TaskName Status Next Run"
schtasks /Query /TN "Eaststone Stock Control - Daily Backup" /FO LIST 2>nul | findstr /I "TaskName Status Next Run"

echo.
pause
