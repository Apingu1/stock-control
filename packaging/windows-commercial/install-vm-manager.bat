@echo off
setlocal EnableExtensions
title StkFlo - Enable VM Manager
set "INSTALL_ROOT=%ProgramData%\StkFlo\Server"
if not exist "%INSTALL_ROOT%\windows\management\Install-Manager.ps1" (
 echo ERROR: Install StkFlo on this Windows VM first.
 pause
 exit /b 1
)
echo ============================================================
echo   StkFlo - VM Remote Management Setup
echo ============================================================
echo Run ONCE as Administrator, on the Windows VM that runs Docker.
echo The Docker user must be the account normally signed in when Docker runs.
echo.
set /p "DOCKER_USER=Docker Windows account (COMPUTER\username): "
set /p "ADMIN_USER=Windows account to authorise for remote management: "
set /p "ADMIN_SUBNET=Approved administrator subnet (e.g. 192.168.1.0/24): "
set /p "SHARE_ROOT=Approved backup UNC share root (e.g. \\fileserver\StkFloBackups): "
if not defined DOCKER_USER goto :failed
if not defined ADMIN_USER goto :failed
if not defined ADMIN_SUBNET goto :failed
if not defined SHARE_ROOT goto :failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_ROOT%\windows\management\Install-Manager.ps1" -Role VM -Hostname "stkflo-manager" -InstallRoot "%INSTALL_ROOT%" -DockerUser "%DOCKER_USER%" -AuthorisedWindowsAccount "%ADMIN_USER%" -AdminSubnet "%ADMIN_SUBNET%" -AllowedBackupShare "%SHARE_ROOT%"
if errorlevel 1 goto :failed
echo.
echo VM Manager configured. Add hostname/DNS and trust the PUBLIC manager certificate.
echo Open https://stkflo-manager:9444/ from an authorised admin computer.
pause
exit /b 0
:failed
echo ERROR: VM manager installation/configuration did not complete.
pause
exit /b 1
