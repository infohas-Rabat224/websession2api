$ErrorActionPreference = "Stop"
$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.websession2api.host"

& "$PSScriptRoot\stop.ps1"

if (Test-Path $RegPath) {
  Remove-Item -Path $RegPath -Recurse -Force
  Write-Host "[WebSession2API] Removed Chrome Native Messaging registry entry."
} else {
  Write-Host "[WebSession2API] Native Messaging registry entry was not present."
}
