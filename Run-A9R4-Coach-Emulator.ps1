$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$expected=(Get-Content 'tools/a9r4/a9r3-original-rules.sha256' -Raw).Trim().ToUpperInvariant()
$actual=(Get-FileHash '.\firestore.rules' -Algorithm SHA256).Hash
if($actual -ne $expected){throw 'Rules hash changed from A9R3. Stop: no production/deploy.'}
if(!(Test-Path '.\node_modules\.bin\firebase.cmd')){throw 'Dependencies unavailable: run npm.cmd ci on Windows first.'}
New-Item -ItemType Directory -Path '.\qa_emulator_results_a9r4' -Force | Out-Null
Write-Host 'A9R4 DEMO ONLY: Firestore Emulator; no Firebase production access'
$log=Join-Path $PSScriptRoot 'qa_emulator_results_a9r4\coach-onboarding.raw.log'
# Native stderr may include expected permission-denied; do not convert to a script failure.
$oldError=$ErrorActionPreference
$ErrorActionPreference='Continue'
try {
  & '.\node_modules\.bin\firebase.cmd' emulators:exec --project demo-a9r4-coach-onboard --only firestore 'node tools/a9r4/coach-onboarding-emulator.test.mjs' 2>&1 | Out-String -Stream | Tee-Object -FilePath $log
  $exit=$LASTEXITCODE
} finally {$ErrorActionPreference=$oldError}
if($exit -ne 0){throw "Emulator failed (exit $exit): inspect $log"}
$results=Get-Content '.\qa_emulator_results_a9r4\coach-onboarding.json' -Raw | ConvertFrom-Json
if($results.fail -ne 0 -or $results.pass -ne 5){throw 'A9R4 onboarding contract failed. RELEASE_HOLD.'}
Write-Host 'A9R4 onboarding PASS 5/5 on demo; A9R3 mirror CAS 34/34 remains independent.'
