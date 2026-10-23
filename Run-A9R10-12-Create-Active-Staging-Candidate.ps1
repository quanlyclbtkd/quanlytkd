param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$CutoverDecisionInput,
 [Parameter(Mandatory=$true)][string]$OwnerPublicKey,
 [Parameter(Mandatory=$true)][string]$PinnedPublicKeySHA256,
 [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
if(Test-Path $OutputDirectory){throw 'OutputDirectory phải chưa tồn tại.'}
Push-Location $StagingSource
try{
 $decision=Join-Path (Split-Path $CutoverDecisionInput -Parent) 'cutover-decision-bundle.json'
 node tools/a9r10/assemble-cutover-decision.mjs $CutoverDecisionInput $decision
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 node tools/v11r2/cutover.mjs validate $decision $OutputDirectory $OwnerPublicKey $PinnedPublicKeySHA256
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally {Pop-Location}
Write-Host "ACTIVE STAGING CANDIDATE CREATED, NOT DEPLOYED: $OutputDirectory" -ForegroundColor Green
