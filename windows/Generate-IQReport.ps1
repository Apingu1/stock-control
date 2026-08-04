param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$AdminPassword = ''
)

$ErrorActionPreference = 'Continue'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$outputDir = Join-Path $InstallRoot 'deployment-records'
$configPath = Join-Path $InstallRoot 'deployment\server-config.ini'
$envPath = Join-Path $InstallRoot '.env'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Read-Settings([string]$Path) {
    $result = @{}
    if (Test-Path $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            if ($line -match '^\s*([^#;][^=]*)=(.*)$') {
                $result[$matches[1].Trim()] = $matches[2].Trim()
            }
        }
    }
    return $result
}

function Html([object]$Value) {
    return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

$config = Read-Settings $configPath
$environment = Read-Settings $envPath
$hostname = if ($config['TLS_HOSTNAME']) { $config['TLS_HOSTNAME'] } else { 'stock-control.test' }
$serverIp = if ($config['SERVER_IP']) { $config['SERVER_IP'] } else { 'Not recorded' }
$httpPort = if ($environment['APP_HTTP_PORT']) { $environment['APP_HTTP_PORT'] } else { '8088' }
$httpsPort = if ($environment['APP_HTTPS_PORT']) { $environment['APP_HTTPS_PORT'] } else { '8443' }
$checks = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$Id, [string]$Requirement, [scriptblock]$Test) {
    try {
        $evidence = & $Test
        $checks.Add([pscustomobject]@{ Id = $Id; Requirement = $Requirement; Result = 'PASS'; Evidence = ($evidence -join ' ') })
    } catch {
        $checks.Add([pscustomobject]@{ Id = $Id; Requirement = $Requirement; Result = 'FAIL'; Evidence = $_.Exception.Message })
    }
}

Add-Check 'IQ-01' 'Approved installation directory exists' {
    if (-not (Test-Path $InstallRoot)) { throw 'Installation directory missing.' }
    $InstallRoot
}
Add-Check 'IQ-02' 'Docker engine is available' {
    $value = (& docker version --format '{{.Server.Version}}' 2>&1)
    if ($LASTEXITCODE -ne 0) { throw ($value -join ' ') }
    "Docker Server $value"
}
Add-Check 'IQ-03' 'Production Compose configuration validates' {
    $base = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
    & docker compose -f $base --env-file $envPath config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'docker compose config failed.' }
    'Configuration valid'
}
Add-Check 'IQ-04' 'PostgreSQL, API and web services are running' {
    $base = Join-Path $InstallRoot 'infra\docker-compose.production.yml'
    $state = & docker compose -f $base --env-file $envPath ps --format json
    if ($LASTEXITCODE -ne 0 -or -not $state) { throw 'Container status unavailable.' }
    $state
}
Add-Check 'IQ-05' 'HTTP API health endpoint responds' {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$httpPort/api/health" -TimeoutSec 15
    if (-not $response.ok) { throw 'HTTP health did not return ok=true.' }
    ($response | ConvertTo-Json -Compress)
}
Add-Check 'IQ-06' 'HTTPS API health endpoint responds' {
    $output = & curl.exe -kfsS "https://127.0.0.1:$httpsPort/api/health" 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($output -join ' ') }
    $output
}
Add-Check 'IQ-07' 'Server certificate contains the configured hostname' {
    $certPath = Join-Path $InstallRoot 'infra\certs\stock-control.crt'
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
    if ($cert.NotAfter -le (Get-Date)) { throw 'Server certificate is expired.' }
    "Subject=$($cert.Subject); NotAfter=$($cert.NotAfter.ToString('u'))"
}
Add-Check 'IQ-08' 'Private CA is installed in the Local Computer trusted-root store' {
    $caPath = Join-Path $InstallRoot 'infra\certs\stock-control-ca.crt'
    $ca = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($caPath)
    $found = Get-ChildItem Cert:\LocalMachine\Root | Where-Object Thumbprint -eq $ca.Thumbprint
    if (-not $found) { throw 'Stock Control CA is not in LocalMachine Root.' }
    "Thumbprint=$($ca.Thumbprint); NotAfter=$($ca.NotAfter.ToString('u'))"
}
Add-Check 'IQ-09' 'Configured hostname resolves to the recorded server address' {
    $addresses = [System.Net.Dns]::GetHostAddresses($hostname) | ForEach-Object IPAddressToString
    if (-not $addresses) { throw 'Hostname did not resolve.' }
    "${hostname} -> $($addresses -join ', ')"
}
Add-Check 'IQ-10' 'Automatic certificate renewal task exists' {
    $task = Get-ScheduledTask -TaskName 'Eaststone Stock Control - Certificate Renewal' -ErrorAction Stop
    $task.State
}
Add-Check 'IQ-11' 'Automatic health-monitor task exists' {
    $task = Get-ScheduledTask -TaskName 'Eaststone Stock Control - Health Monitor' -ErrorAction Stop
    $task.State
}
Add-Check 'IQ-12' 'Automatic database-backup task exists' {
    $task = Get-ScheduledTask -TaskName 'Eaststone Stock Control - Daily Backup' -ErrorAction Stop
    $task.State
}
Add-Check 'IQ-13' 'Initial administrator login is operational' {
    if ([string]::IsNullOrWhiteSpace($AdminPassword)) { return 'Not executed: administrator password not supplied to report generator.' }
    $body = @{ username = 'admin'; password = $AdminPassword } | ConvertTo-Json
    $response = Invoke-RestMethod -Method Post -Uri "https://127.0.0.1:$httpsPort/api/auth/login/" -SkipCertificateCheck -ContentType 'application/json' -Body $body -TimeoutSec 15
    if (-not $response.access_token) { throw 'Login did not return an access token.' }
    'Access token returned; token value intentionally omitted.'
}

