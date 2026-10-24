param(
 [Parameter(Mandatory=$true)][string]$AssemblyInputJson,
 [Parameter(Mandatory=$true)][string]$OutputPackage
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
node tools/a9r10/assemble-evidence-package.mjs $AssemblyInputJson $OutputPackage
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "EVIDENCE PACKAGE READY: $OutputPackage" -ForegroundColor Green
