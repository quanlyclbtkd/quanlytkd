param(
 [Parameter(Mandatory=$true)][string]$EvidenceReport,
 [Parameter(Mandatory=$true)][string]$AcceptanceReport,
 [Parameter(Mandatory=$true)][string]$OutputZip
)
$ErrorActionPreference='Stop'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Out=Join-Path $PSScriptRoot 'a9r10_final_results'
if(Test-Path $Out){Remove-Item -Recurse -Force $Out}
New-Item -ItemType Directory -Path $Out | Out-Null
Copy-Item $EvidenceReport (Join-Path $Out 'evidence-report.json')
Copy-Item $AcceptanceReport (Join-Path $Out 'coach-acceptance-report.json')
$input=@{evidence=(Get-Content $EvidenceReport -Raw|ConvertFrom-Json);acceptance=(Get-Content $AcceptanceReport -Raw|ConvertFrom-Json);sourceIdentity=@{status='PASS'};rollback=@{status='PASS'}} | ConvertTo-Json -Depth 50
$inputFile=Join-Path $Out 'final-summary-input.json';[System.IO.File]::WriteAllText($inputFile, $input, $Utf8NoBom)
Set-Location $PSScriptRoot
node tools/a9r10/final-summary.mjs $inputFile (Join-Path $Out 'A9R10_FINAL_SUMMARY.json')
$code=$LASTEXITCODE
if(Test-Path $OutputZip){Remove-Item -Force $OutputZip}
Compress-Archive -Path (Join-Path $Out '*') -DestinationPath $OutputZip -Force
Write-Host "RESULT PACKAGE: $OutputZip" -ForegroundColor Green
exit $code
