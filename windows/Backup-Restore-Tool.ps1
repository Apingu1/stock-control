param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$envPath = Join-Path $InstallRoot '.env'
$baseCompose = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
$tlsCompose = Join-Path $InstallRoot 'infra\docker-compose.production.tls.yml'
$stateDir = Join-Path $InstallRoot 'runtime-state'
$logDir = Join-Path $InstallRoot 'logs'
$logPath = Join-Path $logDir 'backup-restore-tool.log'
$auditPath = Join-Path $stateDir 'db_tools_audit.jsonl'
New-Item -ItemType Directory -Path $logDir, $stateDir -Force | Out-Null

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ssK') $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
    Write-Host $line
}

function Write-Audit([string]$Action, [hashtable]$Parameters, [string]$Result, [string]$ErrorMessage = '') {
    $entry = [ordered]@{
        timestamp_utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        actor = "$env:USERDOMAIN\$env:USERNAME"
        action = $Action
        params = $Parameters
        result = $Result
        error = if ($ErrorMessage) { $ErrorMessage } else { $null }
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::AppendAllText($auditPath, (($entry | ConvertTo-Json -Compress -Depth 6) + "`n"), $utf8NoBom)
}

function Read-DotEnv([string]$Path) {
    $result = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
            $result[$matches[1].Trim()] = $matches[2].Trim().Trim('"')
        }
    }
    return $result
}

function Get-BackupDirectory([hashtable]$Settings) {
    if ($Settings['BACKUP_HOST_PATH']) {
        $candidate = [Environment]::ExpandEnvironmentVariables($Settings['BACKUP_HOST_PATH'])
        if (-not [System.IO.Path]::IsPathRooted($candidate)) {
            $candidate = Join-Path (Split-Path -Parent $baseCompose) $candidate
        }
    } elseif (Test-Path -LiteralPath (Join-Path $InstallRoot 'backups-production-test')) {
        $candidate = Join-Path $InstallRoot 'backups-production-test'
    } else {
        $candidate = Join-Path $InstallRoot 'Backups'
    }
    New-Item -ItemType Directory -Path $candidate -Force | Out-Null
    return (Resolve-Path -LiteralPath $candidate).Path
}

function Get-ComposeArgs {
    if (Test-Path (Join-Path $InstallRoot 'infra\certs\stock-control.crt')) {
        return @('compose', '-f', $baseCompose, '-f', $tlsCompose, '--env-file', $envPath)
    }
    return @('compose', '-f', $baseCompose, '--env-file', $envPath)
}

function Get-ActiveDatabase([hashtable]$Settings) {
    $activePath = Join-Path $stateDir 'active_dataset.json'
    if (Test-Path -LiteralPath $activePath) {
        try {
            $active = Get-Content -LiteralPath $activePath -Raw | ConvertFrom-Json
            if ($active.db_name) { return [string]$active.db_name }
        } catch {
            Write-Log "Active-dataset state could not be read; using DB_NAME. $($_.Exception.Message)"
        }
    }
    if ($Settings['DB_NAME']) { return $Settings['DB_NAME'] }
    return 'stock'
}

function Invoke-Backup([string]$Reason, [string]$BackupType = 'MANUAL') {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass `
        -File (Join-Path $InstallRoot 'windows\Automatic-Backup.ps1') `
        -InstallRoot $InstallRoot -Reason $Reason -BackupType $BackupType
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Review logs\backup.log.' }
}

function Select-BackupFile([string]$InitialDirectory) {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.InitialDirectory = $InitialDirectory
    $dialog.Filter = 'Stock Control backup (*.dump)|*.dump|All files (*.*)|*.*'
    $dialog.Title = 'Select Stock Control database backup to restore'
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    return $null
}

function Test-BackupIntegrity([string]$BackupFile) {
    $stream = [System.IO.File]::OpenRead($BackupFile)
    try {
        $signature = New-Object byte[] 5
        [void]$stream.Read($signature, 0, 5)
        if ([System.Text.Encoding]::ASCII.GetString($signature) -ne 'PGDMP') {
            throw 'Selected file is not a PostgreSQL custom-format backup.'
        }
    } finally {
        $stream.Dispose()
    }
    $manifestPath = "$BackupFile.json"
    if (Test-Path -LiteralPath $manifestPath) {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $BackupFile).Hash
        if ($manifest.sha256 -and ([string]$manifest.sha256).ToUpperInvariant() -ne $actualHash.ToUpperInvariant()) {
            throw 'Backup SHA-256 does not match its manifest. Restore stopped.'
        }
        if ($manifest.sha256) { return 'VERIFIED' }
        return 'NO_HASH'
    }
    return 'NO_MANIFEST'
}

