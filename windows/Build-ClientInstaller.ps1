param(
    [Parameter(Mandatory = $true)][string]$ClientPackageDirectory,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ClientPackageDirectory = (Resolve-Path -LiteralPath $ClientPackageDirectory).Path
if (-not $OutputPath) {
    $OutputPath = Join-Path $ClientPackageDirectory 'ESC Client Setup.exe'
}

$packageBuilder = Join-Path $PSScriptRoot 'Self-Extracting-Package.ps1'
if (-not (Test-Path -LiteralPath $packageBuilder)) {
    throw "Windows package builder is missing: $packageBuilder"
}
. $packageBuilder

$required = @(
    'ESC_CLIENT_SETUP_WINDOWS.bat',
    'Configure-Hosts.ps1',
    'client-config.ini',
    'stock-control-ca.crt'
)
foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $ClientPackageDirectory $file))) {
        throw "Client package file is missing: $file"
    }
}

$launcherName = 'client-setup-launcher.cmd'
$launcherPath = Join-Path $ClientPackageDirectory $launcherName
@'
@echo off
cd /d "%~dp0"
call "ESC_CLIENT_SETUP_WINDOWS.bat"
exit /b %ERRORLEVEL%
'@ | Set-Content -LiteralPath $launcherPath -Encoding ascii

try {
    $files = @($launcherName) + $required
    New-EaststoneSelfExtractingPackage `
        -Name 'Eaststone Stock Control Client Setup' `
        -SourceDirectory $ClientPackageDirectory `
        -Files $files `
        -Launcher $launcherName `
        -OutputPath $OutputPath

    Write-Host "Created customer-specific client installer: $OutputPath"
} finally {
    Remove-Item -LiteralPath $launcherPath -Force -ErrorAction SilentlyContinue
}
