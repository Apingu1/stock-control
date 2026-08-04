param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

function Register-EaststoneTask(
    [string]$Name,
    [string]$ScriptName,
    [Microsoft.Management.Infrastructure.CimInstance[]]$Triggers
) {
    $scriptPath = Join-Path $InstallRoot "windows\$ScriptName"
    if (-not (Test-Path $scriptPath)) { throw "Required maintenance script is missing: $scriptPath" }
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -InstallRoot `"$InstallRoot`""
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $InstallRoot
    Register-ScheduledTask -TaskName $Name -Action $action -Trigger $Triggers -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "Registered scheduled task: $Name"
}

# On supported Windows 10/11 and Server 2016+ ScheduledTasks implementations,
# omitting RepetitionDuration creates an indefinite repetition pattern. This
# avoids the previous hidden ten-year endpoint.
$healthTriggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $userId),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 30))
)
$renewalTrigger = New-ScheduledTaskTrigger -Daily -At '02:15'
$backupTrigger = New-ScheduledTaskTrigger -Daily -At '02:30'

Register-EaststoneTask -Name 'Eaststone Stock Control - Health Monitor' -ScriptName 'Health-Monitor.ps1' -Triggers $healthTriggers
Register-EaststoneTask -Name 'Eaststone Stock Control - Certificate Renewal' -ScriptName 'Certificate-Renewal.ps1' -Triggers @($renewalTrigger)
Register-EaststoneTask -Name 'Eaststone Stock Control - Daily Backup' -ScriptName 'Automatic-Backup.ps1' -Triggers @($backupTrigger)

# Run the monitor once immediately after registration so installation does not
# depend on waiting for the first trigger.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'windows\Health-Monitor.ps1') -InstallRoot $InstallRoot
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Maintenance tasks were registered, but the initial health-monitor run reported a problem.'
}

Write-Host 'Automatic maintenance tasks registered successfully.'
