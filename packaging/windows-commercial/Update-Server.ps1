<#
.SYNOPSIS
  In-place StkFlo Windows server update (commercial release).
.DESCRIPTION
  Existing installations only. Creates a verified pre-update application
  database backup, saves a rollback snapshot of source files, copies code
  without deleting server state, rebuilds images and restarts services.
  No fresh setup, credential rotation, certificate replacement, Docker volume
  removal or uninstall commands are executed.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$PayloadRoot,
    [string]$InstallRoot = (Join-Path $env:ProgramData 'StkFlo\Server')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-NativeSuccess {
    param([string]$Activity)
    if ($LASTEXITCODE -ne 0) {
        throw "$Activity failed (exit code $LASTEXITCODE)."
    }
}

function Copy-CodeDirectory {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        throw "Required source directory is missing: $Source"
    }
    New-Item -Path $Destination -ItemType Directory -Force | Out-Null
    # /E copies new source without deleting files already on the VM.
    # /XD and /XF ensure local credentials, certs, runtime state and build
    # artefacts are not overwritten or copied into rollback snapshots.
    & robocopy.exe $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NP /XD certs node_modules dist __pycache__ .pytest_cache runtime-state deployment backups Backups client-deployment /XF .env
    if ($LASTEXITCODE -ge 8) {
        throw "File copy failed: $Source (robocopy exit $LASTEXITCODE)."
    }
}

function Get-ConfigValue {
    param([string]$File, [string]$Name, [string]$Default)
    $line = Get-Content -LiteralPath $File | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -Last 1
    if ($null -eq $line) { return $Default }
    $value = ($line -split '=', 2)[1].Trim().Trim('"')
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value
}

# Open an update transcript BEFORE validating permissions, Docker or the
# existing install; preflight failures must be recorded and explained.
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$logDir = Join-Path $InstallRoot 'deployment\update-history'
New-Item -Path $logDir -ItemType Directory -Force | Out-Null
$logPath = Join-Path $logDir ("update-" + $stamp + ".log")
Start-Transcript -LiteralPath $logPath -Force | Out-Null

