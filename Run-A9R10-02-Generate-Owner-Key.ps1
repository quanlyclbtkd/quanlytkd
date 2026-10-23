param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/new-owner-key.mjs $OutputDirectory
if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }
Write-Host 'GIỮ owner-private.pem CHỈ TRÊN MÁY CỦA BẠN. KHÔNG GỬI FILE NÀY.' -ForegroundColor Yellow
