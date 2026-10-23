param(
 [Parameter(Mandatory=$true)][string]$CutoverReviewInput,
 [Parameter(Mandatory=$true)][string]$OutputReview
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/build-cutover-review.mjs $CutoverReviewInput $OutputReview
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "CUTOVER REVIEW DRAFT: $OutputReview" -ForegroundColor Green
