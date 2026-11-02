@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Client Setup

set "STAGED=0"
if /I "%~1"=="--staged" set "STAGED=1"
set "SELF_NAME=%~nx0"

rem Stage every invocation, even if launched as Administrator from N: or a UNC share.
rem UAC may remove mapped network-drive visibility; execute solely from local files.
if "!STAGED!"=="0" (
  set "STAGE=%TEMP%\StkFlo-Client-%RANDOM%-%RANDOM%"
  mkdir "!STAGE!" >nul 2>&1
  robocopy "%~dp0." "!STAGE!" /E /R:2 /W:1 /NFL /NDL /NP >nul
  if !ERRORLEVEL! GEQ 8 goto :stage_error
  if not exist "!STAGE!\!SELF_NAME!" goto :stage_error
  set "STAGE_PATH=!STAGE!"
  set "SELF_NAME=!SELF_NAME!"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath (Join-Path $env:STAGE_PATH $env:SELF_NAME) -ArgumentList '--staged' -WorkingDirectory $env:STAGE_PATH -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
  set "RESULT=!ERRORLEVEL!"
  rmdir /s /q "!STAGE!" >nul 2>&1
  exit /b !RESULT!
)
net session >nul 2>&1
if errorlevel 1 (
  echo ERROR: Local administrator permissions are required.
  exit /b 1
)
cd /d "%~dp0"
set "CONFIG=client-config.ini"
set "CA_CERT=stock-control-ca.crt"
set "ICON_SOURCE=stkflo.ico"
set "ICON_DIR=%ProgramData%\StkFlo\Client"
set "ICON_DEST=%ICON_DIR%\stkflo.ico"

if not exist "%CONFIG%" (
  echo ERROR: client-config.ini is missing from the client deployment package.
  set "RESULT=1"
  goto :finish
)
if not exist "%CA_CERT%" (
  echo ERROR: stock-control-ca.crt is missing from the client deployment package.
  set "RESULT=1"
  goto :finish
)

if not exist "%ICON_SOURCE%" (
  echo ERROR: The StkFlo client icon is missing.
  set "RESULT=1"
  goto :finish
)
if not exist "%ICON_DIR%" mkdir "%ICON_DIR%"
copy /Y "%ICON_SOURCE%" "%ICON_DEST%" >nul
if errorlevel 1 (
  echo ERROR: Unable to install the StkFlo shortcut icon.
  set "RESULT=1"
  goto :finish
)
set "TLS_HOSTNAME=stkflo"
set "SERVER_IP="
set "APP_HTTPS_PORT=443"
for /f "usebackq tokens=1,* delims==" %%A in ("%CONFIG%") do (
  if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"
  if /I "%%A"=="SERVER_IP" set "SERVER_IP=%%B"
  if /I "%%A"=="APP_HTTPS_PORT" set "APP_HTTPS_PORT=%%B"
)

if not defined SERVER_IP (
  echo ERROR: SERVER_IP is missing from client-config.ini.
  set "RESULT=1"
  goto :finish
)

rem Proven working behaviour from the previous Windows deployment checkpoint:
rem clients map the application hostname to the server LAN address, while the
rem server itself uses loopback when deliberately running the client setup.
set "HOSTS_IP=%SERVER_IP%"
set "RUNNING_ON_SERVER=0"
reg query "HKLM\SOFTWARE\StkFlo\Server" /v InstallPath >nul 2>&1
if not errorlevel 1 (
  set "HOSTS_IP=127.0.0.1"
  set "RUNNING_ON_SERVER=1"
)

echo ============================================================
echo   StkFlo - Client Setup
echo ============================================================
echo StkFlo hostname: %TLS_HOSTNAME%
if "%RUNNING_ON_SERVER%"=="1" echo Local server installation detected - using 127.0.0.1 for this computer only.
echo.

