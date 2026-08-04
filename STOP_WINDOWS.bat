@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Controlled Stop
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist.
  pause
  exit /b 1
)

if not exist "deployment" mkdir "deployment"
> "deployment\manual-stop.flag" echo Stopped deliberately by %USERDOMAIN%\%USERNAME% on %DATE% %TIME%

echo Stopping Stock Control while preserving the PostgreSQL volume...
docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" --env-file ".env" down --remove-orphans
if errorlevel 1 (
  docker compose -f "infra\docker-compose.production.yml" --env-file ".env" down --remove-orphans
)
if errorlevel 1 (
  echo ERROR: The application could not be stopped cleanly.
  del /f /q "deployment\manual-stop.flag" >nul 2>&1
  pause
  exit /b 1
)

echo Stock Control stopped.
echo The automatic health monitor will respect this controlled stop.
echo Run START_WINDOWS.bat to clear the stop and restart the system.
echo The database volume and all stock data were preserved.
pause
