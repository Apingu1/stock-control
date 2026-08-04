@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Enable HTTPS
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist. Run INSTALL_WINDOWS.bat first.
  pause
  exit /b 1
)

set "TLS_HOSTNAME=%~1"
set "SERVER_IP=%~2"
set "QUIET=0"
if /I "%~3"=="--quiet" set "QUIET=1"

echo ============================================================
echo   Enable HTTPS for Stock Control
echo ============================================================
echo.
if not defined TLS_HOSTNAME (
  set /p "TLS_HOSTNAME=Internal hostname [stock-control.test]: "
  if not defined TLS_HOSTNAME set "TLS_HOSTNAME=stock-control.test"
)
if not defined SERVER_IP set /p "SERVER_IP=Server IPv4 address: "
if not defined SERVER_IP (
  echo ERROR: A server IP address is required.
  if "%QUIET%"=="0" pause
  exit /b 1
)

echo Generating or renewing the server certificate using the retained private CA...
docker run --rm -v "%CD%:/workspace" -w /workspace alpine:3.20 sh -c "apk add --no-cache openssl bash >/dev/null && bash ./scripts/generate_test_tls_cert.sh '!TLS_HOSTNAME!' '!SERVER_IP!'"
if errorlevel 1 (
  echo ERROR: TLS certificate generation failed.
  echo A mapped network drive may not be mountable by Docker.
  if "%QUIET%"=="0" pause
  exit /b 1
)

echo Starting the HTTPS application stack...
docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" --env-file ".env" up -d --build
if errorlevel 1 (
  echo ERROR: The HTTPS stack could not be started.
  if "%QUIET%"=="0" pause
  exit /b 1
)

set "APP_HTTPS_PORT=8443"
for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"APP_HTTPS_PORT=" ".env" 2^>nul') do set "APP_HTTPS_PORT=%%B"

echo Waiting for HTTPS...
for /L %%I in (1,1,90) do (
  curl.exe -kfsS "https://127.0.0.1:!APP_HTTPS_PORT!/api/health" >nul 2>&1
  if not errorlevel 1 goto :ready
  timeout /t 2 /nobreak >nul
)

echo ERROR: HTTPS did not become healthy.
if "%QUIET%"=="0" pause
exit /b 1

:ready
echo.
echo HTTPS is ready: https://!TLS_HOSTNAME!:!APP_HTTPS_PORT!
echo Public CA certificate: %CD%\infra\certs\stock-control-ca.crt
echo Private keys remain on the server in infra\certs.
if "%QUIET%"=="1" exit /b 0
echo.
echo Manual client setup requires:
echo   1. Import stock-control-ca.crt into Local Computer Trusted Root.
echo   2. Add !SERVER_IP! !TLS_HOSTNAME! to the client hosts file, or configure DNS.
start "" "https://!TLS_HOSTNAME!:!APP_HTTPS_PORT!"
pause
