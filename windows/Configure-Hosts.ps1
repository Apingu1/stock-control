param(
    [Parameter(Mandatory = $true)][string]$Hostname,
    [string]$IpAddress,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$backupPath = "$hostsPath.stkflo-backup"

if (-not (Test-Path $hostsPath)) {
    throw "Windows hosts file was not found at $hostsPath"
}

if (-not (Test-Path $backupPath)) {
    Copy-Item $hostsPath $backupPath -Force
}

$lines = Get-Content -LiteralPath $hostsPath -ErrorAction Stop
$kept = @(foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith('#') -or $trimmed.Length -eq 0) {
        $line
        continue
    }

    $content = ($line -split '#', 2)[0]
    $tokens = $content -split '\s+' | Where-Object { $_ }
    if ($tokens -contains $Hostname) {
        continue
    }
    $line
})

if (-not $Remove) {
    if ([string]::IsNullOrWhiteSpace($IpAddress)) {
        throw 'IpAddress is required unless -Remove is used.'
    }
    $kept += "$IpAddress`t$Hostname`t# StkFlo"
}

# Stage beside the Windows hosts file, avoiding profile TEMP directories which
# may be redirected or unavailable under an elevated installer account.
# Never treat failure to remove a leftover staging file as a failed install.
$temp = Join-Path (Split-Path -Parent $hostsPath) ("stkflo-hosts-{0}.tmp" -f [guid]::NewGuid().ToString('N'))
try {
    $kept | Set-Content -LiteralPath $temp -Encoding ascii -ErrorAction Stop
    Copy-Item -LiteralPath $temp -Destination $hostsPath -Force -ErrorAction Stop
} finally {
    try {
        if (Test-Path -LiteralPath $temp -PathType Leaf) {
            Remove-Item -LiteralPath $temp -Force -ErrorAction Stop
        }
    } catch {
        Write-Warning ("StkFlo hosts temporary-file cleanup was skipped: " + $_.Exception.Message)
    }
}

ipconfig /flushdns | Out-Null
if ($Remove) {
    Write-Host "Removed hosts entry for $Hostname"
} else {
    Write-Host "Configured hosts entry: $IpAddress $Hostname"
}
