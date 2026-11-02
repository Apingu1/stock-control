#requires -Version 5.1
<#
  Complete an existing StkFlo commercial release's CLIENT DEPLOYMENT folder.
  Run from the original logged-in Windows VM account to preserve access to
  mapped network shares, which may disappear after UAC elevation.
  Only the public CA certificate and client connection settings leave the VM.
#>
param(
    [Parameter(Mandatory=$true)][string]$InstallRoot,
    [Parameter(Mandatory=$true)][string]$Destination
)

$ErrorActionPreference = 'Stop'

function Read-Settings([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required settings file is missing: $Path"
    }
    foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
        if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
            $values[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    return $values
}

try {
    $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot -ErrorAction Stop).Path
    $source = Join-Path $InstallRoot 'client-deployment'
    $caPath = Join-Path $source 'stock-control-ca.crt'
    $serverCaPath = Join-Path $InstallRoot 'infra\certs\stock-control-ca.crt'
    $configPath = Join-Path $source 'client-config.ini'
    $serverConfigPath = Join-Path $InstallRoot 'deployment\server-config.ini'

    foreach ($file in @($caPath, $serverCaPath, $configPath, $serverConfigPath)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
            throw "Server installation has not finalised a required client file: $file"
        }
    }

    $clientConfig = Read-Settings $configPath
    $serverConfig = Read-Settings $serverConfigPath
    foreach ($field in @('TLS_HOSTNAME', 'SERVER_IP', 'APP_HTTPS_PORT')) {
        if ([string]::IsNullOrWhiteSpace($clientConfig[$field])) {
            throw "The generated client configuration is missing $field."
        }
    }
    foreach ($field in @('TLS_HOSTNAME', 'SERVER_IP')) {
        if ($clientConfig[$field] -ne $serverConfig[$field]) {
            throw "Client $field does not match the installed server's recorded configuration."
        }
    }
    $address = $null
    if (-not [System.Net.IPAddress]::TryParse($clientConfig['SERVER_IP'], [ref]$address) -or
        $address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw 'Client configuration has an invalid server IPv4 address.'
    }
    $port = 0
    if (-not [int]::TryParse($clientConfig['APP_HTTPS_PORT'], [ref]$port) -or
        $port -lt 1 -or $port -gt 65535) {
        throw 'Client configuration has an invalid HTTPS port.'
    }

    $serverCa = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($serverCaPath)
    $clientCa = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($caPath)
    if ($serverCa.Thumbprint -ne $clientCa.Thumbprint) {
        throw 'The client public CA certificate does not match the installed server private CA.'
    }
    if ($clientCa.NotAfter -le (Get-Date)) {
        throw 'The client CA certificate has expired.'
    }

    if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
        throw "The original shared CLIENT DEPLOYMENT folder does not exist: $Destination"
    }
    $Destination = (Resolve-Path -LiteralPath $Destination -ErrorAction Stop).Path
    foreach ($name in @('01 - INSTALL CLIENT.bat', '02 - UNINSTALL CLIENT.bat',
                        'Configure-Hosts.ps1', 'client-config.ini', 'README.txt', 'stkflo.ico')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Destination $name) -PathType Leaf)) {
            throw "Incomplete commercial release; required client template file is missing: $name"
        }
    }

    $ready = Join-Path $Destination 'STKFLO_CLIENT_DEPLOYMENT_READY.txt'
    if (Test-Path -LiteralPath $ready) {
        Remove-Item -LiteralPath $ready -Force -ErrorAction Stop
    }

    foreach ($name in @('client-config.ini', 'stock-control-ca.crt')) {
        $from = Join-Path $source $name
        $to = Join-Path $Destination $name
        Copy-Item -LiteralPath $from -Destination $to -Force -ErrorAction Stop
        $expected = (Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash
        $actual = (Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash
        if ($expected -ne $actual) {
            throw "Client publication integrity check failed for $name."
        }
    }

    $lines = @(
        'StkFlo CLIENT DEPLOYMENT - READY',
        ('Published UTC: {0}' -f (Get-Date).ToUniversalTime().ToString('o')),
        ('Server hostname: {0}' -f $clientConfig['TLS_HOSTNAME']),
        ('Server IPv4: {0}' -f $clientConfig['SERVER_IP']),
        ('HTTPS port: {0}' -f $clientConfig['APP_HTTPS_PORT']),
        ('Public CA thumbprint: {0}' -f $clientCa.Thumbprint),
        'Only public certificate material is distributed; server private keys remain on the VM.'
    )
    [System.IO.File]::WriteAllLines($ready, $lines, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Published public CA and verified client settings to: $Destination"
    Write-Host "Target: https://$($clientConfig['TLS_HOSTNAME'])/ ($($clientConfig['SERVER_IP']))"
    Write-Host "Public CA thumbprint: $($clientCa.Thumbprint)"
    Write-Host 'READY marker written. Client workstations can now use the shared installer.'
    exit 0
} catch {
    Write-Error ("StkFlo client publication failed: " + $_.Exception.Message)
    exit 1
}
