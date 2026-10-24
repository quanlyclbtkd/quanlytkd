# Loopback demo only. No deploy and no real Firestore writes.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.\node_modules\.bin\firebase.cmd')) { throw 'Run npm.cmd ci --no-audit --no-fund first.' }
node tools/a9r13/check.mjs
if ($LASTEXITCODE -ne 0) { throw 'A9R13 offline checks failed.' }
& '.\node_modules\.bin\firebase.cmd' emulators:exec --only firestore --project demo-a9r13-attendance 'node tools/a9r13/attendance-history-write.emulator.mjs'
if ($LASTEXITCODE -ne 0) { throw 'A9R13 actual-service Emulator checks failed.' }
Write-Host 'A9R13 actual-service Emulator PASS. No deploy or real Firestore write performed.' -ForegroundColor Green
