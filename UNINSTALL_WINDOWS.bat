@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Complete Uninstall
cd /d "%~dp0"

echo ============================================================
echo   Eaststone Stock Control - COMPLETE UNINSTALL
echo ============================================================
echo.
echo WARNING: This permanently removes the production-test system.
echo.
echo It will remove:
echo   - Stock Control Docker containers
echo   - The production-test PostgreSQL database volume
echo   - All stock data held in that database
echo   - Production-test Docker images
echo   - Generated .env secrets
echo   - Generated HTTPS certificates and private keys
echo   - Production-test backups in this folder
echo   - The desktop shortcut
echo.
echo It will NOT uninstall Docker Desktop or remove unrelated Docker projects.
echo.
set /p "CONFIRM1=Type UNINSTALL to continue: "
if /I not "%CONFIRM1%"=="UNINSTALL" goto :cancelled

echo.
echo FINAL WARNING: ALL STOCK CONTROL TEST DATA WILL BE DESTROYED.
set /p "CONFIRM2=Type DELETE ALL DATA to confirm: "
if /I not "%CONFIRM2%"=="DELETE ALL DATA" goto :cancelled

echo.
echo Removing Stock Control production-test Docker resources...

where docker >nul 2>&1
if errorlevel 1 goto :skip_docker

docker info >nul 2>&1
if errorlevel 1 goto :docker_not_running

if exist ".env" (
  docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" --env-file ".env" down -v --remove-orphans >nul 2>&1
  docker compose -f "infra\docker-compose.production.yml" --env-file ".env" down -v --remove-orphans >nul 2>&1
) else (
  docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" down -v --remove-orphans >nul 2>&1
  docker compose -f "infra\docker-compose.production.yml" down -v --remove-orphans >nul 2>&1
)

docker rm -f stock-control-prodtest-web-1 stock-control-prodtest-api-1 stock-control-prodtest-db-init-1 stock-control-prodtest-db-1 >nul 2>&1
docker volume rm stock-control-prodtest-db-data >nul 2>&1
docker network rm stock-control-prodtest_stock_control_internal >nul 2>&1
docker image rm stock-control-prodtest-web stock-control-prodtest-api >nul 2>&1

:skip_docker
echo Removing generated configuration, certificates and backups...

if exist ".env" del /f /q ".env" >nul 2>&1
if exist "infra\certs\stock-control.crt" del /f /q "infra\certs\stock-control.crt" >nul 2>&1
if exist "infra\certs\stock-control.key" del /f /q "infra\certs\stock-control.key" >nul 2>&1
if exist "infra\certs\stock-control-ca.crt" del /f /q "infra\certs\stock-control-ca.crt" >nul 2>&1
if exist "infra\certs\stock-control-ca.key" del /f /q "infra\certs\stock-control-ca.key" >nul 2>&1
if exist "infra\certs\stock-control-ca.srl" del /f /q "infra\certs\stock-control-ca.srl" >nul 2>&1
if exist "infra\certs\stock-control.csr" del /f /q "infra\certs\stock-control.csr" >nul 2>&1
if exist "infra\certs\stock-control.ext" del /f /q "infra\certs\stock-control.ext" >nul 2>&1

if exist "backups-production-test" (
  attrib -h -s -r "backups-production-test\*" /s /d >nul 2>&1
  rmdir /s /q "backups-production-test" >nul 2>&1
)

if exist "%USERPROFILE%\Desktop\Eaststone Stock Control.url" del /f /q "%USERPROFILE%\Desktop\Eaststone Stock Control.url" >nul 2>&1
if exist "%PUBLIC%\Desktop\Eaststone Stock Control.url" del /f /q "%PUBLIC%\Desktop\Eaststone Stock Control.url" >nul 2>&1

echo.
echo Docker resources and all generated Stock Control test data were removed.
echo.
set /p "DELETEFILES=Also delete this entire extracted application folder? Type DELETE FOLDER to confirm: "
if /I not "%DELETEFILES%"=="DELETE FOLDER" goto :keep_files

set "TARGET_DIR=%CD%"
set "CLEANUP=%TEMP%\remove-eaststone-stock-control-%RANDOM%.bat"
(
  echo @echo off
  echo timeout /t 3 /nobreak ^>nul
  echo cd /d "%TEMP%"
  echo attrib -h -s -r "%TARGET_DIR%\*" /s /d ^>nul 2^>^&1
  echo rmdir /s /q "%TARGET_DIR%"
  echo del /f /q "%%~f0"
) > "%CLEANUP%"

echo The application folder will now be deleted.
start "" /min cmd /c ""%CLEANUP%""
exit /b 0

:keep_files
echo.
echo The extracted installer/source files were retained.
echo The application and all generated runtime data have been removed.
pause
exit /b 0

:docker_not_running
echo.
echo ERROR: Docker is installed but not running.
echo Start Docker Desktop first so containers and the database volume can be removed safely.
echo No files have been deleted.
pause
exit /b 1

:cancelled
echo.
echo Uninstall cancelled. Nothing was removed.
pause
exit /b 0
