# Firestore + Firebase Auth EMULATOR ONLY; localhost loopback; no production data.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
$expected = (Get-Content '.\tools\a9r4\a9r3-original-rules.sha256' -Raw).Trim().ToLower()
$actual = (Get-FileHash '.\firestore.rules' -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $expected) { throw 'RULES_SHA_MISMATCH: stop' }
if (-not (Test-Path '.\node_modules\.bin\firebase.cmd')) { throw 'Install declared deps first: npm.cmd ci --no-audit --no-fund' }
if ((Get-NetTCPConnection -LocalPort 8180 -State Listen -ErrorAction SilentlyContinue) -or (Get-NetTCPConnection -LocalPort 9099 -State Listen -ErrorAction SilentlyContinue)) { throw 'Emulator port 8180 or 9099 already occupied; stop conflicting process.' }
New-Item -Type Directory '.\qa_emulator_results_a9r5' -Force | Out-Null
$log = '.\qa_emulator_results_a9r5\coach-auth-firestore.raw.log'
$env:GCLOUD_PROJECT='demo-a9r5-coach-auth'
$env:GOOGLE_CLOUD_PROJECT='demo-a9r5-coach-auth'
Write-Host 'Run against demo-a9r5-coach-auth only. Never run firebase deploy.'
# Avoid Windows PowerShell 5.1 treating SDK expected DENY stderr as a terminating exception.
$arguments = @('--config','firebase.a9r5.demo.json','emulators:exec','--only','firestore,auth','--project','demo-a9r5-coach-auth','node tools/a9r5/coach-auth-firestore-emulator.test.mjs')
$oldEAP = $ErrorActionPreference
try {
  $ErrorActionPreference='Continue'
  & '.\node_modules\.bin\firebase.cmd' @arguments *>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $log
  $exit = $LASTEXITCODE
} finally { $ErrorActionPreference=$oldEAP }
Write-Host "Emulator exit code: $exit"
if ($exit -ne 0) { throw "A9R5_EMULATOR_FAIL: $exit. Review qa_emulator_results_a9r5" }
