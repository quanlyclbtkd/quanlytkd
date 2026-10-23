param(
 [Parameter(Mandatory=$true)][string]$InputJson,
 [Parameter(Mandatory=$true)][string]$TargetDirectory
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if(Test-Path $TargetDirectory){ throw "TargetDirectory phải chưa tồn tại: $TargetDirectory" }
node tools/a9r10/prepare-staging.mjs $InputJson $TargetDirectory
if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }
Push-Location $TargetDirectory
try{
  npm.cmd run build:public
  if($LASTEXITCODE -ne 0){ throw 'build:public FAIL' }
  npm.cmd run check:root-public-parity
  if($LASTEXITCODE -ne 0){ throw 'root/public parity FAIL' }
} finally { Pop-Location }
Write-Host "STAGING SOURCE READY (NOT DEPLOYED): $TargetDirectory" -ForegroundColor Green
