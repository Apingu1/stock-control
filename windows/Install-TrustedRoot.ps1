param(
    [Parameter(Mandatory = $true)][string]$CertificatePath,
    [string]$ThumbprintRecordPath
)

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $CertificatePath).Path
$certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($resolved)

$store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
    [System.Security.Cryptography.X509Certificates.StoreName]::Root,
    [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
)
$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
    $existing = $store.Certificates | Where-Object { $_.Thumbprint -eq $certificate.Thumbprint }
    if (-not $existing) {
        $store.Add($certificate)
        Write-Host "Installed Stock Control CA in Local Computer Trusted Root."
    } else {
        Write-Host "Stock Control CA is already trusted on this computer."
    }
} finally {
    $store.Close()
}

if ($ThumbprintRecordPath) {
    $directory = Split-Path -Parent $ThumbprintRecordPath
    if ($directory) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    Set-Content -LiteralPath $ThumbprintRecordPath -Value $certificate.Thumbprint -Encoding ascii
}

Write-Host "Trusted certificate thumbprint: $($certificate.Thumbprint)"
