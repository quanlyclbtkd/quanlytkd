# A9R3 Firestore Rules security audit, local Windows PowerShell 5.1 or 7.
# DEMO project only. NEVER firebase login/deploy. Never touches production.
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$expected='23AAE5FCB7F0376E4DD14AC324942233DC1BF2690304F4B7521E86C878CC7DAD'
if (-not (Test-Path 'package.json') -or -not (Test-Path 'firestore.rules')) {throw 'Run inside D:\A9R3\source with the full A9R3 source.'}
$actual=(Get-FileHash 'firestore.rules' -Algorithm SHA256).Hash
if ($actual -ne $expected) {throw "Unexpected Rules SHA. Expected $expected, found $actual. REFUSE TO RUN."}
if (-not (Test-Path 'tools/a9r3/coach-acl-emulator.test.mjs')) {throw 'Missing A9R3 QA test source.'}
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {throw 'Java JDK required. ENV_BLOCKED.'}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {throw 'Node.js required. ENV_BLOCKED.'}
if (-not (Test-Path 'node_modules/.bin/firebase.cmd')) {
 Write-Host 'Installing exactly the package-lock dependencies in this isolated source checkout.'
 & npm.cmd ci --no-audit --no-fund
 if ($LASTEXITCODE -ne 0) {throw 'npm ci unsuccessful. ENV_BLOCKED. No Rules conclusion.'}
}
$folder=Join-Path $PSScriptRoot 'qa_emulator_results_a9r3'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$log=Join-Path $folder 'A9R3_RULES_RAW_LOG.txt'
$json=Join-Path $folder 'A9R3_RULES_RESULTS.json'
Remove-Item -LiteralPath $log,$json -ErrorAction SilentlyContinue
$env:QA_RESULT_PATH=$json
$previous=$ErrorActionPreference
$exitCode=999
Write-Host 'Demo-only Firestore Emulator: demo-a9r3-coach-security. Never production.'
Write-Host 'Expected PERMISSION_DENIED messages on DENY tests are not automatically test failures.'
try {
  $ErrorActionPreference='Continue'
  & '.\node_modules\.bin\firebase.cmd' emulators:exec --only firestore --project demo-a9r3-coach-security 'node tools/a9r3/coach-acl-emulator.test.mjs' *>&1 | Tee-Object -FilePath $log
  $exitCode=$LASTEXITCODE
} finally { $ErrorActionPreference=$previous }
if (-not (Test-Path -LiteralPath $json)) {throw "No A9R3 JSON result. Native exit=$exitCode. ENV_BLOCKED/RELEASE_HOLD."}
$r=Get-Content -LiteralPath $json -Raw | ConvertFrom-Json
Write-Host ('A9R3 TEST SUMMARY: PASS={0}, FAIL={1}, TOTAL={2}, processExit={3}' -f $r.pass,$r.fail,$r.total,$exitCode)
Write-Host "RESULTS: $json"
Write-Host "LOG: $log"
if ($exitCode -ne 0 -or $r.fail -ne 0 -or $r.pass -ne 34 -or $r.total -ne 34) {
 throw 'Emulator did not pass all 34 contract checks. RELEASE_HOLD; do not modify Rules to match expected.'
}
Write-Host 'A9R3 34/34 Rules checks passed on demo emulator. This is NOT production release approval.'
