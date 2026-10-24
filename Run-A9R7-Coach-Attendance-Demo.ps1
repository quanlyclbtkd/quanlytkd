# TEST ONLY. Writes ONLY to a separate local DEMO project via Firestore Emulator.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.\node_modules\.bin\firebase.cmd')) {
  throw 'Chay npm.cmd ci truoc. Yeu cau Firebase Emulator duoc cai tren may.'
}
node tools/a9r7/coach-readiness-offline.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Offline readiness failed; no demo activation' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path (Split-Path $PSScriptRoot -Parent) ('A9R7_DEMO_ACTIVE_ONLY_' + $stamp)
node tools/v11r2/make-demo-active.mjs $out
if ($LASTEXITCODE -ne 0) { throw 'DEMO candidate creation failed' }
Push-Location $out
try {
  & (Join-Path $PSScriptRoot 'node_modules\.bin\firebase.cmd') emulators:exec --only firestore --project demo-v11r2-cutover 'node tools/a9r7/coach-attendance-cutover-demo.emulator.mjs'
  if ($LASTEXITCODE -ne 0) { throw 'DEMO attendance Emulator failed. Keep release HOLD' }
  New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'qa_results_a9r7') | Out-Null
  Copy-Item '.\qa_results_a9r7\coach-attendance-demo.json' (Join-Path $PSScriptRoot 'qa_results_a9r7\coach-attendance-demo.json') -Force
} finally { Pop-Location }
Write-Host 'TEST ONLY; S01/Journal cutover NOT authorized for production.'
Write-Host ('QA results: ' + (Join-Path $PSScriptRoot 'qa_results_a9r7'))
