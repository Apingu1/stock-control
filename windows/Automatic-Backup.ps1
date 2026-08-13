param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$RetentionDays = 30,
    [string]$Reason = 'Manual Windows administrator backup',
    [ValidateSet('AUTO', 'MANUAL', 'PRE_RESTORE', 'INITIAL')]
    [string]$BackupType = 'MANUAL'
)

$ErrorActionPreference = 'Stop'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$envPath = Join-Path $InstallRoot '.env'
$composePath = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
$logDir = Join-Path $InstallRoot 'logs'
$logPath = Join-Path $logDir 'backup.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ssK') $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
    Write-Host $line
}

try {
    if (-not (Test-Path -LiteralPath $envPath)) { throw '.env is missing.' }
    if (-not (Test-Path -LiteralPath $composePath)) { throw 'Production Docker Compose file is missing.' }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running.' }

    $actor = "$env:USERDOMAIN\$env:USERNAME"
    Write-Log "Requesting $BackupType backup through the shared Stock Control backup engine."
    & docker compose -f $composePath --env-file $envPath exec -T api `
        python -m app.backup_cli --type $BackupType --actor $actor --reason $Reason
    if ($LASTEXITCODE -ne 0) { throw 'The shared backup engine reported a failure.' }

    # RetentionDays remains accepted for backward-compatible administrator
    # scripts. Automatic retention is controlled centrally in Backup Settings.
    Write-Log "Backup completed successfully. Reason: $Reason"
    exit 0
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
