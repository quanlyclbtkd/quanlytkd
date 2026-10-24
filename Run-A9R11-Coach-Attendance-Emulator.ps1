# A9R11 TEST ONLY - local Firestore Emulator. Never writes production.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.\node_modules\.bin\firebase.cmd')) {
  throw 'Chay npm.cmd ci truoc. Firebase Emulator dependencies are required.'
}
node tools/a9r11/coach-attendance-operational.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'A9R11 offline operational checks failed.' }
& '.\node_modules\.bin\firebase.cmd' emulators:exec --only firestore --project demo-a9r11-coach-attendance 'node tools/a9r11/coach-attendance-operational.emulator.mjs'
if ($LASTEXITCODE -ne 0) { throw 'A9R11 Firestore Emulator acceptance failed.' }
Write-Host 'A9R11 Coach Attendance Emulator PASS. TEST ONLY; nothing deployed.' -ForegroundColor Green
