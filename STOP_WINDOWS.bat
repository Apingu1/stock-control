@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Stop
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist.
  pause
  exit /b 1
)

docker compose -f "infra\docker-compose.production.yml" --env-file ".env" down
if errorlevel 1 (
  echo ERROR: The application could not be stopped cleanly.
  pause
  exit /b 1
)

echo Stock Control stopped.
echo The production-test database volume was preserved.
echo Do not use docker compose down -v unless deleting the test database intentionally.
pause
