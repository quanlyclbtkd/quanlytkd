# A9R5R2 — TEST ONLY. Both Firebase emulators use demo-a9r5-coach-auth.
# This wrapper never starts the club website or writes production.
$ErrorActionPreference='Stop'
$root=Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root
$expected=(Get-Content '.\tools\a9r4\a9r3-original-rules.sha256' -Raw).Trim().ToLower()
$actual=(Get-FileHash '.\firestore.rules' -Algorithm SHA256).Hash.ToLower()
if($actual -ne $expected){ throw 'RULES_SHA_MISMATCH: STOP. No weakening of A9R3 CAS Rules.' }
Write-Host 'STEP 1: Offline strict-realm RED->GREEN owner contract'
& node '.\tools\a9r5\r2-owner-realm-contract.test.mjs'
if($LASTEXITCODE -ne 0){ throw "R2_OFFLINE_FAIL: $LASTEXITCODE" }
Write-Host 'STEP 2: A9R5R1 harness regression'
& node '.\tools\a9r5\r1-harness-regression.test.mjs'
if($LASTEXITCODE -ne 0){ throw "R1_STATIC_FAIL: $LASTEXITCODE" }
Write-Host 'STEP 3: Real Auth + Firestore Emulator (9 business cases)'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\tools\a9r5\Run-A9R5R1-Isolated-Auth.ps1'
if($LASTEXITCODE -ne 0){ throw "A9R5R2_EMULATOR_FAIL: $LASTEXITCODE. Keep results for diagnosis." }
Write-Host 'A9R5R2 9/9 emulator acceptance: inspect qa_emulator_results_a9r5r1/isolated-auth-firestore.json'
