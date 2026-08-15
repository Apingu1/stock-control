@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Complete Uninstall

net session >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

cd /d "%~dp0"
set "TLS_HOSTNAME=stock-control.test"
if exist "deployment\server-config.ini" for /f "usebackq tokens=1,* delims==" %%A in ("deployment\server-config.ini") do if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"

echo ============================================================
echo   Eaststone Stock Control - COMPLETE UNINSTALL
echo ============================================================
echo.
echo WARNING: This permanently removes the Stock Control installation.
echo It removes containers, the PostgreSQL volume and all stock data,
echo generated images, certificates, trusted-root entry, hosts entry,
echo firewall rules, scheduled tasks, backups, logs and shortcuts.
echo.
echo Docker Desktop and unrelated Docker projects are NOT removed.
echo.
set /p "CONFIRM1=Type UNINSTALL to continue: "
if /I not "%CONFIRM1%"=="UNINSTALL" goto :cancelled
echo.
echo FINAL WARNING: ALL STOCK CONTROL DATA WILL BE DESTROYED.
set /p "CONFIRM2=Type DELETE ALL DATA to confirm: "
if /I not "%CONFIRM2%"=="DELETE ALL DATA" goto :cancelled

where docker >nul 2>&1
if errorlevel 1 goto :no_docker
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is not running. Attempting to start Docker Desktop for safe cleanup...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
  for /L %%I in (1,1,60) do (
    timeout /t 2 /nobreak >nul
    docker info >nul 2>&1
    if not errorlevel 1 goto :docker_ready
  )
  goto :docker_not_running
)

:docker_ready
echo Removing scheduled maintenance tasks...
schtasks /Delete /TN "Eaststone Stock Control - Health Monitor" /F >nul 2>&1
schtasks /Delete /TN "Eaststone Stock Control - Certificate Renewal" /F >nul 2>&1
schtasks /Delete /TN "Eaststone Stock Control - Daily Backup" /F >nul 2>&1

echo Removing Windows Firewall rules...
netsh advfirewall firewall delete rule name="Eaststone Stock Control HTTP" >nul 2>&1
netsh advfirewall firewall delete rule name="Eaststone Stock Control HTTPS" >nul 2>&1

echo Removing the local hostname entry...
if exist "windows\Configure-Hosts.ps1" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -Remove >nul 2>&1

echo Removing the Stock Control private CA from Local Computer Trusted Root...
if exist "deployment\trusted-root-thumbprint.txt" (
  set /p "CERT_THUMBPRINT=" < "deployment\trusted-root-thumbprint.txt"
  if defined CERT_THUMBPRINT powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem 'Cert:\LocalMachine\Root\!CERT_THUMBPRINT!' -ErrorAction SilentlyContinue ^| Remove-Item -Force -ErrorAction SilentlyContinue"
)

echo Removing Docker containers, network, images and database volume...
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

echo Removing generated data and local records...
if exist ".env" del /f /q ".env" >nul 2>&1
for %%F in (stock-control.crt stock-control.key stock-control-ca.crt stock-control-ca.key stock-control-ca.srl stock-control.csr stock-control.ext) do if exist "infra\certs\%%F" del /f /q "infra\certs\%%F" >nul 2>&1
for %%D in (backups-production-test client-deployment deployment deployment-records logs) do if exist "%%D" (
  attrib -h -s -r "%%D\*" /s /d >nul 2>&1
  rmdir /s /q "%%D" >nul 2>&1
)

del /f /q "%USERPROFILE%\Desktop\Eaststone Stock Control.url" >nul 2>&1
del /f /q "%USERPROFILE%\Desktop\Eaststone Stock Control.lnk" >nul 2>&1
del /f /q "%USERPROFILE%\Desktop\ESC Backup and Restore.lnk" >nul 2>&1
del /f /q "%USERPROFILE%\Desktop\ESC Status.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\Eaststone Stock Control.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\ESC Backup and Restore.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\ESC Status.lnk" >nul 2>&1
reg delete "HKLM\SOFTWARE\Eaststone\StockControl" /f >nul 2>&1

echo.
echo Stock Control runtime resources and all generated data were removed.
echo.
set /p "DELETEFILES=Also delete this entire installed application folder? Type DELETE FOLDER to confirm: "
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
echo The source and installer files were retained; runtime data has been removed.
pause
exit /b 0
:no_docker
echo ERROR: Docker was not found. Complete Docker cleanup cannot be verified.
goto :failed
:docker_not_running
echo ERROR: Docker did not start. No generated files were deleted so cleanup can be retried safely.
goto :failed
:cancelled
echo Uninstall cancelled. Nothing was removed.
pause
exit /b 0
:failed
echo.
pause
exit /b 1
