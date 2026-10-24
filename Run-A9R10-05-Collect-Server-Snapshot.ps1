param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$PendingRequest,
 [Parameter(Mandatory=$true)][string]$SignedGrant,
 [Parameter(Mandatory=$true)][string]$OwnerPublicKey,
 [Parameter(Mandatory=$true)][string]$PinnedPublicKeySHA256,
 [Parameter(Mandatory=$true)][string]$OutputFile
)
$ErrorActionPreference='Stop'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if(-not $env:V11R3_AUDIT_DATA_TOKEN){throw 'Thiếu V11R3_AUDIT_DATA_TOKEN cho staging read-only.'}
if(-not $env:V11R3_METADATA_ACCESS_TOKEN){throw 'Thiếu V11R3_METADATA_ACCESS_TOKEN cho Rules/index metadata read-only.'}
$pending=Get-Content $PendingRequest -Raw | ConvertFrom-Json
if($pending.request.projectId -eq 'quanly-tst' -or $pending.request.projectId -like 'demo-*'){throw 'Project staging không hợp lệ.'}
$bundle=@{request=$pending.request;grant=(Get-Content $SignedGrant -Raw | ConvertFrom-Json)} | ConvertTo-Json -Depth 40
$input=Join-Path (Split-Path $OutputFile -Parent) 'a9r10-server-export-input.json'
New-Item -ItemType Directory -Force -Path (Split-Path $OutputFile -Parent) | Out-Null
[System.IO.File]::WriteAllText($input, $bundle, $Utf8NoBom)
Push-Location $StagingSource
try{
 node tools/v11r3/server-export.mjs $input $OutputFile $OwnerPublicKey $PinnedPublicKeySHA256
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally { Pop-Location }
Write-Host "READ-ONLY STAGING SNAPSHOT SAVED: $OutputFile" -ForegroundColor Green
