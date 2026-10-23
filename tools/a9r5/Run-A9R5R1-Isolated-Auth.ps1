# A9R5R1: Auth + Firestore EMULATOR ONLY, isolated acceptance. No production.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
$expected = (Get-Content '.\tools\a9r4\a9r3-original-rules.sha256' -Raw).Trim().ToLower()
$actual = (Get-FileHash '.\firestore.rules' -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $expected) { throw 'RULES_SHA_MISMATCH: STOP' }
if (-not (Test-Path '.\node_modules\.bin\firebase.cmd')) { throw 'Missing dependencies: npm.cmd ci --no-audit --no-fund' }
if ((Get-NetTCPConnection -LocalPort 8180 -State Listen -ErrorAction SilentlyContinue) -or
    (Get-NetTCPConnection -LocalPort 9099 -State Listen -ErrorAction SilentlyContinue)) { throw 'Ports 8180 or 9099 occupied' }
New-Item -ItemType Directory '.\qa_emulator_results_a9r5r1' -Force | Out-Null
$env:GCLOUD_PROJECT = 'demo-a9r5-coach-auth'
$env:GOOGLE_CLOUD_PROJECT = 'demo-a9r5-coach-auth'
$log = '.\qa_emulator_results_a9r5r1\isolated-auth-firestore.raw.log'
$arguments = @('--config','firebase.a9r5.demo.json','emulators:exec','--only','firestore,auth',
    '--project','demo-a9r5-coach-auth','node tools/a9r5/coach-auth-firestore-isolated.test.mjs')
$oldPreference=$ErrorActionPreference
try {
  # Expected PERMISSION_DENIED from negative tests must not stop Windows PS 5.1.
  $ErrorActionPreference='Continue'
  & '.\node_modules\.bin\firebase.cmd' @arguments *>&1 |
    ForEach-Object { $_.ToString() } | Tee-Object -FilePath $log
  $code=$LASTEXITCODE
} finally { $ErrorActionPreference=$oldPreference }
Write-Host "A9R5R1 isolated test exit code: $code"
if ($code -ne 0) { throw "A9R5R1_EMULATOR_FAIL: $code; see $log and isolated-auth-firestore.json" }
