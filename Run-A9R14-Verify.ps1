# Offline source/contract checks. No deploy or real Firestore operations.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$tests = @(
  'tools/check-attendance-canonical-ownership.mjs',
  'tools/check-security-coach-branch-boundary.mjs',
  'tools/check-coach-branch-runtime-repair.mjs',
  'tools/check-v5u2e-attendance-excel-sdk-fix.mjs',
  'tools/a9r14/profile-negative-controls.mjs',
  'tools/check-syntax.mjs'
)
foreach ($test in $tests) {
  node $test
  if ($LASTEXITCODE -ne 0) { throw "A9R14 verification failed: $test" }
}
Write-Host 'A9R14 offline checks PASS. This is source verification; no deployment performed.' -ForegroundColor Green
