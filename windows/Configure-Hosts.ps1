param(
    [Parameter(Mandatory = $true)][string]$Hostname,
    [string]$IpAddress,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$backupPath = "$hostsPath.eaststone-backup"

if (-not (Test-Path $hostsPath)) {
    throw "Windows hosts file was not found at $hostsPath"
}

if (-not (Test-Path $backupPath)) {
    Copy-Item $hostsPath $backupPath -Force
}

$escaped = [regex]::Escape($Hostname)
$lines = Get-Content -LiteralPath $hostsPath -ErrorAction Stop
$kept = foreach ($line in $lines) {
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
}

if (-not $Remove) {
    if ([string]::IsNullOrWhiteSpace($IpAddress)) {
        throw 'IpAddress is required unless -Remove is used.'
    }
    $kept += "$IpAddress`t$Hostname`t# Eaststone Stock Control"
}

$temp = Join-Path $env:TEMP "eaststone-hosts-$([guid]::NewGuid().ToString('N')).tmp"
$kept | Set-Content -LiteralPath $temp -Encoding ascii
Copy-Item -LiteralPath $temp -Destination $hostsPath -Force
Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue

ipconfig /flushdns | Out-Null
if ($Remove) {
    Write-Host "Removed hosts entry for $Hostname"
} else {
    Write-Host "Configured hosts entry: $IpAddress $Hostname"
}
