param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$envPath = Join-Path $InstallRoot '.env'
$composePath = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
$stateDir = Join-Path $InstallRoot 'runtime-state'
$settingsPath = Join-Path $stateDir 'backup_settings.json'
$auditPath = Join-Path $stateDir 'db_tools_audit.jsonl'
$logDir = Join-Path $InstallRoot 'logs'
$logPath = Join-Path $logDir 'backup-settings.log'
New-Item -ItemType Directory -Path $stateDir, $logDir -Force | Out-Null

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ssK') $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
    Write-Host $line
}

function Read-DotEnv([string]$Path) {
    $result = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
                $result[$matches[1].Trim()] = $matches[2].Trim().Trim('"')
            }
        }
    }
    return $result
}

function Set-DotEnvValue([string]$Path, [string]$Key, [string]$Value) {
    $lines = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) { $lines.Add($line) }
    }
    $pattern = '^\s*' + [regex]::Escape($Key) + '='
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match $pattern) {
            $lines[$index] = "$Key=$Value"
            $found = $true
        }
    }
    if (-not $found) { $lines.Add("$Key=$Value") }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Path, $lines, $utf8NoBom)
}

function Read-BackupSettings {
    $defaultTimezone = if ($environment['TZ']) { $environment['TZ'] } else { 'Europe/London' }
    $default = [ordered]@{
        enabled = $true
        time_local = '02:30'
        timezone = $defaultTimezone
        retention_days = 30
        updated_by = 'SYSTEM_DEFAULT'
        updated_at_utc = ''
    }
    if (-not (Test-Path -LiteralPath $settingsPath)) { return $default }
    try {
        $loaded = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        if ($null -ne $loaded.enabled) { $default.enabled = [bool]$loaded.enabled }
        if ($loaded.time_local -match '^(?:[01]\d|2[0-3]):[0-5]\d$') { $default.time_local = [string]$loaded.time_local }
        if ($loaded.timezone) { $default.timezone = [string]$loaded.timezone }
        if ($loaded.retention_days) {
            $loadedRetention = [int]$loaded.retention_days
            if ($loadedRetention -ge 1 -and $loadedRetention -le 3650) {
                $default.retention_days = $loadedRetention
            }
        }
    } catch {
        Write-Log "Existing backup settings could not be read; safe defaults will be shown. $($_.Exception.Message)"
    }
    return $default
}

function Write-BackupSettings([bool]$Enabled, [string]$TimeLocal, [int]$RetentionDays) {
    $actor = "$env:USERDOMAIN\$env:USERNAME"
    $timezoneName = if ($currentSettings.timezone) { [string]$currentSettings.timezone } else { 'Europe/London' }
    $payload = [ordered]@{
        enabled = $Enabled
        time_local = $TimeLocal
        timezone = $timezoneName
        retention_days = $RetentionDays
        updated_by = $actor
        updated_at_utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $temporary = "$settingsPath.tmp"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($temporary, ($payload | ConvertTo-Json -Depth 4), $utf8NoBom)
    Move-Item -LiteralPath $temporary -Destination $settingsPath -Force
    return $payload
}

function Write-Audit([string]$Action, [hashtable]$Parameters) {
    $entry = [ordered]@{
        timestamp_utc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        actor = "$env:USERDOMAIN\$env:USERNAME"
        action = $Action
        params = $Parameters
        result = 'SUCCESS'
        error = $null
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::AppendAllText($auditPath, (($entry | ConvertTo-Json -Compress -Depth 6) + "`n"), $utf8NoBom)
}

function Resolve-ConfiguredPath([string]$Value) {
    $expanded = [Environment]::ExpandEnvironmentVariables($Value.Trim())
    if ([string]::IsNullOrWhiteSpace($expanded)) { throw 'Select a backup folder.' }
    if ($expanded.IndexOfAny([char[]]@("`r", "`n")) -ge 0) { throw 'The backup folder contains invalid characters.' }
    if (-not [System.IO.Path]::IsPathRooted($expanded)) {
        # Compose resolves bind sources relative to the first compose file.
        $expanded = Join-Path (Split-Path -Parent $composePath) $expanded
    }
    New-Item -ItemType Directory -Path $expanded -Force | Out-Null
    return (Resolve-Path -LiteralPath $expanded).Path
}

function Test-HostFolder([string]$Path) {
    $testFile = Join-Path $Path ".esc-write-test-$([guid]::NewGuid().ToString('N')).tmp"
    try {
        [System.IO.File]::WriteAllText($testFile, 'Stock Control backup location test')
        if (-not (Test-Path -LiteralPath $testFile -PathType Leaf)) { throw 'Write test did not create a file.' }
    } finally {
        Remove-Item -LiteralPath $testFile -Force -ErrorAction SilentlyContinue
    }
}

function Apply-ContainerMount {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not running.' }
    & docker compose -f $composePath --env-file $envPath config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'The updated Docker configuration is invalid.' }
    & docker compose -f $composePath --env-file $envPath up -d --no-deps --force-recreate api backup-scheduler
    if ($LASTEXITCODE -ne 0) { throw 'Docker could not connect the backup services to the selected folder.' }
    & docker compose -f $composePath --env-file $envPath exec -T api python -c "from pathlib import Path; p=Path('/backups/.esc-container-write-test'); p.write_text('ok'); p.unlink()"
    if ($LASTEXITCODE -ne 0) { throw 'The Stock Control container cannot write to the selected folder.' }
}

if (-not (Test-Path -LiteralPath $envPath)) {
    [System.Windows.Forms.MessageBox]::Show(
        '.env is missing. Run the server installation first.',
        'ESC Backup Settings', 'OK', 'Error'
    ) | Out-Null
    exit 1
}

$environment = Read-DotEnv $envPath
$defaultPath = Join-Path $InstallRoot 'Backups'
if ($environment['BACKUP_HOST_PATH']) {
    $currentPath = $environment['BACKUP_HOST_PATH']
} elseif (Test-Path -LiteralPath (Join-Path $InstallRoot 'backups-production-test')) {
    $currentPath = Join-Path $InstallRoot 'backups-production-test'
} else {
    $currentPath = $defaultPath
}
try { $currentPath = Resolve-ConfiguredPath $currentPath } catch { $currentPath = $defaultPath }
$currentSettings = Read-BackupSettings

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Eaststone Stock Control - Backup Settings'
$form.Size = New-Object System.Drawing.Size(760, 520)
$form.MinimumSize = New-Object System.Drawing.Size(760, 520)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$form.BackColor = [System.Drawing.Color]::FromArgb(245, 247, 251)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Backup Settings'
$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 20)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(28, 22)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = 'Choose where backups are physically stored and when the automatic daily backup runs.'
$subtitle.AutoSize = $true
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(80, 90, 110)
$subtitle.Location = New-Object System.Drawing.Point(31, 64)
$form.Controls.Add($subtitle)

