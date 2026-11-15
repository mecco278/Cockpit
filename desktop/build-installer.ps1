param([string]$CompilerPath, [string]$RuntimeArchive)

$ErrorActionPreference = 'Stop'
if (-not $CompilerPath) {
    $compiler = Get-Command ISCC.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($compiler) {
        $CompilerPath = $compiler.Source
    } else {
        $CompilerPath = @(
            "$env:ProgramFiles\Inno Setup 7\ISCC.exe"
            "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe"
            "$env:LOCALAPPDATA\Programs\Inno Setup 7\ISCC.exe"
        ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    }
}
if (-not $CompilerPath) { throw 'Install Inno Setup 7 or specify its ISCC.exe with -CompilerPath.' }
$CompilerPath = (Resolve-Path -LiteralPath $CompilerPath).Path
if (-not (Test-Path -LiteralPath $CompilerPath -PathType Leaf)) { throw 'The Inno Setup compiler must be a file.' }

$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dist = (New-Item -ItemType Directory -Path (Join-Path $workspace 'dist') -Force).FullName
$stage = (New-Item -ItemType Directory -Path (Join-Path $dist ('.installer-' + [guid]::NewGuid().ToString('N')))).FullName
try {
    $bundleExe = & (Join-Path $PSScriptRoot 'build.ps1') -RuntimeArchive $RuntimeArchive -OutputDirectory $stage
    $bundle = Split-Path -Parent $bundleExe
    & $CompilerPath "/DAppVersion=$($manifest.version)" "/DBundleDir=$bundle" "/O$stage" (Join-Path $PSScriptRoot 'installer.iss')
    if ($LASTEXITCODE -ne 0) { throw "The Inno Setup compiler exited with code $LASTEXITCODE." }

    $name = "Cockpit-$($manifest.version)-win-x64-setup.exe"
    $setup = Join-Path $stage $name
    $hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
    $checksum = Join-Path $stage "$name.sha256"
    [System.IO.File]::WriteAllText($checksum, "$hash  $name`n", [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $setup,$checksum -Destination $dist -Force
    Get-Item -LiteralPath (Join-Path $dist $name),(Join-Path $dist "$name.sha256")
} finally {
    $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
    if ((Split-Path -Parent $resolvedStage) -eq (Resolve-Path -LiteralPath $dist).Path -and (Split-Path -Leaf $resolvedStage) -like '.installer-*') {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
