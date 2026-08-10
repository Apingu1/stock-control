param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $RepositoryRoot 'dist' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$packageBuilder = Join-Path $PSScriptRoot 'Self-Extracting-Package.ps1'
if (-not (Test-Path -LiteralPath $packageBuilder)) {
    throw "Windows package builder is missing: $packageBuilder"
}
. $packageBuilder

$work = Join-Path $env:TEMP "eaststone-build-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $work -Force | Out-Null
try {
    $payloadZip = Join-Path $work 'server-payload.zip'
    $payloadItems = @(
        'api', 'db', 'infra', 'scripts', 'web', 'windows', 'docs',
        '.env.example', 'INSTALL_WINDOWS.bat', 'ENABLE_HTTPS_WINDOWS.bat',
        'START_WINDOWS.bat', 'STOP_WINDOWS.bat', 'STATUS_WINDOWS.bat',
        'RESET_ADMIN_PASSWORD_WINDOWS.bat', 'UNINSTALL_WINDOWS.bat',
        'ESC_SERVER_SETUP_WINDOWS.bat', 'ESC_CLIENT_SETUP_WINDOWS.bat',
        'ESC_BACKUP_RESTORE_WINDOWS.bat', 'PRODUCTION_TEST_DEPLOYMENT.md'
    ) | ForEach-Object { Join-Path $RepositoryRoot $_ } | Where-Object { Test-Path $_ }
    Compress-Archive -Path $payloadItems -DestinationPath $payloadZip -CompressionLevel Optimal -Force

    $serverLauncher = Join-Path $work 'server-setup-launcher.cmd'
    @'
@echo off
setlocal EnableExtensions
set "STAGED=0"
if /I "%~1"=="--staged" set "STAGED=1"

net session >nul 2>&1
if errorlevel 1 (
  set "STAGE=%TEMP%\EaststoneStockControlServerSetup-%RANDOM%-%RANDOM%"
  mkdir "%STAGE%" >nul 2>&1
  copy /Y "%~f0" "%STAGE%\server-setup-launcher.cmd" >nul
  copy /Y "%~dp0server-payload.zip" "%STAGE%\server-payload.zip" >nul
  if not exist "%STAGE%\server-payload.zip" (
    echo ERROR: The installer payload could not be staged before administrator elevation.
    pause
    exit /b 1
  )
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%STAGE%\server-setup-launcher.cmd' -ArgumentList '--staged' -Verb RunAs -WorkingDirectory '%STAGE%'"
  exit /b
)

set "INSTALL_DIR=%ProgramData%\Eaststone\StockControl"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0server-payload.zip' -DestinationPath '%INSTALL_DIR%' -Force"
if errorlevel 1 (
  echo ERROR: The server payload could not be extracted to %INSTALL_DIR%.
  pause
  exit /b 1
)
cd /d "%INSTALL_DIR%"
call "ESC_SERVER_SETUP_WINDOWS.bat"
set "RESULT=%ERRORLEVEL%"

if "%STAGED%"=="1" (
  set "STAGE_DIR=%~dp0"
  set "CLEANUP=%TEMP%\eaststone-server-stage-cleanup-%RANDOM%.cmd"
  >"%CLEANUP%" echo @echo off
  >>"%CLEANUP%" echo timeout /t 3 /nobreak ^>nul
  >>"%CLEANUP%" echo rmdir /s /q "%STAGE_DIR%"
  >>"%CLEANUP%" echo del /f /q "%%~f0"
  start "" /min cmd.exe /c ""%CLEANUP%""
)
exit /b %RESULT%
'@ | Set-Content -LiteralPath $serverLauncher -Encoding ascii

    New-EaststoneSelfExtractingPackage `
        -Name 'ESC Server Setup' `
        -SourceDirectory $work `
        -Files @('server-setup-launcher.cmd', 'server-payload.zip') `
        -Launcher 'server-setup-launcher.cmd' `
        -OutputPath (Join-Path $OutputDirectory 'ESC Server Setup.exe')

    $uninstallLauncher = Join-Path $work 'uninstall-launcher.cmd'
    @'
@echo off
setlocal EnableExtensions
set "INSTALL_DIR="
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Eaststone\StockControl" /v InstallPath 2^>nul ^| find /I "InstallPath"') do set "INSTALL_DIR=%%B"
if not defined INSTALL_DIR set "INSTALL_DIR=%ProgramData%\Eaststone\StockControl"
if not exist "%INSTALL_DIR%\UNINSTALL_WINDOWS.bat" (
  echo ERROR: Stock Control installation was not found at %INSTALL_DIR%.
  pause
  exit /b 1
)

net session >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%INSTALL_DIR%\UNINSTALL_WINDOWS.bat' -Verb RunAs -WorkingDirectory '%INSTALL_DIR%'"
  exit /b
)
cd /d "%INSTALL_DIR%"
call "UNINSTALL_WINDOWS.bat"
exit /b %ERRORLEVEL%
'@ | Set-Content -LiteralPath $uninstallLauncher -Encoding ascii

    New-EaststoneSelfExtractingPackage `
        -Name 'ESC Uninstall' `
        -SourceDirectory $work `
        -Files @('uninstall-launcher.cmd') `
        -Launcher 'uninstall-launcher.cmd' `
        -OutputPath (Join-Path $OutputDirectory 'ESC Uninstall.exe')

    $backupLauncher = Join-Path $work 'backup-tool-launcher.cmd'
    @'
@echo off
setlocal EnableExtensions
set "INSTALL_DIR="
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Eaststone\StockControl" /v InstallPath 2^>nul ^| find /I "InstallPath"') do set "INSTALL_DIR=%%B"
if not defined INSTALL_DIR set "INSTALL_DIR=%ProgramData%\Eaststone\StockControl"
if not exist "%INSTALL_DIR%\ESC_BACKUP_RESTORE_WINDOWS.bat" (
  echo ERROR: Stock Control installation was not found.
  pause
  exit /b 1
)
call "%INSTALL_DIR%\ESC_BACKUP_RESTORE_WINDOWS.bat"
exit /b %ERRORLEVEL%
'@ | Set-Content -LiteralPath $backupLauncher -Encoding ascii

    New-EaststoneSelfExtractingPackage `
        -Name 'ESC Backup and Restore Tool' `
        -SourceDirectory $work `
        -Files @('backup-tool-launcher.cmd') `
        -Launcher 'backup-tool-launcher.cmd' `
        -OutputPath (Join-Path $OutputDirectory 'ESC Backup and Restore Tool.exe')

    Write-Host ''
    Write-Host 'Created:'
    Get-ChildItem -LiteralPath $OutputDirectory -Filter 'ESC *.exe' | Select-Object Name, Length | Format-Table -AutoSize
    Write-Host 'ESC Client Setup.exe is generated by ESC Server Setup after the customer certificate and IP are known.'
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
