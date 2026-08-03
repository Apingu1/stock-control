@echo off
setlocal EnableExtensions
title Eaststone Stock Control - Reset Admin Password
cd /d "%~dp0"

echo ============================================================
echo   Eaststone Stock Control - Reset Admin Password
echo ============================================================
echo.

where docker >nul 2>&1
if errorlevel 1 goto :no_docker

docker info >nul 2>&1
if errorlevel 1 goto :docker_not_running

if not exist ".env" goto :no_env

set "APP_HTTP_PORT=8088"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTP_PORT=" ".env" 2^>nul') do set "APP_HTTP_PORT=%%B"

echo Resetting the administrator account...
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" exec -T -e BOOTSTRAP_ADMIN_PASSWORD=Admin123! api python -m app.bootstrap_admin
if errorlevel 1 goto :reset_failed

set "LOGIN_JSON=%TEMP%\eaststone-login-test-%RANDOM%.json"
> "%LOGIN_JSON%" echo {"username":"admin","password":"Admin123!"}
curl.exe -fsS -X POST -H "Content-Type: application/json" --data-binary "@%LOGIN_JSON%" "http://127.0.0.1:%APP_HTTP_PORT%/api/auth/login/" >nul 2>&1
set "LOGIN_RESULT=%ERRORLEVEL%"
del /f /q "%LOGIN_JSON%" >nul 2>&1

if not "%LOGIN_RESULT%"=="0" goto :login_failed

echo.
echo SUCCESS: Administrator access was reset and verified.
echo Username: admin
echo Password: Admin123!
echo.
echo Change this password immediately after logging in.
start "" "http://localhost:%APP_HTTP_PORT%"
pause
exit /b 0

:no_docker
echo ERROR: Docker was not found.
goto :failed

:docker_not_running
echo ERROR: Docker is installed but is not running.
goto :failed

:no_env
echo ERROR: .env was not found. Run INSTALL_WINDOWS.bat first.
goto :failed

:reset_failed
echo ERROR: The administrator account could not be reset.
goto :show_logs

:login_failed
echo ERROR: The password was reset but the login endpoint still failed.
echo This usually indicates that the database schema is incomplete.
goto :show_logs

:show_logs
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" ps
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" logs --tail=150 api db-init db

:failed
echo.
pause
exit /b 1
