param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$PendingRequest,
 [Parameter(Mandatory=$true)][string]$PrivateKey
)
$ErrorActionPreference='Stop'
Set-Location $StagingSource
$dir=Split-Path $PendingRequest -Parent
$approved=Join-Path $dir 'approved-read-payload.json'
$signed=Join-Path $dir 'signed-read-grant.json'
$confirm=Read-Host 'Gõ chính xác APPROVE_STAGING_READ sau khi đã kiểm tra project/club/read caps'
if($confirm -ne 'APPROVE_STAGING_READ'){throw 'Không phê duyệt.'}
node tools/a9r10/approve-read-draft.mjs $PendingRequest $approved $confirm
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
node tools/v11r3/sign-envelope.mjs $approved $PrivateKey $signed
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "SIGNED STAGING READ GRANT: $signed" -ForegroundColor Green
Write-Host 'Không gửi private key. Grant chỉ có hiệu lực trong cửa sổ thời gian đã tạo.' -ForegroundColor Yellow
