param(
 [Parameter(Mandatory=$true)][string]$StagingSource,
 [Parameter(Mandatory=$true)][string]$ProjectId,
 [Parameter(Mandatory=$true)][string[]]$ClubIds,
 [Parameter(Mandatory=$true)][string]$StagingBaseURL,
 [int]$PageSize=100,
 [int]$MaxReturnedDocuments=10000,
 [int]$MaxRequests=500
)
$ErrorActionPreference='Stop'
if($ProjectId -eq 'quanly-tst' -or $ProjectId.StartsWith('demo-')){ throw 'Chỉ cho staging thật, cấm production/demo.' }
$Work=Join-Path $StagingSource 'a9r10_operator'
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$options=@{projectId=$ProjectId;clubIds=$ClubIds;authority=$null} | ConvertTo-Json -Depth 6
$optionsFile=Join-Path $Work 'cutover-options.json'; $options | Set-Content -Encoding UTF8 $optionsFile
Push-Location $StagingSource
try{
 node tools/v11r2/cutover.mjs prepare $optionsFile (Join-Path $Work 'cutover-proposal.json')
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 $readTime=(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z')
 $audit=@{readTime=$readTime;pageSize=$PageSize;maxReturnedDocuments=$MaxReturnedDocuments;maxRequests=$MaxRequests;stagingBaseURL=$StagingBaseURL} | ConvertTo-Json -Depth 6
 $auditFile=Join-Path $Work 'audit-options.json';$audit | Set-Content -Encoding UTF8 $auditFile
 node tools/v11r3/new-request.mjs (Join-Path $Work 'cutover-proposal.json') $auditFile (Join-Path $Work 'pending-read-request.json')
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
} finally { Pop-Location }
Write-Host "PENDING READ REQUEST CREATED: $Work\pending-read-request.json" -ForegroundColor Green
Write-Host 'CHƯA ĐỌC FIRESTORE. Cần owner review + sign trước.' -ForegroundColor Yellow
