@echo off
setlocal EnableExtensions DisableDelayedExpansion
title StkFlo - Server Setup

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator access...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

cd /d "%~dp0"
set "INSTALL_ROOT=%CD%"
set "QUIET_COMMERCIAL=0"
if /I "%~1"=="--commercial" set "QUIET_COMMERCIAL=1"
set "TLS_HOSTNAME=%~1"
set "SERVER_IP=%~2"
if "%QUIET_COMMERCIAL%"=="1" set "TLS_HOSTNAME=stkflo"
if not defined TLS_HOSTNAME set "TLS_HOSTNAME=stkflo"

rem Automatically select only a private RFC1918 address on an active adapter
rem with a default gateway. This prevents VPN/public/WAN addresses from being
rem written into the client deployment package.
if not defined SERVER_IP (
  for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "$ips=Get-NetIPConfiguration ^| Where-Object {$_.IPv4DefaultGateway -and $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up'} ^| ForEach-Object {$_.IPv4Address.IPAddress}; $private=$ips ^| Where-Object { if($_ -match '^10\.'){$true} elseif($_ -match '^192\.168\.'){$true} elseif($_ -match '^172\.(\d+)\.'){ $n=[int]$Matches[1]; $n -ge 16 -and $n -le 31 } else {$false} } ^| Select-Object -First 1; if($private){$private}"`) do set "SERVER_IP=%%I"
)

:validate_server_ip
set "SERVER_IP_VALID="
if defined SERVER_IP (
  set "ESC_SERVER_IP_TO_VALIDATE=%SERVER_IP%"
  for /f "usebackq delims=" %%V in (`powershell.exe -NoProfile -Command "$parsed=$null; if([System.Net.IPAddress]::TryParse($env:ESC_SERVER_IP_TO_VALIDATE,[ref]$parsed) -and $parsed.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork){'VALID'}"`) do set "SERVER_IP_VALID=%%V"
  set "ESC_SERVER_IP_TO_VALIDATE="
)

if not defined SERVER_IP_VALID (
  echo.
  echo A valid private LAN IPv4 address could not be detected automatically.
  echo Run IPCONFIG in Command Prompt and use the IPv4 Address for the active Ethernet or Wi-Fi adapter.
  echo Typical internal addresses start 10.x.x.x, 172.16-31.x.x or 192.168.x.x.
  set "SERVER_IP="
  set /p "SERVER_IP=Enter this computer's company-network IPv4 address: "
  if not defined SERVER_IP goto :configuration_failed
  goto :validate_server_ip
)

echo ============================================================
echo   StkFlo - Recommended Server Setup
echo ============================================================
echo Installation folder: %INSTALL_ROOT%
echo HTTPS hostname:      %TLS_HOSTNAME%
echo Server IPv4:         %SERVER_IP%
echo.

where docker >nul 2>&1
if errorlevel 1 goto :no_docker
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker is installed but not running. Attempting to start Docker Desktop...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
  for /L %%I in (1,1,90) do (
    timeout /t 2 /nobreak >nul
    docker info >nul 2>&1
    if not errorlevel 1 goto :docker_ready
  )
  goto :docker_failed
)

:docker_ready
if not exist "deployment" mkdir "deployment"
if not exist "deployment-records" mkdir "deployment-records"
if not exist "logs" mkdir "logs"
if not exist "client-deployment" goto :client_template_failed
if not exist "client-deployment\01 - INSTALL CLIENT.bat" goto :client_template_failed
if not exist "client-deployment\02 - UNINSTALL CLIENT.bat" goto :client_template_failed
if not exist "client-deployment\Configure-Hosts.ps1" goto :client_template_failed
if not exist "client-deployment\client-config.ini" goto :client_template_failed
if not exist "client-deployment\README.txt" goto :client_template_failed
if not exist "client-deployment\stkflo.ico" goto :client_template_failed

echo Running controlled application and database installation...
call "INSTALL_WINDOWS.bat" --quiet
if errorlevel 1 goto :base_install_failed

echo Configuring managed HTTPS...
call "ENABLE_HTTPS_WINDOWS.bat" "%TLS_HOSTNAME%" "%SERVER_IP%" --quiet
if errorlevel 1 goto :https_failed

(
  echo TLS_HOSTNAME=%TLS_HOSTNAME%
  echo SERVER_IP=%SERVER_IP%
  echo APP_HTTP_PORT=8088
  echo APP_HTTPS_PORT=443
  echo INSTALL_ROOT=%INSTALL_ROOT%
) > "deployment\server-config.ini"

echo Installing the private CA into this server's trusted-root store...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Install-TrustedRoot.ps1" -CertificatePath "infra\certs\stock-control-ca.crt" -ThumbprintRecordPath "deployment\trusted-root-thumbprint.txt"
if errorlevel 1 goto :cert_failed

echo Configuring the server hostname...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -IpAddress "127.0.0.1"
if errorlevel 1 goto :hosts_failed

echo Configuring Windows Firewall...
netsh advfirewall firewall delete rule name="StkFlo HTTP" >nul 2>&1
netsh advfirewall firewall delete rule name="StkFlo HTTPS" >nul 2>&1
rem HTTP diagnostic port binds to 127.0.0.1; do not expose through Windows Firewall.
netsh advfirewall firewall add rule name="StkFlo HTTPS" dir=in action=allow protocol=TCP localport=443 profile=domain,private >nul
if errorlevel 1 goto :firewall_failed

echo Registering certificate renewal and health monitoring...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Register-MaintenanceTasks.ps1" -InstallRoot "%INSTALL_ROOT%"
if errorlevel 1 goto :tasks_failed

rem Match the proven working client deployment behaviour: the server setup
rem finalises one complete BAT-based client folder with the real public CA and
rem the real server address. No client EXE is generated.
echo Finalising the client deployment package...
copy /Y "infra\certs\stock-control-ca.crt" "client-deployment\stock-control-ca.crt" >nul
if errorlevel 1 goto :client_template_failed
(
  echo TLS_HOSTNAME=%TLS_HOSTNAME%
  echo SERVER_IP=%SERVER_IP%
  echo APP_HTTPS_PORT=443
) > "client-deployment\client-config.ini"
if not exist "client-deployment\stock-control-ca.crt" goto :client_template_failed

echo Creating server shortcuts...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url='https://%TLS_HOSTNAME%/';$desktop=[Environment]::GetFolderPath('Desktop');$start=Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs';$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source;if(-not $edge){$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'};$shell=New-Object -ComObject WScript.Shell;foreach($spec in @(@('StkFlo',$url),@('StkFlo Backup Settings','%INSTALL_ROOT%\ESC_BACKUP_SETTINGS_WINDOWS.bat'),@('StkFlo Backup and Restore','%INSTALL_ROOT%\ESC_BACKUP_RESTORE_WINDOWS.bat'),@('StkFlo Status','%INSTALL_ROOT%\STATUS_WINDOWS.bat'))){foreach($dir in @($desktop,$start)){if(Test-Path $dir){$s=$shell.CreateShortcut((Join-Path $dir ($spec[0]+'.lnk')));if($spec[1] -like 'https:*'){$s.TargetPath=$edge;$s.Arguments='--app='+$spec[1];if($spec[0] -eq 'StkFlo'){$s.IconLocation='%INSTALL_ROOT%\web\public\icons\stkflo-favicon.ico'}}else{$s.TargetPath=$spec[1]};$s.WorkingDirectory='%INSTALL_ROOT%';$s.Description=$spec[0];$s.Save()}}}"

reg add "HKLM\SOFTWARE\StkFlo\Server" /v InstallPath /t REG_SZ /d "%INSTALL_ROOT%" /f >nul
reg add "HKLM\SOFTWARE\StkFlo\Server" /v ServerUrl /t REG_SZ /d "https://%TLS_HOSTNAME%/" /f >nul
reg add "HKLM\SOFTWARE\StkFlo\Server" /v ServerIP /t REG_SZ /d "%SERVER_IP%" /f >nul
reg add "HKLM\SOFTWARE\StkFlo\Server" /v InstalledOn /t REG_SZ /d "%DATE% %TIME%" /f >nul

echo Creating the first verified database backup...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Automatic-Backup.ps1" -InstallRoot "%INSTALL_ROOT%" -BackupType "INITIAL" -Reason "Initial post-installation backup"
if errorlevel 1 echo WARNING: Initial backup failed. Review logs\backup.log.

echo Executing installation qualification checks...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "windows\Generate-IQReport.ps1" -InstallRoot "%INSTALL_ROOT%"
if errorlevel 1 echo WARNING: One or more IQ checks failed. Review deployment-records\StkFlo-IQ-Execution-Latest.html.

echo.
echo ============================================================
echo   Server setup completed
echo ============================================================
echo Application: https://%TLS_HOSTNAME%/
echo Client deployment folder: %INSTALL_ROOT%\client-deployment
echo Client package server IP: %SERVER_IP%
echo Initial login: admin / unique password shown once during base setup.
echo A new private administrator password is mandatory at first login.
echo IQ report: %INSTALL_ROOT%\deployment-records\StkFlo-IQ-Execution-Latest.html
echo.
if "%QUIET_COMMERCIAL%"=="1" (
  echo Returning to the original commercial installer to publish and verify
  echo the client certificate and server IP in the originating N: release.
  exit /b 0
)
start "" "https://%TLS_HOSTNAME%/"
pause
exit /b 0

:no_docker
echo ERROR: Docker Desktop is not installed or docker.exe is unavailable.
goto :failed
:docker_failed
echo ERROR: Docker Desktop did not become ready.
goto :failed
:configuration_failed
echo ERROR: Server address configuration is incomplete or invalid.
goto :failed
:client_template_failed
echo ERROR: The client deployment package is missing or incomplete.
echo Re-run 01 - INSTALL SERVER.bat from the complete commercial package.
goto :failed
:base_install_failed
echo ERROR: Base StkFlo installation failed.
goto :failed
:https_failed
echo ERROR: HTTPS configuration failed.
goto :failed
:cert_failed
echo ERROR: The private CA could not be trusted on the server.
goto :failed
:hosts_failed
echo ERROR: The server hosts entry could not be configured.
goto :failed
:firewall_failed
echo ERROR: Windows Firewall rules could not be configured.
goto :failed
:tasks_failed
echo ERROR: Automatic maintenance tasks could not be registered.
goto :failed
:failed
echo.
echo Review the visible error and docs\windows\TROUBLESHOOTING.md.
if "%QUIET_COMMERCIAL%"=="0" pause
exit /b 1
