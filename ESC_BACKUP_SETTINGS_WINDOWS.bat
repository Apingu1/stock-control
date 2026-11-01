@echo off
setlocal EnableExtensions
title StkFlo - Backup & Replication Settings
echo The approved backup workflow creates verified PostgreSQL dumps locally
echo and copies them to your cloud-backed network share.
echo.
echo Open the VM Manager from an authorised computer to configure the UNC
echo network destination. Automatic backup time and retention are configured
echo in StkFlo ^> Administration ^> Database Backup ^& Recovery.
echo.
start "" "https://stkflo-manager:9444/"
pause
exit /b 0
