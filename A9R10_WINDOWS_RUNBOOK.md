# PHASE A9R10 — Windows Runbook

> Mục tiêu: đóng S01 + Journal trên **Firebase staging riêng**, tạo active candidate bằng cutover đã có, rồi nghiệm thu HLV end-to-end. Không dùng project `quanly-tst`. Không replay queue, không tạo writer mới, không mở production.

## Bước 0 — Offline preflight
Giải nén vào `D:\A9R10\source`:

```powershell
cd D:\A9R10\source
npm.cmd ci --no-audit --no-fund
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-00-Offline-Preflight.ps1
```

Chỉ đi tiếp khi `qa_results_a9r10\A9R10_OFFLINE_SUMMARY.json` không có FAIL.

## Bước 1 — Chuẩn bị staging source độc lập
Sao chép `a9r10_templates\A9R10_STAGING_INPUT.template.json` thành `D:\A9R10\staging-input.json` và điền web config của **project staging thật**.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-01-Prepare-Staging.ps1 `
  -InputJson D:\A9R10\staging-input.json `
  -TargetDirectory D:\A9R10\staging-source
```

A9R10 hard-block `quanly-tst` và `demo-*`. Source gốc không bị sửa.

## Bước 2 — Tạo owner review key cục bộ
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-02-Generate-Owner-Key.ps1 `
  -OutputDirectory D:\A9R10\owner-key
```

**Không gửi `owner-private.pem`.** Chỉ public key + SHA-256 pin có thể đưa vào evidence.

## Bước 3 — Deploy maintenance staging
Bước này deploy staging source với Coach Attendance vẫn khóa và đúng Rules/indexes để thu bằng chứng.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-STAGING-HOSTING-DEPLOY.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -ProjectId <PROJECT_ID_STAGING> `
  -ConfirmStagingDeploy
```

Sau PASS sẽ có `D:\A9R10\staging-source\A9R10_MAINTENANCE_DEPLOYED.json` chứa thời điểm maintenance được quan sát/deploy.

## Bước 4 — Tạo bounded server-read request
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-03-Create-Server-Read-Request.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -ProjectId <PROJECT_ID_STAGING> `
  -ClubIds <CLUB_ID_STAGING> `
  -StagingBaseURL https://<STAGING_HOST>/ `
  -PageSize 100 `
  -MaxReturnedDocuments 10000 `
  -MaxRequests 500
```

Lệnh chỉ tạo request pending; chưa đọc Firestore.

## Bước 5 — Owner approve + sign server read
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-04-Owner-Approve-And-Sign.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -PendingRequest D:\A9R10\staging-source\a9r10_operator\pending-read-request.json `
  -PrivateKey D:\A9R10\owner-key\owner-private.pem
```

Phải tự gõ `APPROVE_STAGING_READ` sau khi kiểm tra project, club và read caps.

## Bước 6 — Thu snapshot server read-only
Đặt token staging chỉ trong phiên PowerShell local, không ghi vào file/chat:

```powershell
$env:V11R3_AUDIT_DATA_TOKEN = '<STAGING_FIREBASE_ID_TOKEN>'
$env:V11R3_METADATA_ACCESS_TOKEN = '<STAGING_METADATA_ACCESS_TOKEN>'

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-05-Collect-Server-Snapshot.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -PendingRequest D:\A9R10\staging-source\a9r10_operator\pending-read-request.json `
  -SignedGrant D:\A9R10\staging-source\a9r10_operator\signed-read-grant.json `
  -OwnerPublicKey D:\A9R10\owner-key\owner-public.pem `
  -PinnedPublicKeySHA256 (Get-Content D:\A9R10\owner-key\owner-public.sha256.txt -Raw).Trim() `
  -OutputFile D:\A9R10\evidence\server-snapshot.json

Remove-Item Env:V11R3_AUDIT_DATA_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:V11R3_METADATA_ACCESS_TOKEN -ErrorAction SilentlyContinue
```

## Bước 7 — History provenance S01
Tạo draft:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-05B-Draft-History-Provenance.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -ServerSnapshot D:\A9R10\evidence\server-snapshot.json `
  -OutputDraft D:\A9R10\evidence\history-provenance-reviewed.json
