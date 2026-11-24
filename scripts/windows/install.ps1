param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

if ($ExtensionId -notmatch '^[a-p]{32}$') {
  throw "Invalid Chrome Extension ID '$ExtensionId'. Expected 32 lowercase characters a-p."
}

$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$HostScript = Join-Path $RepoRoot "apps\native-host\dist\host.js"
$LauncherBat = Join-Path $RepoRoot "apps\native-host\dist\websession2api-host.bat"
$ManifestPath = Join-Path $RepoRoot "apps\native-host\dist\com.websession2api.host.json"

Write-Host "[WebSession2API] Installing dependencies and building all targets..."
Push-Location $RepoRoot
npm install
npm run build:all
Pop-Location

$NodePath = (Get-Command node).Source
"@echo off`r`n`"$NodePath`" `"$HostScript`"" | Set-Content -Path $LauncherBat -Encoding ASCII

$ManifestObj = @{
  name = "com.websession2api.host"
  description = "WebSession2API Local Native Messaging Host"
  path = $LauncherBat
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$ManifestObj | ConvertTo-Json -Depth 4 | Set-Content -Path $ManifestPath -Encoding UTF8

$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.websession2api.host"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(Default)" -Value $ManifestPath

Write-Host "[WebSession2API] Registered Chrome Native Messaging host at $RegPath"
Write-Host "[WebSession2API] Next step: run .\scripts\windows\start.ps1"
