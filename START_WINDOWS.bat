@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Start
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist. Run INSTALL_WINDOWS.bat first.
  pause
  exit /b 1
)

set "APP_HTTP_PORT=8088"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTP_PORT=" ".env" 2^>nul') do set "APP_HTTP_PORT=%%B"

docker compose -f "infra\docker-compose.production.yml" --env-file ".env" up -d
if errorlevel 1 (
  echo ERROR: The application could not be started.
  pause
  exit /b 1
)

start "" "http://localhost:%APP_HTTP_PORT%"
echo Stock Control started at http://localhost:%APP_HTTP_PORT%
pause
