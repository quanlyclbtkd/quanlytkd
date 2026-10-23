# A9R8 read-only/local QA. NEVER authenticates to Firebase or deploys.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path '.\qa_results_a9r8' | Out-Null
$steps = @(
  'tools/a9r8/journal-readonly-audit.test.mjs',
  'tools/a9r8/journal-idb-blocked.test.mjs',
  'tools/check-root-public-parity.mjs',
  'tools/check-syntax.mjs',
  'tools/check-d1c3b7r2-attendance-entrypoints.mjs',
  'tools/check-d1c3b7r2-attendance-roster-write-guard.mjs'
)
$failed=0
foreach($step in $steps){
  Write-Host "Running $step"
  $name=[IO.Path]::GetFileNameWithoutExtension($step)
  & node $step *>&1 | Out-File -FilePath (".\qa_results_a9r8\"+$name+'.raw.log') -Encoding utf8
  if($LASTEXITCODE -ne 0){ $failed++; Write-Host "FAIL $step" }
  else { Write-Host "PASS $step" }
}
# Existing cutover-gates are hash-pinned to A9R6; a new independent source
# identity review is required for A9R8. Never silently rewrite the pin.
Write-Host 'SOURCE_IDENTITY: HOLD - A9R8 modified attendanceJournal.js; independent re-pin required'
Write-Host 'S01/JOURNAL: HOLD - server backup, device inventory, signed owner approval absent'
Write-Host "QA failed steps: $failed"
if($failed -ne 0){exit 1}
exit 0
