@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Eaststone Stock Control - Enable HTTPS
cd /d "%~dp0"

if not exist ".env" (
  echo ERROR: .env does not exist. Run INSTALL_WINDOWS.bat first.
  pause
  exit /b 1
)

echo ============================================================
echo   Enable HTTPS for PWA installation testing
echo ============================================================
echo.
set /p "TLS_HOSTNAME=Internal hostname [stock-control.test]: "
if not defined TLS_HOSTNAME set "TLS_HOSTNAME=stock-control.test"
set /p "SERVER_IP=Server IPv4 address: "
if not defined SERVER_IP (
  echo ERROR: A server IP address is required.
  pause
  exit /b 1
)

echo.
echo Generating the private test CA and server certificate...
docker run --rm -v "%CD%:/workspace" -w /workspace alpine:3.20 sh -c "apk add --no-cache openssl bash >/dev/null && bash ./scripts/generate_test_tls_cert.sh '!TLS_HOSTNAME!' '!SERVER_IP!'"
if errorlevel 1 (
  echo ERROR: TLS certificate generation failed.
  echo A mapped network drive may not be mountable by Docker.
  pause
  exit /b 1
)

echo Starting the HTTPS production-test stack...
docker compose -f "infra\docker-compose.production.yml" -f "infra\docker-compose.production.tls.yml" --env-file ".env" up -d --build
if errorlevel 1 (
  echo ERROR: The HTTPS stack could not be started.
  pause
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
pause
exit /b 1

:ready
echo.
echo HTTPS is ready:
echo   https://!TLS_HOSTNAME!:!APP_HTTPS_PORT!
echo.
echo Copy this certificate to each test computer:
echo   %CD%\infra\certs\stock-control-ca.crt
echo.
echo Add this hosts-file entry on each test PC:
echo   !SERVER_IP! !TLS_HOSTNAME!
echo.
echo Import stock-control-ca.crt into the Local Computer Trusted Root
echo Certification Authorities store before opening Chrome.
start "" "https://!TLS_HOSTNAME!:!APP_HTTPS_PORT!"
pause