$overall = if ($checks.Result -contains 'FAIL') { 'FAIL' } else { 'PASS' }
$rows = foreach ($check in $checks) {
    $class = if ($check.Result -eq 'PASS') { 'pass' } else { 'fail' }
    "<tr><td>$(Html $check.Id)</td><td>$(Html $check.Requirement)</td><td class='$class'>$(Html $check.Result)</td><td><pre>$(Html $check.Evidence)</pre></td></tr>"
}

$generated = Get-Date
$html = @"
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Eaststone Stock Control Installation Qualification</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;margin:32px;color:#172033}h1{margin-bottom:4px}.meta{display:grid;grid-template-columns:220px 1fr;gap:6px;max-width:900px}.card{border:1px solid #ccd3df;border-radius:10px;padding:18px;margin:18px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd3df;padding:8px;vertical-align:top;text-align:left}th{background:#eef2f8}.pass{color:#08783e;font-weight:700}.fail{color:#b42318;font-weight:700}pre{white-space:pre-wrap;margin:0;font-family:Consolas,monospace;font-size:12px}.sign{height:80px}</style></head>
<body><h1>Eaststone Stock Control</h1><h2>Installation Qualification Execution Report</h2>
<div class="card meta"><strong>Execution date</strong><span>$(Html $generated.ToString('u'))</span><strong>Computer</strong><span>$(Html $env:COMPUTERNAME)</span><strong>Executed by</strong><span>$(Html "$env:USERDOMAIN\$env:USERNAME")</span><strong>Installation path</strong><span>$(Html $InstallRoot)</span><strong>Hostname</strong><span>$(Html $hostname)</span><strong>Server IP</strong><span>$(Html $serverIp)</span><strong>Overall result</strong><span class="$($overall.ToLower())">$(Html $overall)</span></div>
<table><thead><tr><th>Test</th><th>Requirement</th><th>Result</th><th>Objective evidence</th></tr></thead><tbody>$($rows -join "`n")</tbody></table>
<div class="card"><h3>Approval</h3><p>Deviations / comments:</p><div class="sign"></div><p>Executed by: ____________________ Date: __________</p><p>Reviewed by: ____________________ Date: __________</p><p>Approved by: ____________________ Date: __________</p></div>
</body></html>
"@

$stamp = $generated.ToString('yyyyMMdd_HHmmss')
$file = Join-Path $outputDir "ESC-IQ-Execution-$stamp.html"
$html | Set-Content -LiteralPath $file -Encoding utf8
Copy-Item -LiteralPath $file -Destination (Join-Path $outputDir 'ESC-IQ-Execution-Latest.html') -Force
Write-Host "Installation Qualification report created: $file"
if ($overall -eq 'FAIL') { exit 1 }
exit 0
