param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$prototypePort = 4317
if ($env:PROTOTYPE_PORT) {
    $prototypePort = [int]$env:PROTOTYPE_PORT
}
if ($prototypePort -lt 1 -or $prototypePort -gt 65535) {
    throw 'PROTOTYPE_PORT must be between 1 and 65535.'
}
$prototypeUrl = "http://127.0.0.1:$prototypePort"
$serverPath = Join-Path $PSScriptRoot 'server.mjs'
$runtimeDirectory = Join-Path $PSScriptRoot '.runtime'

function Test-PrototypeReady {
    try {
        $health = Invoke-RestMethod -Uri "$prototypeUrl/health" -TimeoutSec 1
        return ($health.app -eq 'xingjin-prototype')
    } catch {
        return $false
    }
}

if (-not (Test-PrototypeReady)) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
        throw 'Node.js was not found. Install Node.js 20 or later, then run this launcher again.'
    }
    if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
        throw "Prototype server not found: $serverPath"
    }
    New-Item -Path $runtimeDirectory -ItemType Directory -Force | Out-Null
    $launchId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $stdoutPath = Join-Path $runtimeDirectory "$launchId.stdout.log"
    $stderrPath = Join-Path $runtimeDirectory "$launchId.stderr.log"
    $serverProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $serverPath + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    $ready = $false
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 12) {
        if (Test-PrototypeReady) { $ready = $true; break }
        $serverProcess.Refresh()
        if ($serverProcess.HasExited) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) {
        $details = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
        throw "Prototype failed to start on $prototypeUrl. Check whether the port is already occupied. $details"
    }
    [PSCustomObject]@{ processId = $serverProcess.Id; url = $prototypeUrl; serverPath = $serverPath; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDirectory "server-$prototypePort.json") -Encoding UTF8
}

Write-Host "Prototype ready: $prototypeUrl"
Write-Host 'The server runs in the background. Closing this launcher does not stop it.'
Write-Host 'After restarting Windows, run this launcher again.'
if (-not $NoBrowser) { Start-Process $prototypeUrl }
