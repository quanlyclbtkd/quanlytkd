param(
 [Parameter(Mandatory=$true)][string]$AcceptanceJson,
 [Parameter(Mandatory=$true)][string]$OutputReport
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/acceptance-evaluator.mjs $AcceptanceJson $OutputReport
$code=$LASTEXITCODE
if($code -eq 0){Write-Host 'COACH STAGING ACCEPTANCE PASS (NOT PRODUCTION RELEASE)' -ForegroundColor Green}else{Write-Host 'COACH STAGING ACCEPTANCE HOLD' -ForegroundColor Yellow}
exit $code
