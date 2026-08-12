param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $RepositoryRoot 'release\Pharmagrowth Stock Control'
}

$outputParent = Split-Path -Parent $OutputDirectory
$systemDir = Join-Path $OutputDirectory 'System'
$clientDir = Join-Path $OutputDirectory 'CLIENT DEPLOYMENT'
$adminDir = Join-Path $OutputDirectory 'Administration & Recovery'
$docsDir = Join-Path $OutputDirectory 'Documentation'
$templatesDir = Join-Path $RepositoryRoot 'packaging\windows-commercial'

New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
if (Test-Path -LiteralPath $OutputDirectory) {
    Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDirectory, $systemDir, $clientDir, $adminDir, $docsDir -Force | Out-Null

function Copy-RequiredFile {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "Required package source file is missing: $Source"
    }
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Normalize-UnixShellScripts {
    param([Parameter(Mandatory = $true)][string]$Root)

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $shellScripts = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter '*.sh'
    foreach ($script in $shellScripts) {
        $text = [System.IO.File]::ReadAllText($script.FullName)
        $normalized = $text.Replace("`r`n", "`n").Replace("`r", "`n")
        [System.IO.File]::WriteAllText($script.FullName, $normalized, $utf8NoBom)

        $bytes = [System.IO.File]::ReadAllBytes($script.FullName)
        if ($bytes -contains 13) {
            throw "Unix shell script still contains CR characters after normalization: $($script.FullName)"
        }
    }

    Write-Host "Normalized $($shellScripts.Count) Unix shell script(s) to LF line endings."
}

Write-Host 'Creating clean Pharmagrowth Stock Control commercial package...'

# Customer-facing top level.
Copy-RequiredFile (Join-Path $RepositoryRoot 'docs\windows\IT_INSTALLATION_GUIDE.txt') (Join-Path $OutputDirectory '00 - START HERE - INSTALLATION GUIDE.txt')
Copy-RequiredFile (Join-Path $templatesDir 'install-server.bat') (Join-Path $OutputDirectory '01 - INSTALL SERVER.bat')
Copy-RequiredFile (Join-Path $templatesDir 'start-server.bat') (Join-Path $OutputDirectory '02 - START SERVER.bat')
Copy-RequiredFile (Join-Path $templatesDir 'stop-server.bat') (Join-Path $OutputDirectory '03 - STOP SERVER.bat')
Copy-RequiredFile (Join-Path $templatesDir 'server-status.bat') (Join-Path $OutputDirectory '04 - SERVER STATUS.bat')

# The BAT-based client deployment is present in the commercial ZIP from the
# beginning. Server installation only injects the customer-specific server IP
# and public CA certificate; it does not build or create a client EXE.
Copy-RequiredFile (Join-Path $RepositoryRoot 'ESC_CLIENT_SETUP_WINDOWS.bat') (Join-Path $clientDir '01 - INSTALL CLIENT.bat')
Copy-RequiredFile (Join-Path $RepositoryRoot 'windows\Configure-Hosts.ps1') (Join-Path $clientDir 'Configure-Hosts.ps1')
Copy-RequiredFile (Join-Path $templatesDir 'client-deployment-readme.txt') (Join-Path $clientDir 'README.txt')
Set-Content -LiteralPath (Join-Path $clientDir 'client-config.ini') -Encoding ascii -Value @(
    'TLS_HOSTNAME=stock-control.test',
    'SERVER_IP=',
    'APP_HTTPS_PORT=8443'
)

# Administration is deliberately one level down so destructive/recovery tools
# are not presented alongside routine start/stop controls. There is exactly one
# uninstall BAT in the commercial package: 02 - COMPLETE UNINSTALL.bat.
Copy-RequiredFile (Join-Path $templatesDir 'backup-restore.bat') (Join-Path $adminDir '01 - BACKUP AND RESTORE.bat')
Copy-RequiredFile (Join-Path $templatesDir 'uninstall.bat') (Join-Path $adminDir '02 - COMPLETE UNINSTALL.bat')
Set-Content -LiteralPath (Join-Path $adminDir 'README.txt') -Encoding ascii -Value @(
    'ADMINISTRATION & RECOVERY',
    '',
    'These controls are not required for routine operation.',
    'Backup/restore should be used only by authorised administrators.',
    '02 - COMPLETE UNINSTALL.bat is the only supported uninstall control.',
    'Complete uninstall is destructive and requires explicit confirmation.'
)

# Keep the full controlled Windows documentation available without cluttering
# the package root.
Copy-Item -Path (Join-Path $RepositoryRoot 'docs\windows\*') -Destination $docsDir -Recurse -Force

# Copy only runtime/source directories required by the tested Docker deployment.
$runtimeDirectories = @('api', 'db', 'infra', 'scripts', 'web', 'windows')
foreach ($directory in $runtimeDirectories) {
    $source = Join-Path $RepositoryRoot $directory
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Required runtime directory is missing: $source"
    }
    Copy-Item -LiteralPath $source -Destination $systemDir -Recurse -Force
}

