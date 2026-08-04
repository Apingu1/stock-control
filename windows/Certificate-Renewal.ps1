param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$RenewBeforeDays = 90
)

$ErrorActionPreference = 'Stop'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$configPath = Join-Path $InstallRoot 'deployment\server-config.ini'
$logDir = Join-Path $InstallRoot 'logs'
$logPath = Join-Path $logDir 'certificate-renewal.log'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ssK') $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
    Write-Host $line
}

function Read-Config {
    $result = @{}
    if (Test-Path $configPath) {
        foreach ($line in Get-Content -LiteralPath $configPath) {
            if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
                $result[$matches[1].Trim()] = $matches[2].Trim()
            }
        }
    }
    return $result
}

try {
    $config = Read-Config
    $hostname = if ($config['TLS_HOSTNAME']) { $config['TLS_HOSTNAME'] } else { 'stock-control.test' }
    $serverIp = if ($config['SERVER_IP']) { $config['SERVER_IP'] } else { '' }

    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker is not running; certificate renewal could not be checked.'
    }

    $mount = "$InstallRoot`:/workspace"
    $output = & docker run --rm -v $mount -w /workspace alpine:3.20 sh -c "apk add --no-cache openssl bash >/dev/null && bash ./scripts/renew_test_tls_cert.sh '$hostname' '$serverIp' '$RenewBeforeDays'" 2>&1
    foreach ($line in $output) { Write-Log ([string]$line) }
    if ($LASTEXITCODE -ne 0) {
        throw "Certificate renewal container returned exit code $LASTEXITCODE"
    }

    if (($output -join "`n") -match 'CERTIFICATE_RENEWED=1') {
        Write-Log 'A new server certificate was issued. Restarting the HTTPS web service.'
        & docker compose -f (Join-Path $InstallRoot 'infra\docker-compose.production.yml') -f (Join-Path $InstallRoot 'infra\docker-compose.production.tls.yml') --env-file (Join-Path $InstallRoot '.env') restart web 2>&1 | ForEach-Object { Write-Log ([string]$_) }
        if ($LASTEXITCODE -ne 0) { throw 'The HTTPS web service could not be restarted.' }
    }

    $rootCertPath = Join-Path $InstallRoot 'infra\certs\stock-control-ca.crt'
    if (Test-Path $rootCertPath) {
        $rootCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($rootCertPath)
        $daysRemaining = [math]::Floor(($rootCert.NotAfter.ToUniversalTime() - [datetime]::UtcNow).TotalDays)
        Write-Log "Private CA has approximately $daysRemaining day(s) remaining."
        if ($daysRemaining -lt 1825) {
            Write-Log 'WARNING: Private CA has less than five years remaining. Plan a controlled CA rollover and client deployment.'
        }
    }

    Write-Log 'Certificate renewal check completed successfully.'
    exit 0
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
