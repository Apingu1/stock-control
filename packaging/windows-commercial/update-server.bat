@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Update Existing Server (Preserve Data)
set "PACKAGE_ROOT=%~dp0"
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"

if not exist "%INSTALL_ROOT%\.env" (
  echo ERROR: No existing StkFlo installation was found at:
  echo   %INSTALL_ROOT%
  echo This updater will NOT perform a fresh install.
  pause
  exit /b 1
)
if not exist "%PACKAGE_ROOT%System\infra\docker-compose.production.yml" (
  echo ERROR: This release package does not contain the server application.
  pause
  exit /b 1
)
if not exist "%PACKAGE_ROOT%Support\Update-Server.ps1" (
  echo ERROR: The server update engine is missing from Support.
  pause
  exit /b 1
)

set "STAGE=%TEMP%\StkFlo-Update-%RANDOM%-%RANDOM%"
mkdir "!STAGE!\System" || goto :staging_failed
mkdir "!STAGE!\Support" || goto :staging_failed
echo Staging update files locally before administrator elevation...
robocopy "%PACKAGE_ROOT%System" "!STAGE!\System" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP
if !ERRORLEVEL! GEQ 8 goto :staging_failed
copy /Y "%PACKAGE_ROOT%Support\Update-Server.ps1" "!STAGE!\Support\Update-Server.ps1" >nul
if errorlevel 1 goto :staging_failed
set "STAGE_PATH=!STAGE!"

echo.
echo ============================================================
echo    STKFLO SERVER UPDATE - EXISTING DATA WILL BE RETAINED
echo ============================================================
echo The update requires a verified pre-update database backup.
echo No uninstall, database reset, or Docker volume deletion is run.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$script=Join-Path $env:STAGE_PATH 'Support\Update-Server.ps1'; $payload=Join-Path $env:STAGE_PATH 'System'; $args='-NoProfile -ExecutionPolicy Bypass -File "'+$script+'" -PayloadRoot "'+$payload+'"'; $p=Start-Process -FilePath 'powershell.exe' -ArgumentList $args -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
set "UPDATE_RC=!ERRORLEVEL!"
if not "!UPDATE_RC!"=="0" (
  echo.
  echo ERROR: Update failed. Your database has NOT been intentionally reset.
  echo Staged update files remain at !STAGE! for troubleshooting.
  pause
  exit /b !UPDATE_RC!
)

rmdir /s /q "!STAGE!" >nul 2>&1
echo.
echo StkFlo server update completed. Existing data and settings were retained.
pause
exit /b 0

:staging_failed
echo ERROR: Could not stage the release locally. No installed files were changed.
echo Staging path: !STAGE!
pause
exit /b 1
