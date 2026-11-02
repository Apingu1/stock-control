#requires -RunAsAdministrator
#requires -Version 5.1
<#
 One-time installer on the physical Hyper-V host OR Windows 11 VM.
 Manager runs under SYSTEM at machine startup, independent of login and Docker.
 Stack control tasks run under the VM's existing interactive Docker Desktop user.
#>
param(
    [Parameter(Mandatory=$true)][ValidateSet('Host','VM')][string]$Role,
    [Parameter(Mandatory=$true)][string]$AuthorisedWindowsAccount,
    [Parameter(Mandatory=$true)][string]$AdminSubnet,
    [string]$Hostname = '',
    [string]$VmName = 'east-dev1',
    [string]$DockerUser = '',
    [string]$InstallRoot = "$env:ProgramData\StkFlo\Server",
    [string]$AllowedBackupShare = ''
)
$ErrorActionPreference='Stop'
$port = if ($Role -eq 'Host') { 9443 } else { 9444 }
if (-not $Hostname) { $Hostname = if ($Role -eq 'Host') { 'stkflo-host' } else { 'stkflo-manager' } }
if ($AdminSubnet -notmatch '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}/(?:[0-9]|[12][0-9]|3[0-2])$') {
    throw 'AdminSubnet must be an approved IPv4 CIDR, e.g. 192.168.1.0/24'
}
if ($Role -eq 'VM' -and -not $DockerUser) { throw 'Specify the Windows user who signs in and runs Docker Desktop using -DockerUser' }
if ($Role -eq 'Host' -and -not (Get-Command Get-VM -ErrorAction SilentlyContinue)) { throw 'Install the Host role on the physical Hyper-V host' }
$root = if ($Role -eq 'Host') { Join-Path $env:ProgramData 'StkFlo\HostManagement' } else { Join-Path $env:ProgramData 'StkFlo\Management' }
$log = Join-Path $root 'logs'
New-Item -Path $log -ItemType Directory -Force | Out-Null
$groupName='StkFlo Managers'
if (-not (Get-LocalGroup -Name $groupName -ErrorAction SilentlyContinue)) {
    # Windows New-LocalGroup limits Description to 48 characters.
    New-LocalGroup -Name $groupName -Description 'Authorised StkFlo remote administrators' | Out-Null
}
$members = @(Get-LocalGroupMember -Group $groupName -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
if ($AuthorisedWindowsAccount -notin $members) {
    Add-LocalGroupMember -Group $groupName -Member $AuthorisedWindowsAccount -ErrorAction Stop
}
$ca = Get-ChildItem 'Cert:\LocalMachine\My' | Where-Object {
    $_.Subject -eq "CN=$Hostname" -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(30)
} | Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $ca) {
    $ca = New-SelfSignedCertificate -DnsName $Hostname -CertStoreLocation 'Cert:\LocalMachine\My' -KeyAlgorithm RSA -KeyLength 3072 -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddYears(2)
}
$certFile = Join-Path $root ("StkFlo-" + $Role + "-Manager-Public.cer")
Export-Certificate -Cert $ca -FilePath $certFile -Force | Out-Null
$binding = & netsh.exe http show sslcert ipport="0.0.0.0:$port" 2>&1
if ($LASTEXITCODE -eq 0) {
    if (($binding -join ' ') -notmatch $ca.Thumbprint) {
        throw "Port $port already has another TLS binding. Do not overwrite it automatically."
    }
} else {
    & netsh.exe http add sslcert ipport="0.0.0.0:$port" certhash=$($ca.Thumbprint) appid='{ADAC068E-B5BC-42B3-8E47-21D974516BED}' certstorename=MY | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to register HTTPS certificate with HTTP.sys' }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Server-Management.ps1') -Destination $root -Force
