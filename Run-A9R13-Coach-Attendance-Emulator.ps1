# A9R13 TEST ONLY - local Firestore Emulator. Never writes production.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.\node_modules\.bin\firebase.cmd')) { throw 'Chay npm.cmd ci truoc. Firebase Emulator dependencies are required.' }
node tools/a9r13/attendance-tx-history-closure.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'A9R13 source closure checks failed.' }
node tools/a9r13/attendance-runtime-behavior.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'A9R13 runtime mock behavior failed.' }
& '.\node_modules\.bin\firebase.cmd' emulators:exec --only firestore --project demo-a9r13-coach-attendance 'node tools/a9r13/attendance-service-emulator.mjs'
if ($LASTEXITCODE -ne 0) { throw 'A9R13 real AttendanceService Emulator acceptance failed.' }
& '.\node_modules\.bin\firebase.cmd' emulators:exec --only firestore --project demo-a9r13-coach-attendance-rules 'node tools/a9r11/coach-attendance-operational.emulator.mjs'
if ($LASTEXITCODE -ne 0) { throw 'A9R13 inherited Rules acceptance failed.' }
Write-Host 'A9R13 Coach Attendance Transaction + History PASS. TEST ONLY; nothing deployed.' -ForegroundColor Green
