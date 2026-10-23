$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$Out = Join-Path $PSScriptRoot 'qa_results_a9r10'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$tests = @(
  @{Name='a9r10-offline'; Cmd='node tools/a9r10/offline.test.mjs'},
  @{Name='a9r9-evidence'; Cmd='node tools/a9r9/evidence-closure.test.mjs'},
  @{Name='a9r10-device-evidence'; Cmd='node tools/a9r10/evidence-closure.test.mjs'},
  @{Name='syntax'; Cmd='node tools/check-syntax.mjs'},
  @{Name='parity'; Cmd='node tools/check-root-public-parity.mjs'},
  @{Name='attendance-entrypoints'; Cmd='node tools/check-d1c3b7r2-attendance-entrypoints.mjs'},
  @{Name='attendance-write-guard'; Cmd='node tools/check-d1c3b7r2-attendance-roster-write-guard.mjs'}
)
$summary=@()
foreach($t in $tests){
  $log=Join-Path $Out ($t.Name+'.log')
  cmd /c $t.Cmd *> $log
  $code=$LASTEXITCODE
  $status = if($code -eq 0){'PASS'}else{'FAIL'}
  $summary += [pscustomobject]@{name=$t.Name;exitCode=$code;status=$status}
  if($code -ne 0){ Write-Host "FAIL $($t.Name) - xem $log" -ForegroundColor Red }
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $Out 'A9R10_OFFLINE_SUMMARY.json')
if(($summary | Where-Object {$_.status -ne 'PASS'}).Count -gt 0){ exit 1 }
Write-Host 'A9R10 OFFLINE PRECHECK PASS' -ForegroundColor Green
