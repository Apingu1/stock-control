$ErrorActionPreference = 'Stop'

function ConvertTo-CSharpStringLiteral {
    param([Parameter(Mandatory = $true)][string]$Value)
    return $Value.Replace('\', '\\').Replace('"', '\"')
}

function Get-EaststoneCSharpCompiler {
    $candidates = @(
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw 'The .NET Framework C# compiler (csc.exe) was not found. Windows .NET Framework 4.x is required to build the executable packages.'
}

function New-EaststoneSelfExtractingPackage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$SourceDirectory,
        [Parameter(Mandatory = $true)][string[]]$Files,
        [Parameter(Mandatory = $true)][string]$Launcher,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $sourceRoot = (Resolve-Path -LiteralPath $SourceDirectory).Path
    $outputDirectory = Split-Path -Parent $OutputPath
    if ($outputDirectory) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }

    if ($Files.Count -eq 0) {
        throw "No files were supplied for package '$Name'."
    }

    if ($Files -notcontains $Launcher) {
        throw "Launcher '$Launcher' must be included in package '$Name'."
    }

    $resolvedFiles = New-Object System.Collections.Generic.List[string]
    $seenNames = @{}
    foreach ($file in $Files) {
        if ([System.IO.Path]::IsPathRooted($file)) {
            throw "Package file names must be relative to the source directory: $file"
        }

        $candidate = Join-Path $sourceRoot $file
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            throw "Package source file is missing: $candidate"
        }

        $leaf = [System.IO.Path]::GetFileName($file)
        $leafKey = $leaf.ToLowerInvariant()
        if ($seenNames.ContainsKey($leafKey)) {
            throw "Duplicate package file name is not allowed: $leaf"
        }
        $seenNames[$leafKey] = $true
        $resolvedFiles.Add($candidate)
    }

    $compiler = Get-EaststoneCSharpCompiler
    $work = Join-Path $env:TEMP "eaststone-sfx-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $work -Force | Out-Null

    try {
        $payloadDirectory = Join-Path $work 'payload'
        New-Item -ItemType Directory -Path $payloadDirectory -Force | Out-Null

        foreach ($path in $resolvedFiles) {
            Copy-Item -LiteralPath $path -Destination (Join-Path $payloadDirectory ([System.IO.Path]::GetFileName($path))) -Force
        }

        $payloadZip = Join-Path $work 'payload.zip'
        $payloadContents = Get-ChildItem -LiteralPath $payloadDirectory -File | Select-Object -ExpandProperty FullName
        Compress-Archive -LiteralPath $payloadContents -DestinationPath $payloadZip -CompressionLevel Optimal -Force

        $launcherLiteral = ConvertTo-CSharpStringLiteral -Value ([System.IO.Path]::GetFileName($Launcher))
        $nameLiteral = ConvertTo-CSharpStringLiteral -Value $Name
        $sourcePath = Join-Path $work 'EaststoneSfx.cs'

        @"
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

internal static class EaststoneSfx
{
    private const string PackageName = "$nameLiteral";
    private const string LauncherName = "$launcherLiteral";
    private const string PayloadResourceName = "Eaststone.Payload.zip";

    [STAThread]
    private static int Main()
    {
        string extractDirectory = Path.Combine(
            Path.GetTempPath(),
            "EaststoneStockControl-" + Guid.NewGuid().ToString("N"));

        try
        {
            Directory.CreateDirectory(extractDirectory);
            string zipPath = Path.Combine(extractDirectory, "payload.zip");

            using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadResourceName))
            {
                if (input == null)
                    throw new InvalidOperationException("Embedded package payload is missing.");

                using (FileStream output = File.Create(zipPath))
                    input.CopyTo(output);
            }

            ZipFile.ExtractToDirectory(zipPath, extractDirectory);
            File.Delete(zipPath);

            string launcherPath = Path.Combine(extractDirectory, LauncherName);
            if (!File.Exists(launcherPath))
                throw new FileNotFoundException("Package launcher is missing after extraction.", launcherPath);

            var startInfo = new ProcessStartInfo
            {
                FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe",
                Arguments = "/d /c \"\"" + launcherPath + "\"\"",
                WorkingDirectory = extractDirectory,
                UseShellExecute = false,
                CreateNoWindow = false,
                WindowStyle = ProcessWindowStyle.Normal
            };

            using (Process process = Process.Start(startInfo))
            {
                if (process == null)
                    throw new InvalidOperationException("The package launcher could not be started.");
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                PackageName + " could not run.\r\n\r\n" + ex.Message,
                "Eaststone Stock Control",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            try
            {
                if (Directory.Exists(extractDirectory))
                    Directory.Delete(extractDirectory, true);
            }
            catch
            {
                // Best-effort cleanup only. Installation status is determined by
                // the launcher exit code, not by temporary-folder cleanup.
            }
        }
    }
}
"@ | Set-Content -LiteralPath $sourcePath -Encoding UTF8

        $references = @(
            (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\System.IO.Compression.dll'),
            (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\System.IO.Compression.FileSystem.dll'),
            (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\System.Windows.Forms.dll')
        )

        if (-not (Test-Path -LiteralPath $references[0])) {
            $references = @(
                (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\System.IO.Compression.dll'),
                (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\System.IO.Compression.FileSystem.dll'),
                (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\System.Windows.Forms.dll')
            )
        }

        foreach ($reference in $references) {
            if (-not (Test-Path -LiteralPath $reference)) {
                throw "Required .NET Framework assembly was not found: $reference"
            }
        }

        Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue

        $compilerArgs = @(
            '/nologo',
            '/target:winexe',
            '/optimize+',
            "/out:$OutputPath",
            "/resource:$payloadZip,Eaststone.Payload.zip",
            "/reference:$($references[0])",
            "/reference:$($references[1])",
            "/reference:$($references[2])",
            $sourcePath
        )

        & $compiler @compilerArgs
        if ($LASTEXITCODE -ne 0) {
            throw "C# package compiler failed for '$Name' with exit code $LASTEXITCODE."
        }

        if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
            throw "Package compiler did not create: $OutputPath"
        }

        if ((Get-Item -LiteralPath $OutputPath).Length -le 0) {
            throw "Package compiler created an empty executable: $OutputPath"
        }

        Write-Host "Created Windows package: $OutputPath"
    }
    finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
