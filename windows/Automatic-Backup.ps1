param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$RetentionDays = 30,
    [string]$Reason = 'Scheduled automatic backup'
)

$ErrorActionPreference = 'Stop'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$envPath = Join-Path $InstallRoot '.env'
$composePath = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
$backupDir = Join-Path $InstallRoot 'backups-production-test'
$logDir = Join-Path $InstallRoot 'logs'
$logPath = Join-Path $logDir 'backup.log'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ssK') $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
    Write-Host $line
}

function Read-DotEnv([string]$Path) {
    $result = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
            $result[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    return $result
}

$containerId = $null
$containerFile = $null
try {
    if (-not (Test-Path $envPath)) { throw '.env is missing.' }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running.' }

    $settings = Read-DotEnv $envPath
    $dbName = if ($settings['DB_NAME']) { $settings['DB_NAME'] } else { 'stock' }
    $dbUser = if ($settings['DB_USER']) { $settings['DB_USER'] } else { 'stock' }

    $containerOutput = & docker compose -f $composePath --env-file $envPath ps -q db
    $containerId = ([string]($containerOutput | Select-Object -First 1)).Trim()
    if (-not $containerId) { throw 'PostgreSQL container is not running.' }

    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $fileName = "stock-control-$stamp.dump"
    $containerFile = "/tmp/$fileName"
    $hostFile = Join-Path $backupDir $fileName

    Write-Log "Creating PostgreSQL custom-format backup: $fileName"
    & docker exec $containerId pg_dump -U $dbUser -d $dbName -Fc -f $containerFile
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }

    & docker cp "${containerId}:$containerFile" $hostFile
    if ($LASTEXITCODE -ne 0) { throw 'Docker could not copy the backup to the host.' }

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $hostFile).Hash
    $manifest = [ordered]@{
        created_at = (Get-Date).ToString('o')
        database = $dbName
        file = $fileName
        sha256 = $hash
        size_bytes = (Get-Item -LiteralPath $hostFile).Length
        reason = $Reason
        host = $env:COMPUTERNAME
        created_by = "$env:USERDOMAIN\$env:USERNAME"
    }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$hostFile.json" -Encoding utf8

    $cutoff = (Get-Date).AddDays(-1 * [math]::Abs($RetentionDays))
    Get-ChildItem -LiteralPath $backupDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff -and ($_.Extension -eq '.dump' -or $_.Name -like '*.dump.json') } |
        Remove-Item -Force -ErrorAction SilentlyContinue

    Write-Log "Backup completed: $hostFile (SHA256 $hash)"
    exit 0
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
} finally {
    if ($containerId -and $containerFile) {
        & docker exec $containerId rm -f $containerFile *> $null
    }
}
