@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Update Existing Server (Preserve Data)

rem Match the existing StkFlo CMD-based installer: PowerShell only requests UAC.
rem The elevated administrative workflow runs from a visible staged CMD window.
set "PACKAGE_ROOT=%~dp0"
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
if /I "%~1"=="--staged" goto :elevated_update

if not exist "%INSTALL_ROOT%\.env" (
  echo ERROR: No existing StkFlo installation was found:
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
copy /Y "%~f0" "!STAGE!\06 - UPDATE SERVER.bat" >nul
if errorlevel 1 goto :staging_failed
set "STAGE_PATH=!STAGE!"

echo.
echo ============================================================
echo    STKFLO SERVER UPDATE - EXISTING DATA WILL BE RETAINED
echo ============================================================
echo Mandatory pre-update backup; no uninstall or volume deletion.
echo Opening administrator CMD window to run the update...
echo.
rem Exactly like 01 - INSTALL SERVER.bat: elevate another BAT, not the PS1.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $p=Start-Process -FilePath (Join-Path $env:STAGE_PATH '06 - UPDATE SERVER.bat') -ArgumentList '--staged' -WorkingDirectory $env:STAGE_PATH -Verb RunAs -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { Write-Host ('ERROR requesting administrator access: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"
set "UPDATE_RC=!ERRORLEVEL!"
if not "!UPDATE_RC!"=="0" (
  echo.
  echo ERROR: StkFlo update did not complete. Original database was NOT intentionally reset.
  echo Staged files: !STAGE!
  echo Detailed update log, if generated:
  echo   %INSTALL_ROOT%\deployment\update-history
  pause
  exit /b !UPDATE_RC!
)

rmdir /s /q "!STAGE!" >nul 2>&1
echo.
echo SUCCESS: StkFlo server updated. Existing data and settings retained.
pause
exit /b 0

:elevated_update
echo.
echo ============================================================
echo      STKFLO UPDATE - ADMINISTRATOR CMD WINDOW
echo ============================================================
echo Existing installation: %INSTALL_ROOT%
echo.
if not exist "%INSTALL_ROOT%\.env" (
  echo ERROR: Existing server configuration missing. No update attempted.
  goto :elevated_failed
)
if not exist "%PACKAGE_ROOT%Support\Update-Server.ps1" (
  echo ERROR: Staged update engine is missing. No update attempted.
  goto :elevated_failed
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PACKAGE_ROOT%Support\Update-Server.ps1" -PayloadRoot "%PACKAGE_ROOT%System" -InstallRoot "%INSTALL_ROOT%"
set "WORK_RC=!ERRORLEVEL!"
if not "!WORK_RC!"=="0" (
  echo.
  echo ERROR: The updater returned exit code !WORK_RC!.
  echo The error should be visible above and recorded in update-history.
  echo Keeping this administrator CMD window open for diagnosis.
  pause
  exit /b !WORK_RC!
)
echo.
echo SUCCESS: Updated application passed the health check.
exit /b 0

:elevated_failed
echo No installed files were changed by this stage.
pause
exit /b 1

:staging_failed
echo ERROR: Could not stage the release locally. No installed files were changed.
echo Staging path: !STAGE!
pause
exit /b 1
