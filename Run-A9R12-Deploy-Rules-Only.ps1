param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][string]$ConfirmText
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$expected='1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3'
$actual=(Get-FileHash .\firestore.rules -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual -ne $expected){throw "A9R12 firestore.rules SHA256 mismatch: $actual"}
if($ConfirmText -ne 'DEPLOY A9R12 COACH ATTENDANCE RULES'){throw 'Confirmation text mismatch. No deploy performed.'}
if([string]::IsNullOrWhiteSpace($ProjectId) -or $ProjectId -like 'demo-*'){throw 'Real Firebase projectId required; demo-* is Emulator only.'}
if(!(Get-Command firebase.cmd -ErrorAction SilentlyContinue)){throw 'firebase.cmd not found.'}
Write-Host "About to deploy FIRESTORE RULES ONLY to: $ProjectId" -ForegroundColor Yellow
Write-Host "Rules SHA256: $actual" -ForegroundColor Yellow
& firebase.cmd deploy --only firestore:rules --project $ProjectId --non-interactive
if($LASTEXITCODE -ne 0){throw 'Firebase Rules deploy failed.'}
Write-Host 'A9R12 Firestore Rules deployment completed. Hosting/source was NOT deployed by this script.' -ForegroundColor Green
