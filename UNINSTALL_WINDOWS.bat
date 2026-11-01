@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Complete Test Uninstall
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
if /I not "%~1"=="--staged" (
  if not exist "%INSTALL_ROOT%\infra\docker-compose.production.yml" (
    echo ERROR: No StkFlo server installation was found at %INSTALL_ROOT%.
    pause
    exit /b 1
  )
  set "STAGE=%TEMP%\StkFlo-Uninstall-%RANDOM%.bat"
  copy /Y "%~f0" "!STAGE!" >nul
  if errorlevel 1 (
    echo ERROR: Cannot stage the uninstaller locally.
    exit /b 1
  )
  set "STAGE_UNINSTALL=!STAGE!"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath $env:STAGE_UNINSTALL -ArgumentList '--staged' -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
  set "EXIT_CODE=!ERRORLEVEL!"
  del /f /q "!STAGE!" >nul 2>&1
  exit /b !EXIT_CODE!
)
net session >nul 2>&1
if errorlevel 1 exit /b 1
cd /d "%INSTALL_ROOT%"
echo ============================================================
echo   StkFlo - CLEAN TEST UNINSTALL
echo ============================================================
echo WARNING: All VM-local application data and PostgreSQL volumes will
echo be deleted. The N: distribution package and network/cloud backups
echo are NOT deleted. Host-side manager is removed separately on Hyper-V.
echo.
set /p "CONFIRM1=Type UNINSTALL to proceed: "
if /I not "!CONFIRM1!"=="UNINSTALL" exit /b 0
set /p "CONFIRM2=Type DELETE LOCAL DATA to confirm: "
if /I not "!CONFIRM2!"=="DELETE LOCAL DATA" exit /b 0
docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker must be running to verify removal of PostgreSQL volumes.
  pause
  exit /b 1
)
echo Removing StkFlo containers and volumes...
docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" --env-file ".env" down -v --remove-orphans
if errorlevel 1 goto :failed
docker volume rm stkflo-db-data >nul 2>&1
echo Removing VM-specific Windows maintenance tasks...
for %%T in (
  "StkFlo - Health Monitor"
  "StkFlo - Certificate Renewal"
  "StkFlo - Stack Start"
  "StkFlo - Stack Stop"
  "StkFlo - Stack Restart"
  "StkFlo - Backup Replication"
  "StkFlo - VM Manager"
) do schtasks /Delete /TN %%T /F >nul 2>&1
netsh advfirewall firewall delete rule name="StkFlo HTTPS" >nul 2>&1
netsh advfirewall firewall delete rule name="StkFlo - VM Manager HTTPS" >nul 2>&1
netsh http delete sslcert ipport=0.0.0.0:9444 >nul 2>&1
reg delete "HKLM\SOFTWARE\StkFlo\Server" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\StkFlo\Client" /f >nul 2>&1
if exist "deployment\server-config.ini" for /f "tokens=1,* delims==" %%A in ('findstr /B "TLS_HOSTNAME=" "deployment\server-config.ini"') do (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Configure-Hosts.ps1" -Hostname "%%B" -Remove >nul 2>&1
)
if exist "deployment\trusted-root-thumbprint.txt" (
  set /p "CERT_HASH=" < "deployment\trusted-root-thumbprint.txt"
  if defined CERT_HASH powershell.exe -NoProfile -Command "Remove-Item -LiteralPath ('Cert:\LocalMachine\Root\' + $env:CERT_HASH) -Force -ErrorAction SilentlyContinue"
)
echo Removing installed application files, local backups, and management agent...
cd /d "%ProgramData%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath $env:INSTALL_ROOT -Recurse -Force -ErrorAction Stop; Remove-Item -LiteralPath (Join-Path $env:ProgramData 'StkFlo\Management') -Recurse -Force -ErrorAction SilentlyContinue"
if errorlevel 1 goto :failed
echo StkFlo removed from this Windows VM. Network backups were preserved.
echo The physical Hyper-V Host Manager was not touched.
pause
exit /b 0
:failed
echo ERROR: Full uninstall could not be verified. Do not assume data was removed.
pause
exit /b 1