function Write-ActiveDatabaseState(
    [string]$DatabaseName,
    [string]$PreviousDatabase,
    [string]$SourceBackup
) {
    $activePath = Join-Path $stateDir 'active_dataset.json'
    $temporary = "$activePath.tmp"
    $payload = [ordered]@{
        db_name = $DatabaseName
        set_by = "$env:USERDOMAIN\$env:USERNAME"
        set_at_utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        note = 'Activated by the Windows guided restore utility after validation'
        previous_db = $PreviousDatabase
        source_backup = [System.IO.Path]::GetFileName($SourceBackup)
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Depth 4), $utf8NoBom)
    Move-Item -LiteralPath $temporary -Destination $activePath -Force
}

function Test-RestoredDatabase(
    [string]$ContainerId,
    [string]$DatabaseUser,
    [string]$DatabaseName
) {
    $query = "SELECT count(*) FROM (VALUES ('materials'),('material_lots'),('stock_transactions'),('users')) AS required(name) WHERE to_regclass('public.' || name) IS NOT NULL;"
    $result = & docker exec $ContainerId psql -U $DatabaseUser -d $DatabaseName -Atqc $query 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Restored database validation failed: $($result -join ' ')" }
    if (([string]($result | Select-Object -Last 1)).Trim() -ne '4') {
        throw 'Restored database is missing one or more required Stock Control tables.'
    }
}

