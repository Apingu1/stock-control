@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Reset Administrator Password
cd /d "%~dp0"
if not exist ".env" goto :failed
docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not running.
  goto :failed
)
echo Creating a unique one-time administrator recovery password...
set "RESET_PASS="
for /f "delims=" %%S in ('docker run --rm python:3.11-alpine python -c "import secrets; print(secrets.token_hex(18))"') do set "RESET_PASS=%%S"
if not defined RESET_PASS goto :failed
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" exec -T -e BOOTSTRAP_ADMIN_FORCE_RESET=1 -e BOOTSTRAP_ADMIN_PASSWORD=!RESET_PASS! api python -m app.bootstrap_admin
if errorlevel 1 goto :failed
set "LOGIN_JSON=%TEMP%\stkflo-recovery-%RANDOM%.json"
> "!LOGIN_JSON!" echo {"username":"admin","password":"!RESET_PASS!"}
curl.exe -fsS -X POST -H "Content-Type: application/json" --data-binary "@!LOGIN_JSON!" "http://127.0.0.1:8088/api/auth/login/" >nul 2>&1
set "TEST_RC=!ERRORLEVEL!"
del /f /q "!LOGIN_JSON!" >nul 2>&1
if not "!TEST_RC!"=="0" goto :failed
rem A verified recovery also completes the installer authentication checkpoint.
rem Prevent the subsequent server setup run from generating a new password.
if not exist "deployment" mkdir "deployment"
> "deployment\admin-bootstrap-complete.flag" echo Administrator recovery verified at %DATE% %TIME%
if errorlevel 1 goto :failed
echo ============================================================
echo   StkFlo administrator recovery verified
echo ============================================================
echo Username: admin
echo ONE-TIME RECOVERY PASSWORD: !RESET_PASS!
echo Record securely and change immediately at first login.
pause
exit /b 0
:failed
echo ERROR: Administrator recovery did not complete.
pause
exit /b 1
