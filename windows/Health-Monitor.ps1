param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$logDir = Join-Path $InstallRoot 'logs'
$logPath = Join-Path $logDir 'health-monitor.log'
$statusPath = Join-Path $logDir 'health-status.json'
$manualStopPath = Join-Path $InstallRoot 'deployment\manual-stop.flag'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ssK') $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
    Write-Host $line
}

function Read-DotEnv([string]$Path) {
    $result = @{}
    if (Test-Path $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
                $result[$matches[1].Trim()] = $matches[2].Trim().Trim('"')
            }
        }
    }
    return $result
}

function Ensure-Docker {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return $true }

    Write-Log 'Docker engine is unavailable. Attempting to start Docker Desktop.'
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe')
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($candidates.Count -gt 0) {
        Start-Process -FilePath $candidates[0] | Out-Null
    }

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 2
        docker info *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Log 'Docker engine recovered successfully.'
            return $true
        }
    }

    Write-Log 'ERROR: Docker engine did not become available.'
    return $false
}

$status = [ordered]@{
    checked_at = (Get-Date).ToString('o')
    controlled_stop = $false
    docker = $false
    containers = $false
    http = $false
    https = $false
    server_certificate_days_remaining = $null
    root_certificate_days_remaining = $null
    latest_backup_age_hours = $null
    backup_folder = $null
    backup_scheduler_result = $null
    free_disk_gb = $null
    healthy = $false
    errors = @()
}

try {
    if (Test-Path $manualStopPath) {
        $status.controlled_stop = $true
        $status.healthy = $true
        $status | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding utf8
        Write-Log 'Controlled stop flag is present. Automatic restart was intentionally suppressed.'
        exit 0
    }

    $envPath = Join-Path $InstallRoot '.env'
    if (-not (Test-Path $envPath)) { throw '.env is missing.' }
    $settings = Read-DotEnv $envPath
    $httpPort = if ($settings['APP_HTTP_PORT']) { $settings['APP_HTTP_PORT'] } else { '8088' }
    $httpsPort = if ($settings['APP_HTTPS_PORT']) { $settings['APP_HTTPS_PORT'] } else { '8443' }

    if (-not (Ensure-Docker)) { throw 'Docker could not be started.' }
    $status.docker = $true

    $base = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
    $tls = Join-Path $InstallRoot 'infra\docker-compose.production.tls.yml'
    $serverCert = Join-Path $InstallRoot 'infra\certs\stock-control.crt'
    $useTls = Test-Path $serverCert

    if ($useTls) {
        & docker compose -f $base -f $tls --env-file $envPath up -d 2>&1 | ForEach-Object { Write-Log ([string]$_) }
    } else {
        & docker compose -f $base --env-file $envPath up -d 2>&1 | ForEach-Object { Write-Log ([string]$_) }
    }
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose could not start the application.' }
    $status.containers = $true

    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$httpPort/api/health" -TimeoutSec 10
        $status.http = [bool]$health.ok
    } catch {
        $status.errors += "HTTP health failed: $($_.Exception.Message)"
    }

    if ($useTls) {
        & curl.exe -kfsS "https://127.0.0.1:$httpsPort/api/health" *> $null
        $status.https = $LASTEXITCODE -eq 0
        if (-not $status.https) { $status.errors += 'HTTPS health check failed.' }
    }

    foreach ($item in @(
        @{ Path = $serverCert; Key = 'server_certificate_days_remaining' },
        @{ Path = (Join-Path $InstallRoot 'infra\certs\stock-control-ca.crt'); Key = 'root_certificate_days_remaining' }
    )) {
        if (Test-Path $item.Path) {
            $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($item.Path)
            $status[$item.Key] = [math]::Floor(($cert.NotAfter.ToUniversalTime() - [datetime]::UtcNow).TotalDays)
        }
    }

    if ($settings['BACKUP_HOST_PATH']) {
        $backupDir = [Environment]::ExpandEnvironmentVariables($settings['BACKUP_HOST_PATH'])
        if (-not [System.IO.Path]::IsPathRooted($backupDir)) {
            $backupDir = Join-Path (Split-Path -Parent $base) $backupDir
        }
    } elseif (Test-Path -LiteralPath (Join-Path $InstallRoot 'backups-production-test')) {
        $backupDir = Join-Path $InstallRoot 'backups-production-test'
    } else {
        $backupDir = Join-Path $InstallRoot 'Backups'
    }
    $status.backup_folder = $backupDir
    $latestBackup = Get-ChildItem -LiteralPath $backupDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in '.dump', '.backup', '.sql' } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if ($latestBackup) {
        $status.latest_backup_age_hours = [math]::Round(((Get-Date).ToUniversalTime() - $latestBackup.LastWriteTimeUtc).TotalHours, 1)
    }
    $schedulerStatusPath = Join-Path $InstallRoot 'runtime-state\backup_scheduler_status.json'
    if (Test-Path -LiteralPath $schedulerStatusPath) {
        try {
            $schedulerStatus = Get-Content -LiteralPath $schedulerStatusPath -Raw | ConvertFrom-Json
            $status.backup_scheduler_result = $schedulerStatus.last_result
            if ($schedulerStatus.last_result -in @('FAILED', 'SCHEDULER_ERROR')) {
                $status.errors += "Automatic backup scheduler reported: $($schedulerStatus.last_error)"
            }
        } catch {
            $status.errors += 'Automatic backup scheduler status could not be read.'
        }
    }

    # Measure the drive that must accept the next backup. When an approved
    # external drive is configured this is more useful than the application
    # installation drive.
    $rootName = [System.IO.Path]::GetPathRoot($backupDir).TrimEnd(':\')
    $drive = Get-PSDrive -Name $rootName -ErrorAction SilentlyContinue
    if ($drive) { $status.free_disk_gb = [math]::Round($drive.Free / 1GB, 2) }

    $status.healthy = $status.docker -and $status.containers -and $status.http -and ((-not $useTls) -or $status.https)
    if ($status.server_certificate_days_remaining -ne $null -and $status.server_certificate_days_remaining -lt 30) {
        $status.errors += 'Server certificate has fewer than 30 days remaining.'
    }
    if ($status.root_certificate_days_remaining -ne $null -and $status.root_certificate_days_remaining -lt 1825) {
        $status.errors += 'Private CA has fewer than five years remaining; controlled rollover planning is required.'
    }
    if ($status.free_disk_gb -ne $null -and $status.free_disk_gb -lt 5) {
        $status.errors += 'Backup destination has fewer than 5 GB free.'
    }
    if ($status.latest_backup_age_hours -ne $null -and $status.latest_backup_age_hours -gt 48) {
        $status.errors += 'Latest database backup is older than 48 hours.'
    }

    $status | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding utf8
    Write-Log "Health check completed. healthy=$($status.healthy) http=$($status.http) https=$($status.https)"
    exit $(if ($status.healthy) { 0 } else { 1 })
} catch {
    $status.errors += $_.Exception.Message
    $status | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding utf8
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
