#requires -Version 5.1
<#
 Replicate verified local PostgreSQL dumps to the approved SMB share.
 Runs under the existing interactive Docker/SMB Windows account; no Docker dependency.
 A failed network copy never deletes the VM's local backup.
#>
param([string]$InstallRoot = "$env:ProgramData\StkFlo\Server")
$ErrorActionPreference = 'Stop'
$stateDir = Join-Path $InstallRoot 'runtime-state'
$configurationPath = Join-Path $stateDir 'backup_replication_settings.json'
$statusPath = Join-Path $stateDir 'backup_replication_status.json'
$localBackupFolder = Join-Path $InstallRoot 'Backups'
New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
$status = [ordered]@{
    at_utc = [DateTime]::UtcNow.ToString('o')
    result = 'NOT_CONFIGURED'
    destination = $null
    copied = @()
    skipped = 0
    failed = @()
    verified = 0
}
function Save-Status {
    $temp = "$statusPath.tmp"
    $status | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $statusPath -Force
}
function Assert-UNC([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or -not $Value.StartsWith('\\')) { throw 'Network backup destination must be a UNC share' }
    if ($Value -match '[<>|?*]' -or $Value.Contains('..')) { throw 'Network backup destination contains invalid characters' }
}
try {
    if (-not (Test-Path -LiteralPath $configurationPath)) { Save-Status; exit 0 }
    $configuration = Get-Content -LiteralPath $configurationPath -Raw | ConvertFrom-Json
    if ($configuration.enabled -ne $true) { $status.result = 'DISABLED'; Save-Status; exit 0 }
    $destination = [string]$configuration.destination_unc
    Assert-UNC $destination
    $status.destination = $destination
    if (-not (Test-Path -LiteralPath $localBackupFolder -PathType Container)) {
        throw "Local verified backup location does not exist: $localBackupFolder"
    }
    if (-not (Test-Path -LiteralPath $destination -PathType Container)) { throw 'Approved backup share is unavailable' }
    $probe = Join-Path $destination ('.stkflo-writecheck-' + [guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllText($probe,'write test')
        if (-not (Test-Path -LiteralPath $probe)) { throw 'Backup share write verification failed' }
    } finally { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue }

    foreach ($dump in @(Get-ChildItem -LiteralPath $localBackupFolder -Filter '*.dump' -File | Sort-Object LastWriteTimeUtc)) {
        $manifestSource = "$($dump.FullName).json"
        if (-not (Test-Path -LiteralPath $manifestSource)) { continue } # Never copy a partial/unverified dump.
        try {
            $manifest = Get-Content -LiteralPath $manifestSource -Raw | ConvertFrom-Json
            if (-not $manifest.sha256) { throw 'Backup has no SHA-256 manifest' }
            $sourceHash = (Get-FileHash -LiteralPath $dump.FullName -Algorithm SHA256).Hash
            if ($sourceHash -ne $manifest.sha256) { throw 'Local dump integrity verification failed' }
            $target = Join-Path $destination $dump.Name
            $targetManifest = "$target.json"
            if (Test-Path -LiteralPath $target -PathType Leaf) {
                if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $sourceHash -and (Test-Path $targetManifest)) {
                    $status.skipped += 1
                    $status.verified += 1
                    continue
                }
            }
            $staging = "$target.stkflo-copy-$([guid]::NewGuid().ToString('N')).partial"
            try {
                Copy-Item -LiteralPath $dump.FullName -Destination $staging -Force -ErrorAction Stop
                if ((Get-FileHash -LiteralPath $staging -Algorithm SHA256).Hash -ne $sourceHash) {
                    throw 'Network copy SHA-256 mismatch'
                }
                Move-Item -LiteralPath $staging -Destination $target -Force -ErrorAction Stop
                Copy-Item -LiteralPath $manifestSource -Destination $targetManifest -Force -ErrorAction Stop
                $status.copied += $dump.Name
                $status.verified += 1
            } finally { Remove-Item -LiteralPath $staging -Force -ErrorAction SilentlyContinue }
        } catch { $status.failed += "$($dump.Name): $($_.Exception.Message)" }
    }
    $status.result = if ($status.failed.Count -gt 0) { 'PARTIAL_FAILURE' } else { 'SUCCESS' }
} catch {
    $status.result = 'FAILED'
    $status.failed += $_.Exception.Message
} finally {
    $status.at_utc = [DateTime]::UtcNow.ToString('o')
    Save-Status
}
if ($status.result -in @('FAILED','PARTIAL_FAILURE')) { exit 1 }