function Test-OnlyTransactionTimeoutWarning([object[]]$OutputLines) {
    $lines = @($OutputLines | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
    if ($lines.Count -eq 0 -or (($lines -join "`n") -notmatch 'unrecognized configuration parameter "transaction_timeout"')) {
        return $false
    }
    foreach ($line in $lines) {
        if ($line -notmatch 'transaction_timeout' -and
            $line -notmatch 'Command was: SET transaction_timeout = 0;' -and
            $line -notmatch 'errors ignored on restore: 1') {
            return $false
        }
    }
    return $true
}

function Restore-Backup([string]$BackupFile, [hashtable]$Settings) {
    $BackupFile = (Resolve-Path -LiteralPath $BackupFile).Path
    $integrity = Test-BackupIntegrity $BackupFile
    $confirmation = [System.Windows.Forms.MessageBox]::Show(
        "Restore and activate this Stock Control backup?`r`n`r`n$BackupFile`r`n`r`nA pre-restore safety backup will be created automatically. The current database will be retained for rollback.",
        'Confirm Stock Control Restore', 'YesNo', 'Warning'
    )
    if ($confirmation -ne [System.Windows.Forms.DialogResult]::Yes) { return }

    $safetyBackupCreated = $true
    try {
        Invoke-Backup 'Automatic safety backup before Windows emergency restore' 'PRE_RESTORE'
    } catch {
        # This guided path restores into a new database and retains the current
        # database, so it remains recoverable when the API is too unhealthy to
        # create the additional safety dump.
        $safetyBackupCreated = $false
        Write-Log "WARNING: Pre-restore backup could not be created. $($_.Exception.Message)"
        [System.Windows.Forms.MessageBox]::Show(
            "The additional pre-restore backup could not be created.`r`n`r`nThe current database will still be retained unchanged while the selected backup is restored into a separate recovery database.",
            'Stock Control Restore Warning', 'OK', 'Warning'
        ) | Out-Null
    }
    $previousDb = Get-ActiveDatabase $Settings
    $recoveryDb = "stock_restore_$((Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss'))"
    $dbUser = if ($Settings['DB_USER']) { $Settings['DB_USER'] } else { 'stock' }
    $composeArgs = Get-ComposeArgs
    $activePath = Join-Path $stateDir 'active_dataset.json'
    $originalStateExists = Test-Path -LiteralPath $activePath
    $originalState = if ($originalStateExists) { [System.IO.File]::ReadAllText($activePath) } else { $null }
    $auditParams = @{
        backup = $BackupFile
        previous_database = $previousDb
        recovery_database = $recoveryDb
        integrity = $integrity
        safety_backup_created = $safetyBackupCreated
        mode = 'WINDOWS_GUIDED'
    }
    $containerId = $null
    $containerFile = '/tmp/eaststone-restore.dump'
    $recoveryCreated = $false
    $activated = $false
    Write-Audit 'WINDOWS_RESTORE_START' $auditParams 'STARTED'

    try {
        & docker @composeArgs stop api web backup-scheduler
        if ($LASTEXITCODE -ne 0) { throw 'Application services could not be stopped for restore.' }
        $containerOutput = & docker compose -f $baseCompose --env-file $envPath ps -q db
        $containerId = ([string]($containerOutput | Select-Object -First 1)).Trim()
        if (-not $containerId) { throw 'PostgreSQL container is not running.' }

        & docker cp $BackupFile "${containerId}:$containerFile"
        if ($LASTEXITCODE -ne 0) { throw 'Backup could not be copied into PostgreSQL.' }

        Write-Log "Restoring $BackupFile into new recovery database $recoveryDb"
        & docker exec $containerId createdb -U $dbUser -O $dbUser $recoveryDb
        if ($LASTEXITCODE -ne 0) { throw 'The recovery database could not be created.' }
        $recoveryCreated = $true
        $restoreOutput = & docker exec $containerId pg_restore -U $dbUser -d $recoveryDb --no-owner --no-privileges $containerFile 2>&1
        if ($LASTEXITCODE -ne 0 -and -not (Test-OnlyTransactionTimeoutWarning $restoreOutput)) {
            throw "pg_restore failed: $($restoreOutput -join ' ')"
        }
        $schemaOutput = & docker @composeArgs run --rm --no-deps -e "DB_NAME=$recoveryDb" db-init 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Restored database schema update failed: $($schemaOutput -join ' ')"
        }
        Test-RestoredDatabase -ContainerId $containerId -DatabaseUser $dbUser -DatabaseName $recoveryDb
        Write-ActiveDatabaseState -DatabaseName $recoveryDb -PreviousDatabase $previousDb -SourceBackup $BackupFile
        $activated = $true

        & docker @composeArgs up -d
        if ($LASTEXITCODE -ne 0) { throw 'Application could not restart after restore.' }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass `
            -File (Join-Path $InstallRoot 'windows\Health-Monitor.ps1') -InstallRoot $InstallRoot
        if ($LASTEXITCODE -ne 0) { throw 'Restore completed, but post-restore health verification failed.' }

        Write-Audit 'WINDOWS_RESTORE_COMPLETE' $auditParams 'SUCCESS'
        Write-Log "Restore completed. Active database=$recoveryDb; retained rollback database=$previousDb"
        [System.Windows.Forms.MessageBox]::Show(
            "Database restore completed successfully.`r`n`r`nThe previous database remains available for rollback: $previousDb",
            'Eaststone Stock Control', 'OK', 'Information'
        ) | Out-Null
    } catch {
        $restoreError = $_.Exception.Message
        try {
            Write-Audit 'WINDOWS_RESTORE_COMPLETE' $auditParams 'FAILED' $restoreError
        } catch {
            Write-Log "Restore audit write failed while handling: $restoreError"
        }
        & docker @composeArgs stop api web backup-scheduler *> $null
        if ($activated) {
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            if ($originalStateExists) {
                [System.IO.File]::WriteAllText($activePath, $originalState, $utf8NoBom)
            } else {
                Remove-Item -LiteralPath $activePath -Force -ErrorAction SilentlyContinue
            }
        }
        if ($recoveryCreated -and $containerId) {
            & docker exec $containerId dropdb -U $dbUser --if-exists --force $recoveryDb *> $null
        }
        & docker @composeArgs up -d *> $null
        throw $restoreError
    } finally {
        if ($containerId) { & docker exec $containerId rm -f $containerFile *> $null }
    }
}

try {
    if (-not (Test-Path -LiteralPath $envPath)) { throw '.env is missing. Run server setup first.' }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running.' }
    $settings = Read-DotEnv $envPath

    while ($true) {
        $backupDir = Get-BackupDirectory $settings
        Clear-Host
        Write-Host '============================================================'
        Write-Host ' Eaststone Stock Control - Backup and Restore Tool'
        Write-Host '============================================================'
        Write-Host "Backup folder: $backupDir"
        Write-Host ''
        Write-Host '1. Create verified backup now'
        Write-Host '2. List available backups'
        Write-Host '3. Restore a backup (emergency recovery)'
        Write-Host '4. Open backup folder'
        Write-Host '5. Change backup folder or daily time'
        Write-Host '6. Exit'
        Write-Host ''
        $choice = Read-Host 'Select an option'
        switch ($choice) {
            '1' {
                Invoke-Backup 'Manual Windows administrator backup' 'MANUAL'
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
                $selected = Select-BackupFile $backupDir
                if ($selected) { Restore-Backup $selected $settings }
                Read-Host 'Press Enter'
            }
            '4' { Start-Process explorer.exe $backupDir }
            '5' {
                & powershell.exe -NoProfile -ExecutionPolicy Bypass `
                    -File (Join-Path $InstallRoot 'windows\Backup-Settings.ps1') -InstallRoot $InstallRoot
                $settings = Read-DotEnv $envPath
            }
            '6' { break }
            default { Start-Sleep -Seconds 1 }
        }
        if ($choice -eq '6') { break }
    }
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message, 'Eaststone Stock Control - Backup/Restore Error', 'OK', 'Error'
    ) | Out-Null
    exit 1
}
