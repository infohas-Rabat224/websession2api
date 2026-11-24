$ErrorActionPreference = "Continue"
$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.websession2api.host"

Write-Host "=== WebSession2API Windows Diagnostics ==="
Write-Host "Node version: $(node -v)"
Write-Host "npm version:  $(npm -v)"

if (Test-Path $RegPath) {
  $ManifestPath = (Get-ItemProperty -Path $RegPath)."(Default)"
  Write-Host "Native Host Registry: OK ($ManifestPath)"
} else {
  Write-Host "Native Host Registry: MISSING"
}

$ExtDist = Join-Path $RepoRoot "apps\extension\dist\manifest.json"
Write-Host "Extension Build: $(if (Test-Path $ExtDist) { 'OK' } else { 'MISSING (run npm run build:extension)' })"

$HostDist = Join-Path $RepoRoot "apps\native-host\dist\host.js"
Write-Host "Native Host Build: $(if (Test-Path $HostDist) { 'OK' } else { 'MISSING (run npm run build:native-host)' })"

try {
  $Port = if ($env:WEBSESSION2API_PORT) { $env:WEBSESSION2API_PORT } else { "8787" }
  $Resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/v1/models" -UseBasicParsing -ErrorAction SilentlyContinue
  Write-Host "Gateway Loopback Probe: HTTP $($Resp.StatusCode)"
} catch {
  Write-Host "Gateway Loopback Probe: Responded or requires Bearer key (check 'npm run gateway')"
}
