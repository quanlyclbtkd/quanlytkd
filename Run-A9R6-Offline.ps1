# A9R6 QA only. Executes no Firebase client, Firestore write, or VietQR provider request.
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$resultsDir=Join-Path $PSScriptRoot 'qa_results_a9r6'
New-Item -Type Directory -Force -Path $resultsDir | Out-Null
$cases=@(
  'tools/a9r6/qr-provider-memo-regression.test.mjs',
  'tools/a9r6/qr-full-receipt-case.test.mjs',
  'tools/a9r6/protected-boundaries.test.mjs',
  'tools/a9r5/qr-evidence-synthetic.test.mjs',
  'tools/check-qr-v7-actual-handlers.mjs',
  'tools/check-qr-v8-network-safari.mjs',
  'tools/check-qr-report-render-payment-intent.mjs',
  'tools/check-d1c3b7r2-attendance-entrypoints.mjs',
  'tools/check-d1c3b7r2-attendance-roster-write-guard.mjs',
  'tools/check-syntax.mjs'
)
$failed=@()
foreach($test in $cases){
  $file=Join-Path $resultsDir (($test -replace '[\\/]', '_')+'.log')
  Write-Host "QA: $test"
  & node $test *>&1 | Out-File -FilePath $file -Encoding utf8
  if($LASTEXITCODE -ne 0){$failed += $test;Write-Host "FAIL: $test" -ForegroundColor Red}
  else{Write-Host "PASS: $test" -ForegroundColor Green}
}
@{total=$cases.Count;pass=$cases.Count-$failed.Count;fail=$failed.Count;failed=$failed;scope='LOCAL_SYNTHETIC_QA_ONLY';release='HOLD'} | ConvertTo-Json -Depth 5 | Out-File -FilePath (Join-Path $resultsDir 'A9R6_OFFLINE_SUMMARY.json') -Encoding utf8
Write-Host "Results: $resultsDir"
if($failed.Count -gt 0){exit 1}