if ($Role -eq 'VM') {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Invoke-StackAction.ps1') -Destination $root -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Sync-Backups.ps1') -Destination $root -Force
}
$allowed = @()
if ($AllowedBackupShare) {
    if (-not $AllowedBackupShare.StartsWith('\\')) { throw 'AllowedBackupShare must be a UNC path' }
    $allowed = @($AllowedBackupShare.TrimEnd('\'))
}
$config = [ordered]@{
    role = $Role
    vm_name = $VmName
    listen_port = $port
    hostname = $Hostname
    admin_group = $groupName
    install_root = $InstallRoot
    allow_force_vm_restart = $false
    allowed_backup_roots = $allowed
}
$configFile = Join-Path $root 'manager.json'
$tempFile = "$configFile.tmp"
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $tempFile -Encoding UTF8
Move-Item -LiteralPath $tempFile -Destination $configFile -Force
# Non-admin users must not be able to change which actions/VM are allowed.
& icacls.exe $root /grant:r 'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' /T | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect management config and audit files' }
if ($Role -eq 'VM') {
    # The approved Docker Desktop user may read signed control scripts, but cannot modify them.
    & icacls.exe $root /grant ("$($DockerUser):(OI)(CI)RX") /T | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker user cannot read approved management scripts' }
    # Runtime state is intentionally writable by this user (task results, stop markers,
    # replication status); never grant modify rights to .env or the manager configuration.
    foreach ($name in @('runtime-state','logs','deployment','Backups','infra\certs')) {
        $dataPath = Join-Path $InstallRoot $name
        New-Item -Path $dataPath -ItemType Directory -Force | Out-Null
        & icacls.exe $dataPath /grant ("$($DockerUser):(OI)(CI)M") /T | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Docker user cannot write required runtime folder: $dataPath" }
    }
}
$managerName = "StkFlo - $Role Manager"
$managerPath = Join-Path $root 'Server-Management.ps1'
$actionArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $managerPath + '" -Role ' + $Role + ' -ConfigPath "' + $configFile + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs -WorkingDirectory $root
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName $managerName -Action $action -Principal $principal -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Force | Out-Null
if ($Role -eq 'VM') {
    foreach ($name in @('Start','Stop','Restart')) {
        $taskName = "StkFlo - Stack $name"
        $controller = Join-Path $root 'Invoke-StackAction.ps1'
        $args = '-NoProfile -ExecutionPolicy Bypass -File "' + $controller + '" -Action ' + $name + ' -InstallRoot "' + $InstallRoot + '"'
        $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $args -WorkingDirectory $root
        $dockerPrincipal = New-ScheduledTaskPrincipal -UserId $DockerUser -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $taskName -Action $taskAction -Principal $dockerPrincipal -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date).AddYears(10)) -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries) -Force | Out-Null
    }
    # Rebind the legacy maintenance tasks to the actual logged-on Docker
    # Desktop account, not the (possibly different) UAC elevation account.
    $maintenancePrincipal = New-ScheduledTaskPrincipal -UserId $DockerUser -LogonType Interactive -RunLevel Limited
    $maintenanceSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    $healthAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $InstallRoot 'windows\Health-Monitor.ps1') + '" -InstallRoot "' + $InstallRoot + '"') -WorkingDirectory $InstallRoot
    $healthTriggers = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $DockerUser),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 30))
    )
    Register-ScheduledTask -TaskName 'StkFlo - Health Monitor' -Action $healthAction -Principal $maintenancePrincipal -Trigger $healthTriggers -Settings $maintenanceSettings -Force | Out-Null
    $certificateAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $InstallRoot 'windows\Certificate-Renewal.ps1') + '" -InstallRoot "' + $InstallRoot + '"') -WorkingDirectory $InstallRoot
    Register-ScheduledTask -TaskName 'StkFlo - Certificate Renewal' -Action $certificateAction -Principal $maintenancePrincipal -Trigger (New-ScheduledTaskTrigger -Daily -At '02:15') -Settings $maintenanceSettings -Force | Out-Null

    $syncScript = Join-Path $root 'Sync-Backups.ps1'
    $syncArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $syncScript + '" -InstallRoot "' + $InstallRoot + '"'
    $syncAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $syncArgs -WorkingDirectory $root
    $syncPrincipal = New-ScheduledTaskPrincipal -UserId $DockerUser -LogonType Interactive -RunLevel Limited
    $syncTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName 'StkFlo - Backup Replication' -Action $syncAction -Principal $syncPrincipal -Trigger $syncTrigger -Settings (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)) -Force | Out-Null
}
$firewallName = "StkFlo - $Role Manager HTTPS"
if (Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $firewallName
}
New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Domain,Private -RemoteAddress $AdminSubnet | Out-Null
Start-ScheduledTask -TaskName $managerName
Write-Host ''
Write-Host "Installed StkFlo $Role management endpoint."
Write-Host "Access: https://$($Hostname):$port/"
Write-Host "Allowed Windows group: $env:COMPUTERNAME\$groupName"
Write-Host "Public certificate: $certFile"
Write-Host 'Only distribute the PUBLIC certificate to approved administrator computers.'
Write-Host 'Create a DNS record or approved hosts entry for the management hostname.'
Write-Host 'The agent will work only while this Windows machine is powered on.'
if ($Role -eq 'VM') {
    Write-Host "Docker tasks will run under logged-on Windows user: $DockerUser"
    Write-Host 'Verify that a requested start/stop task completes successfully in the management status record.'
}
