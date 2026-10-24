param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$ServerSnapshot,
 [Parameter(Mandatory=$true)][string]$OutputDraft
)
$ErrorActionPreference='Stop'
Push-Location $StagingSource
try{
 node tools/v11r3/review-pack.mjs draft-provenance $ServerSnapshot $OutputDraft
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally {Pop-Location}
Write-Host "PENDING HISTORY PROVENANCE: $OutputDraft" -ForegroundColor Green
Write-Host 'Phải review từng attendance row và gắn evidence thật trước khi approve/sign.' -ForegroundColor Yellow
