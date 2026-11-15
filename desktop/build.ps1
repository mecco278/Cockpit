param([string]$RuntimeArchive, [string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$electronVersion = '45.3.3'
$runtimeFile = "electron-v$electronVersion-win32-x64.zip"
# Official Electron release SHA-256; also published in the electron npm tarball.
$expected = '49dd2d3875944f08de03d34595cd30093c588b9edcabb41a0ac481028a3a5a8a'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$prototype = Join-Path $workspace 'prototype'
$runtime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (-not $RuntimeArchive) {
    $RuntimeArchive = Join-Path $runtime $runtimeFile
    if (-not (Test-Path -LiteralPath $RuntimeArchive) -or (Get-FileHash -LiteralPath $RuntimeArchive -Algorithm SHA256).Hash -ne $expected) {
        $download = Join-Path $runtime "$runtimeFile.download"
        curl.exe -fLsS --connect-timeout 20 --max-time 600 -o $download "https://github.com/electron/electron/releases/download/v$electronVersion/$runtimeFile"
        if ($LASTEXITCODE -ne 0) { throw 'Could not download the official Electron runtime. Supply an already downloaded archive with -RuntimeArchive.' }
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $expected) { throw 'Electron download checksum mismatch.' }
        [System.IO.File]::Copy($download, $RuntimeArchive, $true)
    }
}
$RuntimeArchive = (Resolve-Path -LiteralPath $RuntimeArchive).Path
if ((Get-FileHash -LiteralPath $RuntimeArchive -Algorithm SHA256).Hash -ne $expected) { throw 'Electron archive checksum mismatch.' }

$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$folder = "Cockpit-$($manifest.version)-win-x64"
$dist = if ($OutputDirectory) { $OutputDirectory } else { Join-Path $workspace 'dist' }
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$dist = (Resolve-Path -LiteralPath $dist).Path
$out = Join-Path $dist $folder
if (Test-Path -LiteralPath $out) { throw "Output already exists: $out. Move that build aside or change the desktop version before rebuilding." }
$stage = Join-Path $dist ('.stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
tar.exe -xf $RuntimeArchive -C $stage
if ($LASTEXITCODE -ne 0) { throw 'Unable to extract the runtime.' }
Rename-Item -LiteralPath (Join-Path $stage 'electron.exe') -NewName 'Cockpit.exe'
$appRoot = Join-Path $stage 'resources\app'
$mainRoot = Join-Path $appRoot 'desktop'
$uiRoot = Join-Path $appRoot 'prototype'
New-Item -ItemType Directory -Path $mainRoot,$uiRoot -Force | Out-Null
foreach ($name in @('main.mjs','preload.cjs','workspace-store.mjs')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $mainRoot }
foreach ($name in @('index.html','app.js','desktop-repository.js','model.js','workspace.js','dates.js','graph.js','views-v3.js','styles.css','refinements.css','evolution.css','favicon.svg')) { Copy-Item -LiteralPath (Join-Path $prototype $name) -Destination $uiRoot }
$appManifest = [ordered]@{ name = 'cockpit-desktop'; productName = 'Cockpit'; version = $manifest.version; private = $true; type = 'module'; main = 'desktop/main.mjs' }
$json = ConvertTo-Json -InputObject $appManifest
[System.IO.File]::WriteAllText((Join-Path $appRoot 'package.json'), $json, [System.Text.UTF8Encoding]::new($false))
$stage = (Resolve-Path -LiteralPath $stage).Path
if ((Split-Path -Parent $stage) -ne $dist -or (Split-Path -Parent $out) -ne $dist) { throw 'Output paths are outside the build folder.' }
Rename-Item -LiteralPath $stage -NewName $folder
Write-Output (Join-Path $out 'Cockpit.exe')
