param(
    [Parameter(Mandatory = $true)][string]$ClientPackageDirectory,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ClientPackageDirectory = (Resolve-Path -LiteralPath $ClientPackageDirectory).Path
if (-not $OutputPath) {
    $OutputPath = Join-Path $ClientPackageDirectory 'ESC Client Setup.exe'
}

$required = @(
    'ESC_CLIENT_SETUP_WINDOWS.bat',
    'Configure-Hosts.ps1',
    'client-config.ini',
    'stock-control-ca.crt'
)
foreach ($file in $required) {
    if (-not (Test-Path (Join-Path $ClientPackageDirectory $file))) {
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

$files = @($launcherName) + $required
$strings = New-Object System.Collections.Generic.List[string]
$entries = New-Object System.Collections.Generic.List[string]
for ($index = 0; $index -lt $files.Count; $index++) {
    $key = "FILE$index"
    $entries.Add("%$key%=")
    $strings.Add("$key=`"$($files[$index])`"")
}

$sourceDirectory = $ClientPackageDirectory.TrimEnd('\') + '\'
$sedPath = Join-Path $env:TEMP "eaststone-client-$([guid]::NewGuid().ToString('N')).sed"
$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$OutputPath
FriendlyName=Eaststone Stock Control Client Setup
AppLaunched=$launcherName
PostInstallCmd=<None>
AdminQuietInstCmd=$launcherName
UserQuietInstCmd=$launcherName
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$sourceDirectory
[SourceFiles0]
$($entries -join "`r`n")
[Strings]
$($strings -join "`r`n")
"@
$sed | Set-Content -LiteralPath $sedPath -Encoding ascii

try {
    & "$env:SystemRoot\System32\iexpress.exe" /N $sedPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $OutputPath)) {
        throw 'IExpress did not create ESC Client Setup.exe.'
    }
    Write-Host "Created customer-specific client installer: $OutputPath"
} finally {
    Remove-Item -LiteralPath $sedPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $launcherPath -Force -ErrorAction SilentlyContinue
}
