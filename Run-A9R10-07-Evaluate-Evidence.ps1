param(
 [Parameter(Mandatory=$true)][string]$EvidencePackage,
 [Parameter(Mandatory=$true)][string]$OutputReport,
 [Parameter(Mandatory=$true)][string]$OwnerPublicKey,
 [Parameter(Mandatory=$true)][string]$PinnedPublicKeySHA256
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/evidence-closure.mjs $EvidencePackage $OutputReport $OwnerPublicKey $PinnedPublicKeySHA256
$code=$LASTEXITCODE
if($code -eq 0){Write-Host 'S01 + JOURNAL STAGING EVIDENCE PASS (NOT RELEASE)' -ForegroundColor Green}else{Write-Host 'EVIDENCE HOLD - xem report để xử lý đúng vấn đề còn lại.' -ForegroundColor Yellow}
exit $code
