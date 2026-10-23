param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$ReviewedProvenanceDraft,
 [Parameter(Mandatory=$true)][string]$PrivateKey,
 [Parameter(Mandatory=$true)][string]$OutputSigned
)
$ErrorActionPreference='Stop'
Push-Location $StagingSource
try{
 $approved=[System.IO.Path]::ChangeExtension($OutputSigned,'.approved.json')
 $confirm=Read-Host 'Gõ chính xác APPROVE_HISTORY_PROVENANCE nếu mọi row đã được kiểm chứng'
 if($confirm -ne 'APPROVE_HISTORY_PROVENANCE'){throw 'Không phê duyệt provenance.'}
 node tools/a9r10/approve-provenance.mjs $ReviewedProvenanceDraft $approved $confirm
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 node tools/v11r3/sign-envelope.mjs $approved $PrivateKey $OutputSigned
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally {Pop-Location}
Write-Host "SIGNED HISTORY PROVENANCE: $OutputSigned" -ForegroundColor Green
