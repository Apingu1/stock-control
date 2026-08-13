@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Pharmagrowth Stock Control - Complete Uninstall

net session >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

set "INSTALL_ROOT=%ProgramData%\Eaststone\StockControl"
for %%I in ("%~dp0..") do set "PACKAGE_ROOT=%%~fI"

if not exist "%INSTALL_ROOT%\infra\docker-compose.production.yml" (
  echo ERROR: Stock Control is not installed at:
  echo   %INSTALL_ROOT%
  echo.
  echo The extracted commercial package is:
  echo   %PACKAGE_ROOT%
  pause
  exit /b 1
)

set "TLS_HOSTNAME=stock-control.test"
if exist "%INSTALL_ROOT%\deployment\server-config.ini" for /f "usebackq tokens=1,* delims==" %%A in ("%INSTALL_ROOT%\deployment\server-config.ini") do if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"

echo ============================================================
echo   Pharmagrowth Stock Control - COMPLETE UNINSTALL
echo ============================================================
echo.
echo Installed application:
echo   %INSTALL_ROOT%
echo.
echo Extracted commercial package:
echo   %PACKAGE_ROOT%
echo.
echo WARNING: This permanently removes the Stock Control runtime and data.
echo It removes containers, the PostgreSQL volume and all stock data,
echo generated certificates, trusted-root entry, hosts entry, firewall rules,
echo scheduled tasks, local default backups, logs and application shortcuts.
echo A configured backup folder outside the installation is retained.
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
if exist "%INSTALL_ROOT%\windows\Configure-Hosts.ps1" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_ROOT%\windows\Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -Remove >nul 2>&1

echo Removing the Stock Control private CA from Local Computer Trusted Root...
if exist "%INSTALL_ROOT%\deployment\trusted-root-thumbprint.txt" (
  set /p "CERT_THUMBPRINT=" < "%INSTALL_ROOT%\deployment\trusted-root-thumbprint.txt"
  if defined CERT_THUMBPRINT powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem 'Cert:\LocalMachine\Root\!CERT_THUMBPRINT!' -ErrorAction SilentlyContinue ^| Remove-Item -Force -ErrorAction SilentlyContinue"
)

echo Removing Docker containers, network, images and database volume...
pushd "%INSTALL_ROOT%"
if exist ".env" (
  docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" --env-file ".env" down -v --remove-orphans >nul 2>&1
  docker compose -f "infra\docker-compose.production.yml" --env-file ".env" down -v --remove-orphans >nul 2>&1
) else (
  docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" down -v --remove-orphans >nul 2>&1
  docker compose -f "infra\docker-compose.production.yml" down -v --remove-orphans >nul 2>&1
)
docker rm -f stock-control-prodtest-web-1 stock-control-prodtest-api-1 stock-control-prodtest-backup-scheduler-1 stock-control-prodtest-db-init-1 stock-control-prodtest-db-1 >nul 2>&1
docker volume rm stock-control-prodtest-db-data >nul 2>&1
docker network rm stock-control-prodtest_stock_control_internal >nul 2>&1
docker image rm stock-control-prodtest-web stock-control-prodtest-api >nul 2>&1

echo Removing generated data and local records...
if exist ".env" del /f /q ".env" >nul 2>&1
for %%F in (stock-control.crt stock-control.key stock-control-ca.crt stock-control-ca.key stock-control-ca.srl stock-control.csr stock-control.ext) do if exist "infra\certs\%%F" del /f /q "infra\certs\%%F" >nul 2>&1
for %%D in (Backups backups-production-test runtime-state client-deployment deployment deployment-records logs) do if exist "%%D" (
  attrib -h -s -r "%%D\*" /s /d >nul 2>&1
  rmdir /s /q "%%D" >nul 2>&1
)
popd

del /f /q "%USERPROFILE%\Desktop\Eaststone Stock Control.url" >nul 2>&1
del /f /q "%USERPROFILE%\Desktop\Eaststone Stock Control.lnk" >nul 2>&1
del /f /q "%USERPROFILE%\Desktop\ESC Backup and Restore.lnk" >nul 2>&1
del /f /q "%USERPROFILE%\Desktop\ESC Backup Settings.lnk" >nul 2>&1
del /f /q "%USERPROFILE%\Desktop\ESC Status.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\Eaststone Stock Control.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\ESC Backup and Restore.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\ESC Backup Settings.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\ESC Status.lnk" >nul 2>&1
reg delete "HKLM\SOFTWARE\Eaststone\StockControl" /f >nul 2>&1

echo.
echo Stock Control runtime resources and generated data were removed.
echo.
set /p "DELETEFILES=Also delete the installed application folder under ProgramData? Type DELETE FOLDER to confirm: "
if /I "%DELETEFILES%"=="DELETE FOLDER" (
  attrib -h -s -r "%INSTALL_ROOT%\*" /s /d >nul 2>&1
  rmdir /s /q "%INSTALL_ROOT%" >nul 2>&1
  if exist "%INSTALL_ROOT%" (
    echo WARNING: The installed application folder could not be fully removed.
    echo   %INSTALL_ROOT%
  ) else (
    echo Installed application folder removed.
  )
) else (
  echo Installed application source files retained; runtime data has been removed.
)

echo.
echo The extracted commercial package is separate:
echo   %PACKAGE_ROOT%
echo.

rem Never delete a centrally stored/shared deployment package automatically.
if "%PACKAGE_ROOT:~0,2%"=="\\" goto :shared_package
set "PACKAGE_DRIVE=%PACKAGE_ROOT:~0,2%"
net use %PACKAGE_DRIVE% >nul 2>&1
if not errorlevel 1 goto :shared_package

set /p "DELETE_PACKAGE=Also delete this local commercial package? Type DELETE PACKAGE to confirm: "
if /I not "%DELETE_PACKAGE%"=="DELETE PACKAGE" goto :keep_package

set "CLEANUP=%TEMP%\remove-pharmagrowth-stock-control-package-%RANDOM%.bat"
(
  echo @echo off
  echo timeout /t 3 /nobreak ^>nul
  echo cd /d "%TEMP%"
  echo attrib -h -s -r "%PACKAGE_ROOT%\*" /s /d ^>nul 2^>^&1
  echo rmdir /s /q "%PACKAGE_ROOT%"
  echo del /f /q "%%~f0"
) > "%CLEANUP%"

echo The local commercial package folder will now be deleted:
echo   %PACKAGE_ROOT%
start "" /min cmd.exe /c ""%CLEANUP%""
exit /b 0

:shared_package
echo This commercial package appears to be on a network/shared location.
echo For safety it will NOT be deleted automatically.
echo Remove the distribution copy manually only if authorised by IT.
pause
exit /b 0

:keep_package
echo Commercial installation package retained.
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
