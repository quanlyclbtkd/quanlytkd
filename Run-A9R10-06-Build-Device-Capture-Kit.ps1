param(
 [Parameter(Mandatory=$true)][string]$FleetJson,
 [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/build-device-kit.mjs $FleetJson $OutputDirectory
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "DEVICE KIT READY: $OutputDirectory" -ForegroundColor Green
Write-Host 'Kit tạo 2 snippet read-only/thiết bị: current-principal Journal V3 và legacy IndexedDB queue. Nếu phát hiện V1/V2 hoặc foreign V3 thì HOLD để đối soát riêng; không replay/xóa.' -ForegroundColor Yellow