echo Installing the StkFlo trusted-root certificate...
certutil.exe -addstore -f Root "%CA_CERT%" >nul
if errorlevel 1 goto :cert_failed
for /f "usebackq delims=" %%T in (`powershell.exe -NoProfile -Command "$c=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path -LiteralPath '%CA_CERT%').Path);$c.Thumbprint"`) do set "CA_THUMBPRINT=%%T"

echo Configuring the Stock Control hostname...
if exist "Configure-Hosts.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -IpAddress "%HOSTS_IP%"
) else (
  echo ERROR: Configure-Hosts.ps1 is missing.
  goto :hosts_failed
)
if errorlevel 1 goto :hosts_failed

set "APP_URL=https://%TLS_HOSTNAME%/"
if not "%APP_HTTPS_PORT%"=="443" set "APP_URL=https://%TLS_HOSTNAME%:%APP_HTTPS_PORT%/"
echo Creating application shortcuts...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop');$start=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';$edge=(Get-Command msedge.exe -ErrorAction SilentlyContinue).Source;if(-not $edge){$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'};$shell=New-Object -ComObject WScript.Shell;foreach($dir in @($env:PUBLIC+'\Desktop',$env:ProgramData+'\Microsoft\Windows\Start Menu\Programs')){if(Test-Path $dir){$s=$shell.CreateShortcut((Join-Path $dir 'StkFlo.lnk'));if(Test-Path $edge){$s.TargetPath=$edge;$s.Arguments='--app=%APP_URL%';$s.IconLocation='%ICON_DEST%'}else{$s.TargetPath='%SystemRoot%\System32\cmd.exe';$s.Arguments='/c start "" "%APP_URL%"'};$s.IconLocation='%ICON_DEST%';$s.Description='StkFlo';$s.Save()}}"
if errorlevel 1 goto :shortcut_failed

echo Verifying trusted HTTPS access...
rem Windows curl uses Schannel. A private CA without CRL/OCSP distribution
rem points can return CRYPT_E_NO_REVOCATION_CHECK even when the certificate
rem chain and hostname are otherwise valid. Best-effort revocation keeps normal
rem certificate and hostname validation while tolerating an unavailable
rem revocation endpoint.
curl.exe --ssl-revoke-best-effort -fsS "%APP_URL%api/health" >nul 2>&1
if errorlevel 1 goto :health_failed

reg add "HKLM\SOFTWARE\StkFlo\Client" /v ServerUrl /t REG_SZ /d "%APP_URL%" /f >nul
reg add "HKLM\SOFTWARE\StkFlo\Client" /v ServerHostname /t REG_SZ /d "%TLS_HOSTNAME%" /f >nul
reg add "HKLM\SOFTWARE\StkFlo\Client" /v ServerIP /t REG_SZ /d "%SERVER_IP%" /f >nul
if defined CA_THUMBPRINT reg add "HKLM\SOFTWARE\StkFlo\Client" /v CAThumbprint /t REG_SZ /d "%CA_THUMBPRINT%" /f >nul
reg add "HKLM\SOFTWARE\StkFlo\Client" /v InstalledOn /t REG_SZ /d "%DATE% %TIME%" /f >nul

echo.
echo ============================================================
echo   Client setup completed successfully
echo ============================================================
echo The trusted certificate, hostname and application shortcuts are configured.
start "" "%APP_URL%"
set "RESULT=0"
goto :finish

:cert_failed
echo ERROR: The trusted-root certificate could not be installed.
set "RESULT=1"
goto :finish
:hosts_failed
echo ERROR: The Windows hosts entry could not be configured.
set "RESULT=1"
goto :finish
:shortcut_failed
echo ERROR: The application shortcut could not be created.
set "RESULT=1"
goto :finish
:health_failed
echo ERROR: The client cannot reach %APP_URL%
echo Check that the server is running, the IP address is correct, and port %APP_HTTPS_PORT% is allowed.
set "RESULT=1"

:finish
echo.
pause
exit /b %RESULT%

:stage_error
echo ERROR: Client package could not be staged locally.
pause
exit /b 1
