@echo off
setlocal EnableExtensions EnableDelayedExpansion
title StkFlo - Hyper-V Host Manager
set "STAGED=0"
if /I "%~1"=="--staged" set "STAGED=1"
if "!STAGED!"=="0" (
  set "STAGE=%TEMP%\StkFlo-HostManager-%RANDOM%-%RANDOM%"
  mkdir "!STAGE!" >nul 2>&1
  robocopy "%~dp0." "!STAGE!" /E /R:2 /W:1 /NFL /NDL /NP >nul
  if !ERRORLEVEL! GEQ 8 goto :failed
  if not exist "!STAGE!\Install-Manager.ps1" goto :failed
  set "STAGE_PATH=!STAGE!"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath (Join-Path $env:STAGE_PATH '01 - INSTALL HOST MANAGER.bat') -ArgumentList '--staged' -WorkingDirectory $env:STAGE_PATH -Verb RunAs -Wait -PassThru; exit $p.ExitCode"
  set "RUN_RC=!ERRORLEVEL!"
  rmdir /s /q "!STAGE!" >nul 2>&1
  exit /b !RUN_RC!
)
net session >nul 2>&1
if errorlevel 1 (
 echo Administrator rights required.
 exit /b 1
)
echo ============================================================
echo   StkFlo - Hyper-V Host Manager Setup
echo ============================================================
echo Install on the PHYSICAL HYPER-V HOST, not inside the VM.
echo No Docker or StkFlo application installation is required on the host.
echo.
set /p "VM_NAME=Name of existing Hyper-V virtual machine (e.g. east-dev1): "
set /p "ADMIN_USER=Windows account to authorise for remote management: "
set /p "ADMIN_SUBNET=Approved administrator subnet (e.g. 192.168.1.0/24): "
if not defined VM_NAME goto :failed
if not defined ADMIN_USER goto :failed
if not defined ADMIN_SUBNET goto :failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Manager.ps1" -Role Host -Hostname "stkflo-host" -VmName "%VM_NAME%" -AuthorisedWindowsAccount "%ADMIN_USER%" -AdminSubnet "%ADMIN_SUBNET%"
if errorlevel 1 goto :failed
echo.
echo Hyper-V Host Manager configured.
echo Add hostname/DNS and trust the PUBLIC manager certificate.
echo Open https://stkflo-host:9443/ from an authorised admin computer.
pause
exit /b 0
:failed
echo ERROR: Host manager setup failed. Review messages and retry.
pause
exit /b 1