try {
    Write-Host 'Pre-update checks are running in the elevated CMD session.'
    Write-Host "Diagnostic log: $logPath"
    $admin = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'StkFlo server updates require administrator approval.'
    }
    $PayloadRoot = (Resolve-Path -LiteralPath $PayloadRoot).Path
    if (-not (Test-Path -LiteralPath $InstallRoot -PathType Container)) {
        throw 'StkFlo is not installed in the expected location. Use the server installer for a new installation.'
    }
    $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
    $envPath = Join-Path $InstallRoot '.env'
    $composePath = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
    $payloadCompose = Join-Path $PayloadRoot 'infra\docker-compose.production.yml'
    $backupScript = Join-Path $InstallRoot 'windows\Automatic-Backup.ps1'
    foreach ($file in @($envPath, $composePath, $backupScript, $payloadCompose)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
            throw "Update blocked; missing installed or release file: $file"
        }
    }
    & docker.exe info *> $null
    Assert-NativeSuccess 'Docker engine availability'
    $baseArgs = @('compose', '-f', $composePath, '--env-file', $envPath)

    # IMPORTANT: Do not pipe docker.exe into Select-Object -First.
    # On Windows PowerShell, early pipeline termination can close the native
    # process output stream and report exit code -1 even when Docker is healthy.
    # Collect the COMPLETE process output and inspect it only after exit.
    Write-Host 'Verifying the existing StkFlo PostgreSQL container (read-only)...'
    $dbContainerLines = @(& docker.exe @baseArgs ps --status running -q db)
    $dbLookupExit = $LASTEXITCODE

    if ($dbLookupExit -ne 0) {
        Write-Host "Docker Compose database lookup failed with exit code $dbLookupExit."
        Write-Host 'Read-only Docker diagnostics follow (no containers will be changed):'
        & docker.exe context show
        & docker.exe @baseArgs ps db
        throw "Existing database lookup failed (exit code $dbLookupExit). Review Docker diagnostics above."
    }
    $dbContainer = @($dbContainerLines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($dbContainer.Count -eq 0) {
        Write-Host 'Compose did not return a running database container.'
        & docker.exe @baseArgs ps -a db
        throw 'No running StkFlo PostgreSQL container was found in the existing Docker Compose project. Update cancelled to protect data.'
    }
    Write-Host "Existing database container confirmed: $($dbContainer[0])"

    Write-Host '===== STKFLO IN-PLACE UPDATE ====='
    Write-Host "Existing installation: $InstallRoot"
    Write-Host 'Preserving: PostgreSQL volume, .env, TLS certificate/keys, runtime-state, backup settings and client-deployment.'
    Write-Host 'Creating mandatory pre-update database backup...'

    # Use the existing validated commercial backup engine and the administrator's
    # configured backup destination. Never continue if backup creation fails.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backupScript -InstallRoot $InstallRoot -BackupType MANUAL -Reason ("Pre-update StkFlo " + $stamp)
    Assert-NativeSuccess 'Pre-update database backup'
    Write-Host 'Database backup verified by StkFlo backup engine.'

    $rollback = Join-Path $InstallRoot ("deployment\update-source-rollback\" + $stamp)
    New-Item -Path $rollback -ItemType Directory -Force | Out-Null

    $directories = @('api', 'db', 'infra', 'scripts', 'web', 'windows')
    Write-Host 'Saving previous installed source files for manual rollback...'
    foreach ($dir in $directories) {
        $prior = Join-Path $InstallRoot $dir
        if (Test-Path -LiteralPath $prior -PathType Container) {
            Copy-CodeDirectory -Source $prior -Destination (Join-Path $rollback $dir)
        }
    }
    Write-Host "Source rollback snapshot: $rollback"

    Write-Host 'Updating application source without deleting local data...'
    foreach ($dir in $directories) {
        Copy-CodeDirectory -Source (Join-Path $PayloadRoot $dir) -Destination (Join-Path $InstallRoot $dir)
    }

    # Update maintenance controls, but do NOT rerun installer or reset-admin.
    foreach ($name in @(
        'INSTALL_WINDOWS.bat', 'ENABLE_HTTPS_WINDOWS.bat',
        'START_WINDOWS.bat', 'STOP_WINDOWS.bat',
        'STATUS_WINDOWS.bat', 'ESC_BACKUP_SETTINGS_WINDOWS.bat',
        'ESC_BACKUP_RESTORE_WINDOWS.bat',
        'RESET_ADMIN_PASSWORD_WINDOWS.bat', 'ESC_SERVER_SETUP_WINDOWS.bat'
    )) {
        $file = Join-Path $PayloadRoot $name
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            Copy-Item -LiteralPath $file -Destination (Join-Path $InstallRoot $name) -Force
        }
    }

    $args = @('compose', '-f', $composePath)
    $cert = Join-Path $InstallRoot 'infra\certs\stock-control.crt'
    $tlsCompose = Join-Path $InstallRoot 'infra\docker-compose.production.tls.yml'
    $useTls = (Test-Path -LiteralPath $cert -PathType Leaf)
    if ($useTls) {
        if (-not (Test-Path -LiteralPath $tlsCompose -PathType Leaf)) {
            throw 'Existing HTTPS certificate found but the TLS Compose overlay is missing.'
        }
        $args += @('-f', $tlsCompose)
    }
    $args += @('--env-file', $envPath)

    Write-Host 'Validating the updated Docker configuration...'
    & docker.exe @args config --quiet
    Assert-NativeSuccess 'Docker Compose configuration'

    Write-Host 'Building updated API and frontend images...'
    & docker.exe @args build api web
    Assert-NativeSuccess 'Docker image build'

    Write-Host 'Recreating only the required application services (no down, no volume removal)...'
    & docker.exe @args up -d --no-build
    Assert-NativeSuccess 'Docker Compose startup'

    $port = if ($useTls) {
        Get-ConfigValue -File $envPath -Name 'APP_HTTPS_PORT' -Default '443'
    } else {
        Get-ConfigValue -File $envPath -Name 'APP_HTTP_PORT' -Default '8088'
    }
    $url = if ($useTls) { "https://127.0.0.1:$port/api/health" } else { "http://127.0.0.1:$port/api/health" }
    $healthy = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & curl.exe -k -f -s -S --max-time 4 $url *> $null
        if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $healthy) { throw "Updated application health check did not pass: $url" }

    Write-Host 'SUCCESS: StkFlo updated without uninstalling or resetting records.'
    Write-Host "Database backup: existing configured StkFlo Backups location."
    Write-Host "Source rollback snapshot: $rollback"
    Write-Host "Update log: $logPath"
    exit 0
}
catch {
    Write-Host "UPDATE FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Existing database volume, .env and certificates have NOT been deleted.'
    Write-Host "Review the log at $logPath and the pre-update backup before retrying."
    exit 1
}
finally {
    Stop-Transcript | Out-Null
}
