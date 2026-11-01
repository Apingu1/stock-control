#requires -Version 5.1
param(
    [Parameter(Mandatory=$true)][ValidateSet('Start','Stop','Restart')][string]$Action,
    [string]$InstallRoot = "$env:ProgramData\StkFlo\Server"
)
$ErrorActionPreference = 'Stop'
$compose = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
$tls = Join-Path $InstallRoot 'infra\docker-compose.production.tls.yml'
$environment = Join-Path $InstallRoot '.env'
$flag = Join-Path $InstallRoot 'deployment\manual-stop.flag'
$statePath = Join-Path $InstallRoot 'runtime-state\management-operation.json'
New-Item -ItemType Directory -Path (Split-Path $statePath -Parent) -Force | Out-Null
$record = [ordered]@{
    action = $Action
    actor = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    started_at_utc = [DateTime]::UtcNow.ToString('o')
    result = 'RUNNING'
    error = $null
    finished_at_utc = $null
}
function Write-State {
    $temp = "$statePath.tmp"
    $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $statePath -Force
}
function Assert-Docker {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop engine is not reachable from the configured Docker user session' }
}
function Assert-ApprovedStop {
    # When the application is alive, require the administrator to put it into
    # the existing maintenance mode before a disruptive stop/restart.
    $healthy = $false
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8088/api/health' -TimeoutSec 3
        $healthy = [bool]$health.ok
    } catch {}
    if ($healthy) {
        try {
            $maintenance = Invoke-RestMethod 'http://127.0.0.1:8088/api/admin/db-tools/maintenance' -TimeoutSec 3
        } catch { throw 'Cannot verify StkFlo maintenance mode while the application is healthy; stop refused' }
        if (-not $maintenance.enabled) { throw 'Enable maintenance mode in StkFlo Admin before stopping or restarting a healthy application' }
    }
}
function Stop-Stack {
    Assert-Docker
    Assert-ApprovedStop
    New-Item -ItemType Directory -Path (Split-Path $flag -Parent) -Force | Out-Null
    Set-Content -LiteralPath $flag -Value ("Stopped by management task at " + [DateTime]::UtcNow.ToString('o')) -Encoding UTF8
    & docker compose -f $compose -f $tls --env-file $environment down --remove-orphans
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
        throw 'Docker Compose could not stop the application'
    }
}
function Start-Stack {
    if (Test-Path -LiteralPath $flag) { Remove-Item -LiteralPath $flag -Force }
    # Health-Monitor is the existing approved Docker startup/reconciliation path.
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'windows\Health-Monitor.ps1') -InstallRoot $InstallRoot
    if ($LASTEXITCODE -ne 0) { throw 'StkFlo health monitor could not reconcile the stack' }
}
Write-State
try {
    if (-not (Test-Path -LiteralPath $environment)) { throw 'StkFlo has not been installed' }
    switch ($Action) {
        'Stop' { Stop-Stack }
        'Start' { Start-Stack }
        'Restart' {
            Stop-Stack
            Start-Stack
        }
    }
    $record.result = 'SUCCESS'
} catch {
    $record.result = 'FAILED'
    $record.error = $_.Exception.Message
} finally {
    $record.finished_at_utc = [DateTime]::UtcNow.ToString('o')
    Write-State
}
if ($record.result -ne 'SUCCESS') { throw $record.error }
