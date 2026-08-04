param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$envPath = Join-Path $InstallRoot '.env'
$baseCompose = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
$tlsCompose = Join-Path $InstallRoot 'infra\docker-compose.production.tls.yml'
$backupDir = Join-Path $InstallRoot 'backups-production-test'
$logDir = Join-Path $InstallRoot 'logs'
$logPath = Join-Path $logDir 'backup-restore-tool.log'
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

function Get-ComposeArgs {
    if (Test-Path (Join-Path $InstallRoot 'infra\certs\stock-control.crt')) {
        return @('compose', '-f', $baseCompose, '-f', $tlsCompose, '--env-file', $envPath)
    }
    return @('compose', '-f', $baseCompose, '--env-file', $envPath)
}

function Invoke-Backup([string]$Reason) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'windows\Automatic-Backup.ps1') -InstallRoot $InstallRoot -Reason $Reason
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Review logs\backup.log.' }
}

function Select-BackupFile {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.InitialDirectory = $backupDir
    $dialog.Filter = 'Stock Control backup (*.dump)|*.dump|All files (*.*)|*.*'
    $dialog.Title = 'Select Stock Control database backup to restore'
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dialog.FileName
    }
    return $null
}

function Restore-Backup([string]$BackupFile) {
    $BackupFile = (Resolve-Path -LiteralPath $BackupFile).Path
    $manifestPath = "$BackupFile.json"
    if (Test-Path $manifestPath) {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $BackupFile).Hash
        if ($manifest.sha256 -and $manifest.sha256 -ne $actualHash) {
            throw 'Backup SHA256 does not match its manifest. Restore stopped.'
        }
    }

    Write-Host ''
    Write-Host 'WARNING: Restore replaces the active Stock Control database.' -ForegroundColor Red
    Write-Host "Selected backup: $BackupFile"
    $confirmation = Read-Host 'Type RESTORE STOCK CONTROL to continue'
    if ($confirmation -ne 'RESTORE STOCK CONTROL') {
        Write-Host 'Restore cancelled.'
        return
    }

    Invoke-Backup 'Automatic pre-restore safety backup'

    $settings = Read-DotEnv $envPath
    $dbName = if ($settings['DB_NAME']) { $settings['DB_NAME'] } else { 'stock' }
    $dbUser = if ($settings['DB_USER']) { $settings['DB_USER'] } else { 'stock' }
    $composeArgs = Get-ComposeArgs

    & docker @composeArgs stop api web
    if ($LASTEXITCODE -ne 0) { throw 'API/web services could not be stopped for restore.' }

    $containerId = (& docker compose -f $baseCompose --env-file $envPath ps -q db).Trim()
    if (-not $containerId) { throw 'PostgreSQL container is not running.' }

    $containerFile = '/tmp/eaststone-restore.dump'
    & docker cp $BackupFile "${containerId}:$containerFile"
    if ($LASTEXITCODE -ne 0) { throw 'Backup could not be copied into PostgreSQL container.' }

    Write-Log "Restoring database $dbName from $BackupFile"
    & docker exec $containerId dropdb -U $dbUser --if-exists --force $dbName
    if ($LASTEXITCODE -ne 0) { throw 'Existing database could not be dropped.' }
    & docker exec $containerId createdb -U $dbUser $dbName
    if ($LASTEXITCODE -ne 0) { throw 'Replacement database could not be created.' }
    & docker exec $containerId pg_restore -U $dbUser -d $dbName --no-owner --no-privileges $containerFile
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed. The pre-restore backup remains available.' }
    & docker exec $containerId rm -f $containerFile *> $null

    & docker @composeArgs up -d
    if ($LASTEXITCODE -ne 0) { throw 'Application could not restart after restore.' }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'windows\Health-Monitor.ps1') -InstallRoot $InstallRoot
    if ($LASTEXITCODE -ne 0) { throw 'Restore completed, but the health verification failed.' }

    Write-Log 'Restore and post-restore health verification completed successfully.'
    [System.Windows.Forms.MessageBox]::Show(
        'Database restore completed successfully.',
        'Eaststone Stock Control',
        'OK',
        'Information'
    ) | Out-Null
}

try {
    if (-not (Test-Path $envPath)) { throw '.env is missing. Run server setup first.' }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running.' }

    while ($true) {
        Clear-Host
        Write-Host '============================================================'
        Write-Host ' Eaststone Stock Control - Backup and Restore Tool'
        Write-Host '============================================================'
        Write-Host '1. Create verified backup now'
        Write-Host '2. List available backups'
        Write-Host '3. Restore a backup'
        Write-Host '4. Open backup folder'
        Write-Host '5. Exit'
        Write-Host ''
        $choice = Read-Host 'Select an option'

        switch ($choice) {
            '1' {
                Invoke-Backup 'Manual administrator backup'
                Read-Host 'Backup completed. Press Enter'
            }
            '2' {
                Get-ChildItem -LiteralPath $backupDir -Filter '*.dump' -File |
                    Sort-Object LastWriteTime -Descending |
                    Select-Object Name, Length, LastWriteTime |
                    Format-Table -AutoSize
                Read-Host 'Press Enter'
            }
            '3' {
                $selected = Select-BackupFile
                if ($selected) { Restore-Backup $selected }
                Read-Host 'Press Enter'
            }
            '4' { Start-Process explorer.exe $backupDir }
            '5' { break }
            default { Start-Sleep -Seconds 1 }
        }
        if ($choice -eq '5') { break }
    }
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        'Eaststone Stock Control - Backup/Restore Error',
        'OK',
        'Error'
    ) | Out-Null
    exit 1
}
