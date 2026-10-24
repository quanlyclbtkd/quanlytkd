param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$CutoverProposal,
 [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/make-rollback-candidate.mjs $StagingSource $CutoverProposal $OutputDirectory
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "RESTRICTIVE ROLLBACK CANDIDATE READY, NOT DEPLOYED: $OutputDirectory" -ForegroundColor Green