```

Nếu staging có attendance lịch sử, **review từng row** và điền `decision=verified`, profile/date/shift/status/branch, evidence type/ref/hash và `sourceEvidenceVerifiedByOwner=true`. Không được tự đánh dấu verified. Nếu attendance history = 0, rows sẽ rỗng.

Sau review:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-05C-Approve-Sign-History-Provenance.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -ReviewedProvenanceDraft D:\A9R10\evidence\history-provenance-reviewed.json `
  -PrivateKey D:\A9R10\owner-key\owner-private.pem `
  -OutputSigned D:\A9R10\evidence\signed-history-provenance.json
```

## Bước 8 — Device fleet / Journal
Sao chép `A9R10_DEVICE_FLEET.template.json` → `D:\A9R10\device-fleet.json`; liệt kê **mọi thiết bị + browser profile** dùng staging Attendance.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-06-Build-Device-Capture-Kit.ps1 `
  -FleetJson D:\A9R10\device-fleet.json `
  -OutputDirectory D:\A9R10\device-kit
```

Trên đúng staging origin, đúng tài khoản đang đăng nhập, chạy hai snippet của từng thiết bị:
- `*.current-principal-backup.snippet.js`: chụp Journal V3 của **current principal**.
- `*.legacy-queue-readonly.snippet.js`: chỉ đếm `taekwondo_cache/offline_queue`.

Nếu current-principal backup có `legacyLocalStorageCount > 0` hoặc `excludedForeignV3Count > 0`, **HOLD**: cần review/Admin capture riêng; không được bỏ qua. Nếu queue state `NONEMPTY`, HOLD và không chạy processor/replay để “làm sạch”.

Điền `A9R10_DEVICE_EVIDENCE_MAP.template.json`, rồi ký roster:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-06B-Build-Sign-Device-Roster.ps1 `
  -DeviceEvidenceMap D:\A9R10\device-evidence-map.json `
  -PrivateKey D:\A9R10\owner-key\owner-private.pem `
  -OutputSignedRoster D:\A9R10\evidence\signed-device-roster.json
```

## Bước 9 — Assemble + close S01/Journal evidence
Điền `A9R10_ASSEMBLY_INPUT.template.json`, gồm signed provenance, signed roster, server snapshot và mọi device evidence.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-06C-Assemble-Evidence-Package.ps1 `
  -AssemblyInputJson D:\A9R10\assembly-input.json `
  -OutputPackage D:\A9R10\evidence\a9r10-package.json

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-07-Evaluate-Evidence.ps1 `
  -EvidencePackage D:\A9R10\evidence\a9r10-package.json `
  -OutputReport D:\A9R10\evidence\a9r10-evidence-report.json `
  -OwnerPublicKey D:\A9R10\owner-key\owner-public.pem `
  -PinnedPublicKeySHA256 (Get-Content D:\A9R10\owner-key\owner-public.sha256.txt -Raw).Trim()
```

**Chỉ đi tiếp nếu:** `STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE`.

## Bước 10 — Tạo staging cutover review
Đóng mọi tab/client staging cũ đang có thể ghi Attendance và chờ inflight settle. Điền `A9R10_CUTOVER_REVIEW_INPUT.template.json`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-11-Build-Cutover-Review.ps1 `
  -CutoverReviewInput D:\A9R10\cutover-review-input.json `
  -OutputReview D:\A9R10\evidence\cutover-review.json
```

Owner review và ký:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-11B-Approve-Sign-Cutover.ps1 `
  -CutoverReview D:\A9R10\evidence\cutover-review.json `
  -PrivateKey D:\A9R10\owner-key\owner-private.pem `
  -OutputSignedApproval D:\A9R10\evidence\signed-cutover-approval.json