$folderLabel = New-Object System.Windows.Forms.Label
$folderLabel.Text = 'Backup folder on this server or an approved network location'
$folderLabel.AutoSize = $true
$folderLabel.Location = New-Object System.Drawing.Point(31, 112)
$form.Controls.Add($folderLabel)

$folderText = New-Object System.Windows.Forms.TextBox
$folderText.Text = $currentPath
$folderText.Location = New-Object System.Drawing.Point(34, 139)
$folderText.Size = New-Object System.Drawing.Size(575, 32)
$form.Controls.Add($folderText)

$browseButton = New-Object System.Windows.Forms.Button
$browseButton.Text = 'Browse...'
$browseButton.Location = New-Object System.Drawing.Point(620, 137)
$browseButton.Size = New-Object System.Drawing.Size(100, 34)
$browseButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Select the Stock Control backup folder'
    $dialog.ShowNewFolderButton = $true
    if (Test-Path -LiteralPath $folderText.Text) { $dialog.SelectedPath = $folderText.Text }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $folderText.Text = $dialog.SelectedPath
    }
})
$form.Controls.Add($browseButton)

$folderHelp = New-Object System.Windows.Forms.Label
$folderHelp.Text = 'Existing backups are not moved or deleted when the location changes. The new folder is used for future manual and automatic backups.'
$folderHelp.AutoSize = $false
$folderHelp.Size = New-Object System.Drawing.Size(686, 45)
$folderHelp.Location = New-Object System.Drawing.Point(34, 179)
$folderHelp.ForeColor = [System.Drawing.Color]::FromArgb(80, 90, 110)
$form.Controls.Add($folderHelp)

$enabledCheck = New-Object System.Windows.Forms.CheckBox
$enabledCheck.Text = 'Enable automatic daily backups'
$enabledCheck.Checked = [bool]$currentSettings.enabled
$enabledCheck.AutoSize = $true
$enabledCheck.Location = New-Object System.Drawing.Point(34, 242)
$form.Controls.Add($enabledCheck)

$timeLabel = New-Object System.Windows.Forms.Label
$timeLabel.Text = 'Daily backup time'
$timeLabel.AutoSize = $true
$timeLabel.Location = New-Object System.Drawing.Point(34, 292)
$form.Controls.Add($timeLabel)

$timePicker = New-Object System.Windows.Forms.DateTimePicker
$timePicker.Format = [System.Windows.Forms.DateTimePickerFormat]::Custom
$timePicker.CustomFormat = 'HH:mm'
$timePicker.ShowUpDown = $true
$timePicker.Size = New-Object System.Drawing.Size(150, 32)
$timePicker.Location = New-Object System.Drawing.Point(34, 319)
$parts = ([string]$currentSettings.time_local).Split(':')
$timePicker.Value = (Get-Date).Date.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
$form.Controls.Add($timePicker)

