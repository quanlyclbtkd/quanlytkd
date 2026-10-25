# Local demo only. No deploy and no real project writes.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.\node_modules\.bin\firebase.cmd')) { throw 'Run npm.cmd ci --no-audit --no-fund first.' }
node tools/a9r14/profile-negative-controls.mjs
if ($LASTEXITCODE -ne 0) { throw 'A9R14 source profile verification failed.' }
& '.\node_modules\.bin\firebase.cmd' emulators:exec --only firestore --project demo-a9r13-attendance 'node tools/a9r13/attendance-history-write.emulator.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Actual attendance service Emulator tests failed.' }
Write-Host 'A9R14 actual attendance service 22/22 PASS. No deployment performed.' -ForegroundColor Green