```

Phải tự gõ `APPROVE_STAGING_COACH_CUTOVER`.

## Bước 11 — Tạo active candidate + rollback candidate
Điền `A9R10_CUTOVER_DECISION_INPUT.template.json`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-12-Create-Active-Staging-Candidate.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -CutoverDecisionInput D:\A9R10\cutover-decision-input.json `
  -OwnerPublicKey D:\A9R10\owner-key\owner-public.pem `
  -PinnedPublicKeySHA256 (Get-Content D:\A9R10\owner-key\owner-public.sha256.txt -Raw).Trim() `
  -OutputDirectory D:\A9R10\active-staging-candidate

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-12B-Build-Rollback-Candidate.ps1 `
  -StagingSource D:\A9R10\staging-source `
  -CutoverProposal D:\A9R10\staging-source\a9r10_operator\cutover-proposal.json `
  -OutputDirectory D:\A9R10\rollback-staging-candidate
```

Active candidate hợp lệ phải có `CUTOVER_PROOF.json` status `STAGING_CANDIDATE_VERIFIED_NOT_DEPLOYED`. Rollback phải có `A9R10_ROLLBACK_PROOF.json` status PASS.

## Bước 12 — Deploy active candidate lên staging
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-13-Deploy-Active-Staging.ps1 `
  -ActiveCandidate D:\A9R10\active-staging-candidate `
  -ProjectId <PROJECT_ID_STAGING> `
  -ConfirmStagingCutoverDeploy
```

Đây là lúc Coach Attendance được mở **chỉ trên staging**.

## Bước 13 — Nghiệm thu HLV 18/18
Dùng `A9R10_COACH_ACCEPTANCE.template.json` và checklist. Test đầy đủ:
- login;
- CS1 shifts/roster/create/sync/relogin;
- CS2 shifts/roster/create/sync/relogin;
- deny branch ngoài quyền;
- deny tài chính;
- duplicate intent không duplicate attendance;
- offline→online không mất/ghi hai lần;
- không critical console error.

Hash bằng chứng:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-10-Hash-Evidence.ps1 `
  -EvidenceDirectory D:\A9R10\coach-ui-evidence `
  -OutputCsv D:\A9R10\coach-ui-evidence-hashes.csv
```

Đánh giá:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-08-Evaluate-Coach-Acceptance.ps1 `
  -AcceptanceJson D:\A9R10\coach-acceptance.json `
  -OutputReport D:\A9R10\coach-acceptance-report.json
```

Chỉ PASS khi status `STAGING_COACH_ACCEPTANCE_PASS_NOT_RELEASE`.

## Bước 14 — Nếu lỗi, rollback staging ngay
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-14-Deploy-Rollback-Staging.ps1 `
  -RollbackCandidate D:\A9R10\rollback-staging-candidate `
  -ProjectId <PROJECT_ID_STAGING> `
  -ConfirmRollback
```

Rollback khóa lại Coach Attendance, không xóa Journal/data.

## Bước 15 — Đóng gói kết quả
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R10-09-Pack-Results.ps1 `
  -EvidenceReport D:\A9R10\evidence\a9r10-evidence-report.json `
  -AcceptanceReport D:\A9R10\coach-acceptance-report.json `
  -OutputZip D:\A9R10\A9R10_RESULTS.zip
```

Gửi `A9R10_RESULTS.zip`. **Không gửi:** private key, password, Firebase tokens, dữ liệu võ sinh thô.

## Điều kiện dừng ngay
- Bất kỳ bước nào chạm `quanly-tst`.
- S01 candidate cohort > 0 / snapshot thiếu trang / Rules-runtime-index mismatch.
- Thiếu thiết bị, V1/V2 chưa reconcile, queue NONEMPTY, V3 pending/inflight/conflict/needs-review.
- ACK cuối không khớp server `attendanceVersion`.
- Coach thấy tài chính hoặc branch ngoài quyền.
- Duplicate attendance / offline→online ghi hai lần.
- Active candidate không có proof hợp lệ hoặc rollback candidate không PASS.

**A9R10 staging PASS vẫn không phải production release approval.** Production cần review cutover riêng.
