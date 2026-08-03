@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Status
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist. Run INSTALL_WINDOWS.bat first.
  pause
  exit /b 1
)

set "APP_HTTP_PORT=8088"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTP_PORT=" ".env" 2^>nul') do set "APP_HTTP_PORT=%%B"

docker compose -f "infra\docker-compose.production.yml" --env-file ".env" ps
echo.
echo API health:
curl.exe -fsS "http://127.0.0.1:%APP_HTTP_PORT%/api/health"
echo.
echo.
echo Manifest:
curl.exe -fsS "http://127.0.0.1:%APP_HTTP_PORT%/manifest.webmanifest"
echo.
pause
