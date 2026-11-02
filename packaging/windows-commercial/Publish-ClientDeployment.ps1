#requires -Version 5.1
<#
    Publish verified StkFlo client settings to the exact originating release.
    Run under the original Windows account with access to N:/UNC; do not elevate.
    The installed VM's deployment/server-config.ini is authoritative, not the
    empty client-config.ini shipped as a commercial release template.
    The only certificate ever copied is the public CA certificate (.crt).
#>
param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'

function Read-Settings([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required server settings file is missing: $Path"
    }
    foreach ($line in Get-Content -LiteralPath $Path -ErrorAction Stop) {
        if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
            $values[$matches[1].Trim()] = $matches[2].Trim().Trim('"')
        }
    }
    return $values
}

function Assert-FileHash([string]$Source, [string]$Destination) {
    $expected = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
    $actual = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
    if ($expected -ne $actual) {
        throw "Publication integrity check failed for $(Split-Path -Leaf $Destination)."
    }
}

try {
    $InstallRoot = (Resolve-Path -LiteralPath $InstallRoot -ErrorAction Stop).Path
    $localClient = Join-Path $InstallRoot 'client-deployment'
    $serverCaPath = Join-Path $InstallRoot 'infra\certs\stock-control-ca.crt'
    $serverConfigPath = Join-Path $InstallRoot 'deployment\server-config.ini'
    $localConfigPath = Join-Path $localClient 'client-config.ini'
    $localCaPath = Join-Path $localClient 'stock-control-ca.crt'

    if (-not (Test-Path -LiteralPath $localClient -PathType Container)) {
        throw "Installed server's client-deployment directory is missing."
    }
    foreach ($file in @($serverCaPath, $serverConfigPath)) {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
            throw "The installed server is not ready to publish client files: $file"
        }
    }

    $server = Read-Settings $serverConfigPath
    foreach ($field in @('TLS_HOSTNAME', 'SERVER_IP', 'APP_HTTPS_PORT')) {
        if ([string]::IsNullOrWhiteSpace($server[$field])) {
            throw "Installed server configuration has no $field. Run the server HTTPS setup first."
        }
    }
    if ($server['TLS_HOSTNAME'] -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$') {
        throw 'Installed server configuration contains an invalid TLS hostname.'
    }
    $address = $null
    if (-not [System.Net.IPAddress]::TryParse($server['SERVER_IP'], [ref]$address) -or
        $address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw 'Installed server configuration contains an invalid server IPv4 address.'
    }
    $port = 0
    if (-not [int]::TryParse($server['APP_HTTPS_PORT'], [ref]$port) -or
        $port -lt 1 -or $port -gt 65535) {
        throw 'Installed server configuration contains an invalid HTTPS port.'
    }

    $ca = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($serverCaPath)
    if ($ca.NotAfter -le (Get-Date)) {
        throw 'The server public CA certificate has expired.'
    }

    # Do not create a new client distribution at another path silently.
    # The caller passes the CLIENT DEPLOYMENT folder from the precise root
    # where 01 - INSTALL SERVER.bat was originally launched.
    if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
        throw "Original shared CLIENT DEPLOYMENT folder was not found: $Destination"
    }
    $Destination = (Resolve-Path -LiteralPath $Destination -ErrorAction Stop).Path
    foreach ($name in @('01 - INSTALL CLIENT.bat', '02 - UNINSTALL CLIENT.bat',
                        'Configure-Hosts.ps1', 'client-config.ini', 'README.txt', 'stkflo.ico')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Destination $name) -PathType Leaf)) {
            throw "Original commercial CLIENT DEPLOYMENT folder is incomplete: $name"
        }
    }

    $ready = Join-Path $Destination 'STKFLO_CLIENT_DEPLOYMENT_READY.txt'
    # A previous marker must never survive an unsuccessful re-publication.
    if (Test-Path -LiteralPath $ready -PathType Leaf) {
        Remove-Item -LiteralPath $ready -Force -ErrorAction Stop
    }

    # ESC_SERVER_SETUP_WINDOWS.bat writes the installed client files while
    # elevated. Verify them here; the user who has N: mapped may have only READ
    # permission to C:\ProgramData\StkFlo\Server and must not need elevation.
    foreach ($localFile in @($localConfigPath, $localCaPath)) {
        if (-not (Test-Path -LiteralPath $localFile -PathType Leaf)) {
            throw "Elevated server setup did not generate client file: $localFile"
        }
    }
    $installedSettings = Read-Settings $localConfigPath
    foreach ($field in @('TLS_HOSTNAME', 'SERVER_IP', 'APP_HTTPS_PORT')) {
        if ($installedSettings[$field] -ne $server[$field]) {
            throw "Installed VM client settings do not match the recorded server $field. Re-run server setup before publication."
        }
    }
    Assert-FileHash -Source $serverCaPath -Destination $localCaPath

    # Copy the already-finalised VM configuration into the originating N:/UNC
    # release folder without requiring elevation or touching private key files.
    $sharedConfigPath = Join-Path $Destination 'client-config.ini'
    $sharedCaPath = Join-Path $Destination 'stock-control-ca.crt'
    Copy-Item -LiteralPath $localConfigPath -Destination $sharedConfigPath -Force -ErrorAction Stop
    Copy-Item -LiteralPath $localCaPath -Destination $sharedCaPath -Force -ErrorAction Stop
    Assert-FileHash -Source $localConfigPath -Destination $sharedConfigPath
    Assert-FileHash -Source $serverCaPath -Destination $sharedCaPath

    $sharedSettings = Read-Settings $sharedConfigPath
    foreach ($field in @('TLS_HOSTNAME', 'SERVER_IP', 'APP_HTTPS_PORT')) {
        if ($sharedSettings[$field] -ne $server[$field]) {
            throw "Shared client configuration does not match the VM's $field."
        }
    }
    $sharedCa = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($sharedCaPath)
    if ($sharedCa.Thumbprint -ne $ca.Thumbprint) {
        throw 'Shared client public CA thumbprint does not match the installed server CA.'
    }

    $readyText = @(
        'StkFlo CLIENT DEPLOYMENT - READY',
        ('Published UTC: {0}' -f (Get-Date).ToUniversalTime().ToString('o')),
        ('Server hostname: {0}' -f $server['TLS_HOSTNAME']),
        ('Server IPv4: {0}' -f $server['SERVER_IP']),
        ('HTTPS port: {0}' -f $server['APP_HTTPS_PORT']),
        ('Public CA thumbprint: {0}' -f $ca.Thumbprint),
        'Public CA only; private keys remain on the Windows VM.'
    )
    [System.IO.File]::WriteAllLines($ready, $readyText, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "Installed VM client files verified: $localClient"
    Write-Host "Original release client files published: $Destination"
    Write-Host "Published server address: $($server['SERVER_IP'])"
    Write-Host "Public CA thumbprint: $($ca.Thumbprint)"
    Write-Host 'Publication verified; shared client installer is ready.'
    exit 0
} catch {
    [Console]::Error.WriteLine("ERROR: StkFlo client publication failed: $($_.Exception.Message)")
    exit 1
}
