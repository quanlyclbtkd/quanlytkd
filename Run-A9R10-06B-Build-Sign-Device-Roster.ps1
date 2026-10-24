param(
 [Parameter(Mandatory=$true)][string]$DeviceEvidenceMap,
 [Parameter(Mandatory=$true)][string]$PrivateKey,
 [Parameter(Mandatory=$true)][string]$OutputSignedRoster
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$draft=[System.IO.Path]::ChangeExtension($OutputSignedRoster,'.pending.json')
$approved=[System.IO.Path]::ChangeExtension($OutputSignedRoster,'.approved.json')
node tools/a9r10/build-device-roster-draft.mjs $DeviceEvidenceMap $draft
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$confirm=Read-Host 'Gõ chính xác APPROVE_DEVICE_FLEET sau khi đã kiểm tra đủ tất cả thiết bị'
if($confirm -ne 'APPROVE_DEVICE_FLEET'){throw 'Không phê duyệt device fleet.'}
node tools/a9r10/approve-device-roster.mjs $draft $approved $confirm
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
node tools/v11r3/sign-envelope.mjs $approved $PrivateKey $OutputSignedRoster
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "SIGNED DEVICE ROSTER: $OutputSignedRoster" -ForegroundColor Green
