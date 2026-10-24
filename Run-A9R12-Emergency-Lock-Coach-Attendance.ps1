param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [Parameter(Mandatory=$true)][string]$ConfirmText
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$expected='3b580a1ae181a00b0381502c8ae8887d2c90998ac3fbaa91e862022cfea48e5b'
$actual=(Get-FileHash .\firestore.rules.a9r12-emergency-lock -Algorithm SHA256).Hash.ToLowerInvariant()
if($actual -ne $expected){throw "Emergency lock Rules SHA256 mismatch: $actual"}
if($ConfirmText -ne 'LOCK COACH ATTENDANCE'){throw 'Confirmation text mismatch. No deploy performed.'}
if([string]::IsNullOrWhiteSpace($ProjectId) -or $ProjectId -like 'demo-*'){throw 'Real Firebase projectId required; demo-* is Emulator only.'}
if(!(Get-Command firebase.cmd -ErrorAction SilentlyContinue)){throw 'firebase.cmd not found.'}
$tmp=Join-Path $env:TEMP ('a9r12-lock-'+[guid]::NewGuid().ToString('N')+'.json')
try{
  $cfg=@{firestore=@{rules=(Resolve-Path .\firestore.rules.a9r12-emergency-lock).Path;indexes=(Resolve-Path .\firestore.indexes.json).Path}} | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($tmp,$cfg,(New-Object System.Text.UTF8Encoding($false)))
  & firebase.cmd deploy --only firestore:rules --project $ProjectId --config $tmp --non-interactive
  if($LASTEXITCODE -ne 0){throw 'Emergency Rules lock deploy failed.'}
  Write-Host 'Coach Attendance server gate is LOCKED. Existing attendance data was not deleted.' -ForegroundColor Green
} finally { if(Test-Path $tmp){Remove-Item $tmp -Force -ErrorAction SilentlyContinue} }
