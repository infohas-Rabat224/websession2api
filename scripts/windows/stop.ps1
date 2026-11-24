$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$PidFile = Join-Path $RepoRoot "data\gateway.pid"

if (Test-Path $PidFile) {
  $GatewayPid = Get-Content $PidFile
  try {
    Stop-Process -Id ([int]$GatewayPid) -Force -ErrorAction Stop
    Write-Host "[WebSession2API] Stopped gateway process PID $GatewayPid."
  } catch {
    Write-Host "[WebSession2API] Process PID $GatewayPid was not running."
  }
  Remove-Item $PidFile -Force
} else {
  Write-Host "[WebSession2API] No gateway PID file found."
}
