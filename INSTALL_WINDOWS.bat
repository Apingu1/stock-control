@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Windows Installer
cd /d "%~dp0"

set "QUIET=0"
if /I "%~1"=="--quiet" set "QUIET=1"

echo ============================================================
echo   Eaststone Stock Control - Production Installer
echo ============================================================
echo.

where docker >nul 2>&1
if errorlevel 1 goto :no_docker
docker info >nul 2>&1
if errorlevel 1 goto :docker_not_running

set "CURRENT_DRIVE=%CD:~0,2%"
net use %CURRENT_DRIVE% >nul 2>&1
if not errorlevel 1 (
  echo WARNING: %CURRENT_DRIVE% appears to be a mapped network drive.
  echo Docker may not be able to build or mount files from this location.
  echo Use a local server folder for the installed application if the build fails.
  echo.
)

if not exist ".env" (
  echo Creating the server environment file...
  echo Generating secure secrets through Docker...
  for /f "delims=" %%S in ('docker run --rm python:3.11-alpine python -c "import secrets; print(secrets.token_hex(24))"') do set "DB_PASSWORD=%%S"
  for /f "delims=" %%S in ('docker run --rm python:3.11-alpine python -c "import secrets; print(secrets.token_hex(48))"') do set "JWT_SECRET=%%S"
  if not defined DB_PASSWORD goto :secret_failed
  if not defined JWT_SECRET goto :secret_failed
  (
    echo DB_HOST=db
    echo DB_PORT=5432
    echo DB_NAME=stock
    echo DB_USER=stock
    echo DB_PASSWORD=!DB_PASSWORD!
    echo JWT_SECRET=!JWT_SECRET!
    echo TZ=Europe/London
    echo FEATURE_STOCK_CONTROL=true
    echo FEATURE_REQUIRE_SECOND_CHECK=false
    echo FEATURE_REQUIRE_SCAN=false
    echo BACKUP_DIR=/backups
    echo BACKUP_DIR_LABEL=%CD%\backups-production-test
    echo APP_HTTP_PORT=8088
    echo APP_HTTPS_PORT=8443
  ) > ".env"
  echo Environment file created.
) else (
  echo Existing .env file found. It will not be overwritten.
)

if not exist "backups-production-test" mkdir "backups-production-test"
set "APP_HTTP_PORT=8088"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTP_PORT=" ".env" 2^>nul') do set "APP_HTTP_PORT=%%B"

echo.
echo Validating Docker configuration...
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" config >nul
if errorlevel 1 goto :config_failed

echo Building and starting the application...
echo The first build may download Docker images.
echo The database schema will be applied in the controlled go-live order.
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" up -d --build
if errorlevel 1 goto :start_failed

echo.
echo Waiting for Stock Control to become healthy...
for /L %%I in (1,1,90) do (
  curl.exe -fsS "http://127.0.0.1:!APP_HTTP_PORT!/api/health" >nul 2>&1
  if not errorlevel 1 goto :ready
  timeout /t 2 /nobreak >nul
)
goto :health_failed

:ready
setlocal DisableDelayedExpansion
echo.
echo Creating and verifying the bootstrap administrator...
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" exec -T -e BOOTSTRAP_ADMIN_PASSWORD=Admin123! api python -m app.bootstrap_admin
if errorlevel 1 goto :admin_failed_disabled
set "LOGIN_JSON=%TEMP%\eaststone-login-test-%RANDOM%.json"
> "%LOGIN_JSON%" echo {"username":"admin","password":"Admin123!"}
curl.exe -fsS -X POST -H "Content-Type: application/json" --data-binary "@%LOGIN_JSON%" "http://127.0.0.1:%APP_HTTP_PORT%/api/auth/login/" >nul 2>&1
if errorlevel 1 goto :login_failed_disabled
del /f /q "%LOGIN_JSON%" >nul 2>&1
endlocal
goto :installation_success

:admin_failed_disabled
endlocal
goto :admin_failed
:login_failed_disabled
del /f /q "%LOGIN_JSON%" >nul 2>&1
endlocal
goto :login_failed

:installation_success
echo.
echo ============================================================
echo   Base installation completed successfully
echo ============================================================
echo Server address: http://localhost:!APP_HTTP_PORT!
echo Initial username: admin
echo Initial password: Admin123!
echo Change the password immediately after first login.
if "%QUIET%"=="1" exit /b 0
set "SHORTCUT=%USERPROFILE%\Desktop\Eaststone Stock Control.url"
(
  echo [InternetShortcut]
  echo URL=http://localhost:!APP_HTTP_PORT!
  echo IconFile=%SystemRoot%\System32\SHELL32.dll
  echo IconIndex=13
) > "!SHORTCUT!"
start "" "http://localhost:!APP_HTTP_PORT!"
pause
exit /b 0

:no_docker
echo ERROR: Docker was not found.
echo Install Docker Desktop or Docker Engine, then run this file again.
goto :failed
:docker_not_running
echo ERROR: Docker is installed but is not running.
echo Start Docker Desktop and wait until it reports that Docker is running.
goto :failed
:secret_failed
echo ERROR: Secure secrets could not be generated through Docker.
goto :failed
:config_failed
echo ERROR: Docker Compose configuration validation failed.
goto :show_logs
:start_failed
echo ERROR: Docker could not build or start the application.
goto :show_logs
:health_failed
echo ERROR: The containers started, but the application did not become healthy.
goto :show_logs
:admin_failed
echo ERROR: The bootstrap administrator could not be created.
goto :show_logs
:login_failed
echo ERROR: The application became healthy, but the verified admin login failed.
goto :show_logs
:show_logs
echo.
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" ps
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" logs --tail=180 db db-init api web
:failed
echo.
if "%QUIET%"=="0" pause
exit /b 1
