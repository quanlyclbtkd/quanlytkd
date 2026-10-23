param(
 [Parameter(Mandatory=$true)][string]$FleetJson,
 [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/build-device-kit.mjs $FleetJson $OutputDirectory
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "DEVICE KIT READY: $OutputDirectory" -ForegroundColor Green
Write-Host 'Các snippet chỉ đọc IndexedDB legacy. Journal/localStorage backup vẫn phải dùng grant legacy-device-backup hiện có.' -ForegroundColor Yellow