$retentionLabel = New-Object System.Windows.Forms.Label
$retentionLabel.Text = 'Automatic backup retention (days)'
$retentionLabel.AutoSize = $true
$retentionLabel.Location = New-Object System.Drawing.Point(238, 292)
$form.Controls.Add($retentionLabel)

$retentionInput = New-Object System.Windows.Forms.NumericUpDown
$retentionInput.Minimum = 1
$retentionInput.Maximum = 3650
$retentionInput.Value = [decimal]$currentSettings.retention_days
$retentionInput.Size = New-Object System.Drawing.Size(150, 32)
$retentionInput.Location = New-Object System.Drawing.Point(238, 319)
$form.Controls.Add($retentionInput)

$retentionHelp = New-Object System.Windows.Forms.Label
$retentionHelp.Text = 'Retention applies only to automatic backups. Manual and pre-restore safety backups are never removed automatically.'
$retentionHelp.AutoSize = $false
$retentionHelp.Size = New-Object System.Drawing.Size(686, 42)
$retentionHelp.Location = New-Object System.Drawing.Point(34, 366)
$retentionHelp.ForeColor = [System.Drawing.Color]::FromArgb(80, 90, 110)
$form.Controls.Add($retentionHelp)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = 'Cancel'
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$cancelButton.Location = New-Object System.Drawing.Point(505, 424)
$cancelButton.Size = New-Object System.Drawing.Size(100, 36)
$form.Controls.Add($cancelButton)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Text = 'Save Settings'
$saveButton.Location = New-Object System.Drawing.Point(615, 424)
$saveButton.Size = New-Object System.Drawing.Size(105, 36)
$saveButton.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$saveButton.ForeColor = [System.Drawing.Color]::White
$saveButton.FlatStyle = 'Flat'
$form.Controls.Add($saveButton)
$form.AcceptButton = $saveButton
$form.CancelButton = $cancelButton

$saveButton.Add_Click({
    $saveButton.Enabled = $false
    try {
        $newPath = Resolve-ConfiguredPath $folderText.Text
        Test-HostFolder $newPath
        $timeLocal = $timePicker.Value.ToString('HH:mm')
        $retention = [int]$retentionInput.Value
        $oldPath = $currentPath
        $pathChanged = -not [string]::Equals($newPath, $oldPath, [System.StringComparison]::OrdinalIgnoreCase)
        $originalEnv = [System.IO.File]::ReadAllText($envPath)
        $settingsExisted = Test-Path -LiteralPath $settingsPath
        $originalSettings = if ($settingsExisted) { [System.IO.File]::ReadAllText($settingsPath) } else { $null }
        try {
            $composePathValue = $newPath.Replace('\', '/')
            Set-DotEnvValue $envPath 'BACKUP_HOST_PATH' $composePathValue
            Set-DotEnvValue $envPath 'BACKUP_DIR' '/backups'
            Set-DotEnvValue $envPath 'APP_STATE_DIR' '/app-state'
            Set-DotEnvValue $envPath 'BACKUP_DIR_LABEL' $newPath
            Write-BackupSettings -Enabled $enabledCheck.Checked -TimeLocal $timeLocal -RetentionDays $retention | Out-Null
            if ($pathChanged) { Apply-ContainerMount }
            $auditAction = if ($pathChanged) { 'BACKUP_LOCATION_UPDATED' } else { 'BACKUP_SETTINGS_UPDATED' }
            Write-Audit $auditAction @{
                previous_path = $oldPath
                new_path = $newPath
                enabled = $enabledCheck.Checked
                time_local = $timeLocal
                retention_days = $retention
            }
            Write-Log "Backup settings updated. Location=$newPath Time=$timeLocal Enabled=$($enabledCheck.Checked) Retention=$retention"
        } catch {
            [System.IO.File]::WriteAllText($envPath, $originalEnv)
            if ($settingsExisted) {
                [System.IO.File]::WriteAllText($settingsPath, $originalSettings)
            } else {
                Remove-Item -LiteralPath $settingsPath -Force -ErrorAction SilentlyContinue
            }
            if ($pathChanged) {
                & docker compose -f $composePath --env-file $envPath up -d --no-deps --force-recreate api backup-scheduler *> $null
            }
            throw
        }
        [System.Windows.Forms.MessageBox]::Show(
            "Backup settings saved successfully.`r`n`r`nFolder: $newPath`r`nDaily time: $timeLocal",
            'ESC Backup Settings', 'OK', 'Information'
        ) | Out-Null
        $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Close()
    } catch {
        Write-Log "ERROR: $($_.Exception.Message)"
        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            'ESC Backup Settings - Error', 'OK', 'Error'
        ) | Out-Null
    } finally {
        $saveButton.Enabled = $true
    }
})

[void]$form.ShowDialog()
