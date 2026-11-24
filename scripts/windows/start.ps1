$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$PidFile = Join-Path $RepoRoot "data\gateway.pid"

New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "data") | Out-Null

if (-not $env:WEBSESSION2API_HOST) { $env:WEBSESSION2API_HOST = "127.0.0.1" }
if (-not $env:WEBSESSION2API_PORT) { $env:WEBSESSION2API_PORT = "8787" }

Write-Host "[WebSession2API] Starting local loopback API gateway on http://$($env:WEBSESSION2API_HOST):$($env:WEBSESSION2API_PORT)..."
$Proc = Start-Process -FilePath "npm" -ArgumentList "run", "gateway" -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden
$Proc.Id | Set-Content -Path $PidFile -Encoding ASCII

Write-Host "[WebSession2API] Gateway started (PID $($Proc.Id)). Run 'npm run dev' to launch the dashboard on http://127.0.0.1:3000"
