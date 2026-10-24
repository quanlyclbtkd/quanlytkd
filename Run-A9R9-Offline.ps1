# A9R9 independent source and evidence readiness checks. No Firebase connection.
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path '.\qa_results_a9r9' | Out-Null
$steps = @(
  'tools/a9r9/evidence-closure.test.mjs',
  'tools/check-root-public-parity.mjs',
  'tools/check-syntax.mjs',
  'tools/check-d1c3b7r2-attendance-entrypoints.mjs',
  'tools/check-d1c3b7r2-attendance-roster-write-guard.mjs'
)
$failed=0
foreach($step in $steps){
  Write-Host "Running $step"
  $name=[IO.Path]::GetFileNameWithoutExtension($step)
  if($step -like '*.test.mjs') { & node --test $step *>&1 | Out-File ('.\qa_results_a9r9\'+$name+'.raw.log') -Encoding utf8 }
  else { & node $step *>&1 | Out-File ('.\qa_results_a9r9\'+$name+'.raw.log') -Encoding utf8 }
  if($LASTEXITCODE -ne 0){$failed++;Write-Host "FAIL $step"} else { Write-Host "PASS $step" }
}
@{phase='A9R9';offlineSteps=5;failed=$failed;s01ServerVerified=$false;deviceFleetVerified=$false;journalAckServerVerified=$false;releaseApproved=$false;status='RELEASE_HOLD_EVIDENCE_INCOMPLETE'} | ConvertTo-Json | Set-Content '.\qa_results_a9r9\A9R9_BOUNDARIES.json' -Encoding utf8
Write-Host 'S01 + Journal fleet: RELEASE_HOLD until signed staging server and all-device evidence.'
Write-Host "Offline failed steps: $failed"
if($failed -ne 0){exit 1}
exit 0
