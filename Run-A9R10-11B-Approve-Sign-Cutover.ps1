param(
 [Parameter(Mandatory=$true)][string]$CutoverReview,
 [Parameter(Mandatory=$true)][string]$PrivateKey,
 [Parameter(Mandatory=$true)][string]$OutputSignedApproval
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$approved=[System.IO.Path]::ChangeExtension($OutputSignedApproval,'.approved.json')
$confirm=Read-Host 'Gõ chính xác APPROVE_STAGING_COACH_CUTOVER để mở Coach attendance CHỈ trên staging'
if($confirm -ne 'APPROVE_STAGING_COACH_CUTOVER'){throw 'Không phê duyệt staging cutover.'}
node tools/a9r10/approve-cutover.mjs $CutoverReview $approved $confirm
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
node tools/v11r3/sign-envelope.mjs $approved $PrivateKey $OutputSignedApproval
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "SIGNED STAGING CUTOVER APPROVAL: $OutputSignedApproval" -ForegroundColor Green
