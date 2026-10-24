param(
 [Parameter(Mandatory=$true)][string]$RollbackCandidate,
 [Parameter(Mandatory=$true)][string]$ProjectId,
 [switch]$ConfirmRollback
)
$ErrorActionPreference='Stop'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if(-not $ConfirmRollback){throw 'Phải thêm -ConfirmRollback.'}
if($ProjectId -eq 'quanly-tst' -or $ProjectId -like 'demo-*'){throw 'CẤM production/demo. Chỉ staging project riêng.'}
$proof=Get-Content (Join-Path $RollbackCandidate 'A9R10_ROLLBACK_PROOF.json') -Raw | ConvertFrom-Json
if($proof.status -ne 'PASS'){throw 'Rollback proof FAIL.'}
$config=Join-Path $RollbackCandidate 'firebase.a9r10.rollback.json'
$configJson = @{
 hosting=@{public='.';ignore=@('firebase*.json','firestore*.json','A9R10*.json','**/.*','**/node_modules/**','tools/**','handoff/**')}
 firestore=@{rules='firestore.rules';indexes='firestore.indexes.json'}
} | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($config, $configJson, $Utf8NoBom)
Push-Location $RollbackCandidate
try{
 firebase.cmd deploy --only hosting,firestore:rules --project $ProjectId --config $config
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally {Pop-Location}
Write-Host 'STAGING ROLLBACK DEPLOYED: Coach attendance re-locked.' -ForegroundColor Yellow
