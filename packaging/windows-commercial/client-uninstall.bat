@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Client Uninstall

set "STAGED=0"
if /I "%~1"=="--staged" set "STAGED=1"
set "SELF_NAME=%~nx0"

rem Stage every invocation, even if launched as Administrator from N: or a UNC share.
rem UAC may remove mapped network-drive visibility; execute solely from local files.
if "!STAGED!"=="0" (
  set "STAGE=%TEMP%\StkFlo-Client-%RANDOM%-%RANDOM%"
  mkdir "!STAGE!" >nul 2>&1
  robocopy "%~dp0" "!STAGE!" /E /R:2 /W:1 /NFL /NDL /NP >nul
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
set "TLS_HOSTNAME=stkflo"
set "CA_THUMBPRINT="
set "RUNNING_ON_SERVER=0"

if exist "client-config.ini" (
  for /f "usebackq tokens=1,* delims==" %%A in ("client-config.ini") do (
    if /I "%%A"=="TLS_HOSTNAME" set "TLS_HOSTNAME=%%B"
  )
)

for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\StkFlo\Client" /v ServerHostname 2^>nul ^| find /I "ServerHostname"') do set "TLS_HOSTNAME=%%B"
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\StkFlo\Client" /v CAThumbprint 2^>nul ^| find /I "CAThumbprint"') do set "CA_THUMBPRINT=%%B"

if not defined CA_THUMBPRINT if exist "stock-control-ca.crt" (
  for /f "usebackq delims=" %%T in (`powershell.exe -NoProfile -Command "$c=New-Object System.Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path -LiteralPath 'stock-control-ca.crt').Path);$c.Thumbprint"`) do set "CA_THUMBPRINT=%%T"
)

reg query "HKLM\SOFTWARE\StkFlo\Server" /v InstallPath >nul 2>&1
if not errorlevel 1 set "RUNNING_ON_SERVER=1"

echo ============================================================
echo   StkFlo - Client Uninstall
echo ============================================================
echo.
echo This removes this computer's StkFlo client configuration only.
echo It does NOT remove the server, database, shared deployment folder or stock data.
if "%RUNNING_ON_SERVER%"=="1" (
  echo.
  echo Local server installation detected.
  echo Server certificate trust and the server hosts mapping will be preserved.
)
echo.
set /p "CONFIRM=Type UNINSTALL CLIENT to continue: "
if /I not "%CONFIRM%"=="UNINSTALL CLIENT" goto :cancelled

echo Removing application shortcuts...
del /f /q "%PUBLIC%\Desktop\StkFlo.lnk" >nul 2>&1
del /f /q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\StkFlo.lnk" >nul 2>&1

if not "%RUNNING_ON_SERVER%"=="1" (
  echo Removing the StkFlo hostname mapping...
  if exist "Configure-Hosts.ps1" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "Configure-Hosts.ps1" -Hostname "%TLS_HOSTNAME%" -Remove >nul 2>&1

  if defined CA_THUMBPRINT (
    echo Removing the StkFlo trusted-root certificate from this client...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p='Cert:\LocalMachine\Root\%CA_THUMBPRINT%'; if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}" >nul 2>&1
  )
)

echo Removing client registration...
reg delete "HKLM\SOFTWARE\StkFlo\Client" /f >nul 2>&1

echo.
echo ============================================================
echo   Client uninstall completed successfully
echo ============================================================
echo The shared CLIENT DEPLOYMENT folder has not been changed or deleted.
set "RESULT=0"
goto :finish

:cancelled
echo Client uninstall cancelled. Nothing was removed.
set "RESULT=0"

:finish
echo.
pause
exit /b %RESULT%

:stage_error
echo ERROR: Client package could not be staged locally.
pause
exit /b 1
