param(
 [Parameter(Mandatory=$true)][string]$ActiveCandidate,
 [Parameter(Mandatory=$true)][string]$ProjectId,
 [switch]$ConfirmStagingCutoverDeploy
)
$ErrorActionPreference='Stop'
if(-not $ConfirmStagingCutoverDeploy){throw 'Phải thêm -ConfirmStagingCutoverDeploy.'}
if($ProjectId -eq 'quanly-tst' -or $ProjectId -like 'demo-*'){throw 'CẤM production/demo. Chỉ staging project riêng.'}
$proof=Get-Content (Join-Path $ActiveCandidate 'CUTOVER_PROOF.json') -Raw | ConvertFrom-Json
if($proof.status -ne 'STAGING_CANDIDATE_VERIFIED_NOT_DEPLOYED' -or $proof.plan.projectId -ne $ProjectId){throw 'Active candidate proof không khớp staging project.'}
$config=Join-Path $ActiveCandidate 'firebase.a9r10.active.json'
@{
 hosting=@{public='.';ignore=@('firebase*.json','firestore*.json','CUTOVER_PROOF.json','A9R10*.json','**/.*','**/node_modules/**','tools/**','handoff/**')}
 firestore=@{rules='firestore.rules';indexes='firestore.indexes.json'}
} | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $config
Push-Location $ActiveCandidate
try{
 firebase.cmd deploy --only hosting,firestore:rules --project $ProjectId --config $config
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally {Pop-Location}
Write-Host 'ACTIVE COACH ATTENDANCE DEPLOYED TO STAGING ONLY.' -ForegroundColor Green
