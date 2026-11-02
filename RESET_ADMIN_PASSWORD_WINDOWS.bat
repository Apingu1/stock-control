@echo off
setlocal EnableExtensions DisableDelayedExpansion
title StkFlo - Administrator Credential Setup / Recovery
cd /d "%~dp0"

rem The commercial first-installation workflow calls --initial-setup only.
rem This deliberately provisions only a new account or the known database
rem placeholder. NEVER force-reset an established administrator on reinstall.
rem Manual recovery (without --initial-setup) remains a deliberate force reset.
set "INITIAL_SETUP=0"
if /I "%~1"=="--initial-setup" set "INITIAL_SETUP=1"
if not exist ".env" goto :failed
docker info >nul 2>&1
if errorlevel 1 goto :failed

set "RESET_PASS="
if "%INITIAL_SETUP%"=="1" goto :fresh_initial
echo Generating a unique one-time administrator recovery password...
for /f "delims=" %%S in ('docker run --rm python:3.11-alpine python -c "import secrets; print(secrets.token_hex(18))"') do set "RESET_PASS=%%S"
if not defined RESET_PASS goto :failed
goto :bootstrap

:fresh_initial
rem DelayedExpansion is DISABLED so the exclamation mark is preserved exactly.
set "RESET_PASS=Admin123!"
echo Provisioning temporary administrator credentials for a fresh StkFlo installation...

:bootstrap
set "BOOTSTRAP_LOG=%TEMP%\stkflo-admin-%RANDOM%-%RANDOM%.log"
if "%INITIAL_SETUP%"=="1" goto :initial_bootstrap
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" exec -T -e "BOOTSTRAP_ADMIN_FORCE_RESET=1" -e "BOOTSTRAP_ADMIN_PASSWORD=%RESET_PASS%" api python -m app.bootstrap_admin > "%BOOTSTRAP_LOG%" 2>&1
set "BOOTSTRAP_RC=%ERRORLEVEL%"
goto :inspect_bootstrap

:initial_bootstrap
docker compose -f "infra\docker-compose.production.yml" --env-file ".env" exec -T -e "BOOTSTRAP_ADMIN_PASSWORD=%RESET_PASS%" api python -m app.bootstrap_admin > "%BOOTSTRAP_LOG%" 2>&1
set "BOOTSTRAP_RC=%ERRORLEVEL%"

:inspect_bootstrap
type "%BOOTSTRAP_LOG%"
if not "%BOOTSTRAP_RC%"=="0" goto :failed_cleanup
if "%INITIAL_SETUP%"=="1" goto :check_initial
findstr /L /C:"Bootstrap administrator 'admin': RESET." "%BOOTSTRAP_LOG%" >nul 2>&1
if errorlevel 1 goto :failed_cleanup
goto :verified_bootstrap

:check_initial
findstr /L /C:"Bootstrap administrator 'admin': CREATED." "%BOOTSTRAP_LOG%" >nul 2>&1
if not errorlevel 1 goto :verified_bootstrap
findstr /L /C:"Bootstrap administrator 'admin': INITIALISED_SCHEMA_SEED." "%BOOTSTRAP_LOG%" >nul 2>&1
if not errorlevel 1 goto :verified_bootstrap
echo ERROR: An existing administrator was found. Its password was NOT reset.
echo First-install credentials are only set for a new database.
goto :failed_cleanup

:verified_bootstrap
del /f /q "%BOOTSTRAP_LOG%" >nul 2>&1
set "BOOTSTRAP_LOG="
set "LOGIN_JSON=%TEMP%\stkflo-admin-verify-%RANDOM%-%RANDOM%.json"
> "%LOGIN_JSON%" echo {"username":"admin","password":"%RESET_PASS%"}
curl.exe -fsS -X POST -H "Content-Type: application/json" --data-binary "@%LOGIN_JSON%" "http://127.0.0.1:8088/api/auth/login/" >nul 2>&1
set "TEST_RC=%ERRORLEVEL%"
del /f /q "%LOGIN_JSON%" >nul 2>&1
if not "%TEST_RC%"=="0" goto :failed
if not exist "deployment" mkdir "deployment"
> "deployment\admin-bootstrap-complete.flag" echo Verified administrator provisioning at %DATE% %TIME%
if errorlevel 1 goto :failed

if "%INITIAL_SETUP%"=="1" goto :initial_success
echo ============================================================
echo   StkFlo administrator recovery verified
echo ============================================================
echo Username: admin
echo ONE-TIME RECOVERY PASSWORD: %RESET_PASS%
echo Record securely and change immediately at first login.
pause
exit /b 0

:initial_success
echo Fresh-install administrator account was provisioned and login verified.
echo Login details will appear in the ORIGINAL network installer window
echo after HTTPS setup and client deployment publication are complete.
exit /b 0

:failed_cleanup
if defined BOOTSTRAP_LOG del /f /q "%BOOTSTRAP_LOG%" >nul 2>&1
:failed
echo ERROR: Administrator provisioning or verification did not complete.
if "%INITIAL_SETUP%"=="0" pause
exit /b 1
