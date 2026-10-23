param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$ProjectId,
 [switch]$ConfirmStagingDeploy
)
$ErrorActionPreference='Stop'
if(-not $ConfirmStagingDeploy){throw 'Phải thêm -ConfirmStagingDeploy để deploy staging.'}
if($ProjectId -eq 'quanly-tst' -or $ProjectId -like 'demo-*'){throw 'CẤM production/demo. Chỉ staging project riêng.'}
Push-Location $StagingSource
try{
 npm.cmd run build:public
 if($LASTEXITCODE -ne 0){throw 'build:public FAIL'}
 npm.cmd run check:root-public-parity
 if($LASTEXITCODE -ne 0){throw 'parity FAIL'}
 firebase.cmd deploy --only hosting,firestore:rules,firestore:indexes --project $ProjectId
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally {Pop-Location}
$record=@{kind='A9R10_STAGING_MAINTENANCE_DEPLOY_RECORD';projectId=$ProjectId;deployedAt=(Get-Date).ToUniversalTime().ToString('o');status='PASS';scope='hosting+maintenance-rules+indexes';production=$false}
$record | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $StagingSource 'A9R10_MAINTENANCE_DEPLOYED.json')
Write-Host 'STAGING MAINTENANCE HOSTING/RULES/INDEXES DEPLOYED. Đây không phải production.' -ForegroundColor Green
