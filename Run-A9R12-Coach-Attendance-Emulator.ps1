# A9R12 TEST ONLY - local Firestore Emulator. Never writes production.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.\node_modules\.bin\firebase.cmd')) {
  throw 'Chay npm.cmd ci truoc. Firebase Emulator dependencies are required.'
}
node tools/a9r12/attendance-query-closure.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'A9R12 query-closure offline checks failed.' }
node tools/a9r12/coach-attendance-operational.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'A9R12 offline operational checks failed.' }
& '.\node_modules\.bin\firebase.cmd' emulators:exec --only firestore --project demo-a9r12-coach-attendance 'node tools/a9r11/coach-attendance-operational.emulator.mjs'
if ($LASTEXITCODE -ne 0) { throw 'A9R12 Firestore Emulator acceptance failed.' }
Write-Host 'A9R12 Coach Attendance Query + Emulator PASS. TEST ONLY; nothing deployed.' -ForegroundColor Green
