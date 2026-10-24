param(
 [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
 [Parameter(Mandatory=$true)][string]$OutputCsv
)
$ErrorActionPreference='Stop'
if(-not (Test-Path $EvidenceDirectory)){throw "Không thấy thư mục: $EvidenceDirectory"}
Get-ChildItem -LiteralPath $EvidenceDirectory -File -Recurse | ForEach-Object {
  $h=Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
  [pscustomobject]@{file=$_.FullName;sha256=$h.Hash.ToLowerInvariant();bytes=$_.Length}
} | Export-Csv -NoTypeInformation -Encoding UTF8 $OutputCsv
Write-Host "EVIDENCE HASHES: $OutputCsv" -ForegroundColor Green