# Copy only the root BAT files that are actually required by the installed
# server runtime. Client setup and uninstall are intentionally excluded so the
# customer package does not contain duplicate controls in System.
$runtimeBatFiles = @(
    'ESC_SERVER_SETUP_WINDOWS.bat',
    'ESC_BACKUP_RESTORE_WINDOWS.bat',
    'INSTALL_WINDOWS.bat',
    'ENABLE_HTTPS_WINDOWS.bat',
    'START_WINDOWS.bat',
    'STOP_WINDOWS.bat',
    'STATUS_WINDOWS.bat',
    'RESET_ADMIN_PASSWORD_WINDOWS.bat'
)
foreach ($name in $runtimeBatFiles) {
    Copy-RequiredFile (Join-Path $RepositoryRoot $name) (Join-Path $systemDir $name)
}

# Commercial packaging/build utilities are developer tooling, not runtime.
@(
    'Build-CommercialPackage.ps1',
    'Build-Installers.ps1',
    'Build-ClientInstaller.ps1',
    'Self-Extracting-Package.ps1'
) | ForEach-Object {
    Remove-Item -LiteralPath (Join-Path $systemDir "windows\$_") -Force -ErrorAction SilentlyContinue
}

# Remove build artefacts/caches if they happen to exist in a developer checkout.
Get-ChildItem -LiteralPath $systemDir -Directory -Recurse -Force | Where-Object {
    $_.Name -in @('node_modules', '__pycache__', '.pytest_cache', 'dist')
} | Sort-Object FullName -Descending | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# The commercial package is assembled on Windows, but Docker executes *.sh
# files inside Linux containers. Normalize them explicitly so a Windows checkout
# can never introduce CRLF characters that make bash fail.
Normalize-UnixShellScripts -Root $systemDir

# Validate that no executable wrapper has slipped into the release package.
$executables = Get-ChildItem -LiteralPath $OutputDirectory -Recurse -File -Filter '*.exe'
if ($executables) {
    throw "Commercial package must not contain generated EXE files: $($executables.FullName -join ', ')"
}

$requiredTopLevel = @(
    '00 - START HERE - INSTALLATION GUIDE.txt',
    '01 - INSTALL SERVER.bat',
    '02 - START SERVER.bat',
    '03 - STOP SERVER.bat',
    '04 - SERVER STATUS.bat'
)
foreach ($name in $requiredTopLevel) {
    if (-not (Test-Path -LiteralPath (Join-Path $OutputDirectory $name) -PathType Leaf)) {
        throw "Commercial package is missing required top-level file: $name"
    }
}

$requiredClientFiles = @(
    '01 - INSTALL CLIENT.bat',
    'Configure-Hosts.ps1',
    'client-config.ini',
    'README.txt'
)
foreach ($name in $requiredClientFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $clientDir $name) -PathType Leaf)) {
        throw "CLIENT DEPLOYMENT is missing required file: $name"
    }
}

$requiredSystemFiles = @(
    'ESC_SERVER_SETUP_WINDOWS.bat',
    'INSTALL_WINDOWS.bat',
    'ENABLE_HTTPS_WINDOWS.bat',
    'START_WINDOWS.bat',
    'STOP_WINDOWS.bat',
    'STATUS_WINDOWS.bat',
    'ESC_BACKUP_RESTORE_WINDOWS.bat'
)
foreach ($name in $requiredSystemFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $systemDir $name) -PathType Leaf)) {
        throw "Commercial System folder is missing required runtime file: $name"
    }
}

foreach ($forbiddenSystemFile in @('ESC_CLIENT_SETUP_WINDOWS.bat', 'UNINSTALL_WINDOWS.bat')) {
    if (Test-Path -LiteralPath (Join-Path $systemDir $forbiddenSystemFile)) {
        throw "Duplicate customer control must not be present in System: $forbiddenSystemFile"
    }
}

$uninstallFiles = @(Get-ChildItem -LiteralPath $OutputDirectory -Recurse -File -Filter '*UNINSTALL*.bat')
if ($uninstallFiles.Count -ne 1 -or $uninstallFiles[0].Name -ne '02 - COMPLETE UNINSTALL.bat') {
    throw "Commercial package must contain exactly one uninstall BAT: Administration & Recovery\02 - COMPLETE UNINSTALL.bat"
}

$bootstrapPath = Join-Path $systemDir 'db\production-bootstrap.sh'
if (-not (Test-Path -LiteralPath $bootstrapPath -PathType Leaf)) {
    throw 'Commercial package is missing db\production-bootstrap.sh.'
}
$bootstrapBytes = [System.IO.File]::ReadAllBytes($bootstrapPath)
if ($bootstrapBytes -contains 13) {
    throw 'db\production-bootstrap.sh contains CR characters; Linux bootstrap would fail.'
}

$zipPath = Join-Path $outputParent 'Pharmagrowth-Stock-Control-Commercial-Package.zip'
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -LiteralPath $OutputDirectory -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ''
Write-Host 'Commercial package created successfully:'
Write-Host "  Folder: $OutputDirectory"
Write-Host "  ZIP:    $zipPath"
Write-Host ''
Write-Host 'Top-level IT actions:'
Get-ChildItem -LiteralPath $OutputDirectory | Select-Object Name
