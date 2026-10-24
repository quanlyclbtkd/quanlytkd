# A9R10R2 — Staging Evidence Collection & Coach Attendance Acceptance

**STATUS: TEST ONLY — STAGING WORKFLOW READY — NO PRODUCTION DEPLOY**

## Mục tiêu
A9R10R2 hoàn thiện workflow để HLV có thể **điểm danh thực tế trên Firebase staging riêng** sau khi đóng S01 + Journal, rồi nghiệm thu end-to-end trên thiết bị thật. Không dùng project production `quanly-tst`, không tạo attendance writer mới, không nới quyền tài chính.

## Nguyên nhân chính khiến HLV chưa điểm danh production
1. Client và Rules vẫn cố ý maintenance-lock Coach Attendance cho đến khi cutover được duyệt.
2. S01 cần chứng minh candidate `historyAuthority` chưa tồn tại trong lịch sử trước cutover.
3. Journal cần đối soát tất cả thiết bị/browser profile: V1/V2, V3, IndexedDB legacy, pending/inflight/conflict và ACK↔server version.
4. Chưa có acceptance UI thực: login → CS1/CS2 → shifts → roster → write → sync → relogin → offline/online.

## Lỗi tooling đã tìm thấy và sửa trong A9R10R2
### 1. Windows PowerShell 5.1 / UTF-8
A9R10R1 đã thêm BOM cho `.ps1`, nhưng JSON trung gian vẫn có thể được ghi bằng `Set-Content -Encoding UTF8`. Trên Windows PowerShell 5.1 lệnh này sinh UTF-8 BOM; `JSON.parse(fs.readFileSync(...))` của Node có thể lỗi `Unexpected token '﻿'`.

**Sửa:**
- `.ps1` vẫn UTF-8 BOM + CRLF để PowerShell 5.1 đọc tiếng Việt đúng.
- Mọi JSON do runner A9R10 sinh ra dùng `System.IO.File.WriteAllText(..., UTF8Encoding(false))` — UTF-8 không BOM.
- Các tool A9R10 đọc JSON dùng `readJsonFile()` và chấp nhận input có BOM để phòng người dùng lưu template bằng Notepad.
- Bổ sung `tools/a9r10/windows-interop.test.mjs`.

### 2. Hướng dẫn Device Kit sai/mơ hồ
Thông báo cũ nói kit chỉ đọc legacy IndexedDB dù thực tế A9R10 tạo cả current-principal Journal V3 + legacy queue inventory.

**Sửa:** thông báo mới nêu đúng 2 snippet và giữ HOLD nếu có V1/V2/foreign V3/queue cũ.

### 3. Thiếu bước chuẩn bị dữ liệu staging thực dụng
Workflow cũ chưa nói rõ staging cần dữ liệu giả để acceptance chạy được.

**Sửa:** Runbook thêm bước 3B: 1 CLB staging, shift CS1+CS2, ≥4 võ sinh giả, 1 HLV giả được cấp CS1+CS2, attendance = 0 trước snapshot, browser profile staging riêng.

### 4. Token staging dễ bị dùng sai loại
Global attendance inventory cần principal đủ quyền; metadata Rules/indexes dùng Google OAuth access token, không phải Firebase ID token.

**Sửa:** Runbook phân biệt rõ `V11R3_AUDIT_DATA_TOKEN` (khuyến nghị staging SuperAdmin Firebase ID token) và `V11R3_METADATA_ACCESS_TOKEN` (Google OAuth read metadata).

## Phạm vi runtime
- `app.js`: không đổi.
- `firestore.rules`: không đổi.
- `js/modules/attendance.js`: không đổi.
- `js/services/attendance.service.js`: không đổi.
- `js/data/attendanceJournal.js`: không đổi từ A9R9/A9R8.
- Coach Auth/ACL/Mirror CAS: không đổi.
- Không thêm writer/listener vào SPA.

## QA đã chạy
- A9R10 core: 10/10 PASS.
- Current-principal device evidence: 6/6 PASS.
- A9R9 evidence regression: 22/22 PASS.
- Attendance entrypoints: 21/21 PASS.
- Attendance write guard: 9/9 PASS.
- Windows JSON/PowerShell interop: 4/4 PASS.
- JavaScript syntax: PASS (276 items).
- Root/Public parity: PASS (128/128).
- Runtime source identity remains pinned to A9R9/A9R8 runtime.

## Gate kế thừa còn mở
- `app.js` = 703656 bytes > 700000 bytes.
- Production S01/Journal evidence chưa được thu.
- Real staging Firebase project + hosting chưa được cung cấp trong môi trường kiểm toán này.
- Coach UI acceptance 18/18 chưa chạy trên Android/iOS/desktop staging thực.

## Điều kiện công nhận HLV staging hoạt động
1. `STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE`.
2. Active staging candidate có `CUTOVER_PROOF.json` = `STAGING_CANDIDATE_VERIFIED_NOT_DEPLOYED`.
3. Rollback candidate = PASS trước khi active deploy.
4. Coach UI acceptance đủ 18/18 = `STAGING_COACH_ACCEPTANCE_PASS_NOT_RELEASE`.
5. Không critical console error; không duplicate attendance; offline→online không mất/ghi hai lần.

## Kết luận
A9R10R2 là bản workflow/QA đã sửa lỗi Windows và đủ công cụ để đưa Coach Attendance từ maintenance sang **staging thực** một cách kiểm soát. Nó không tự phê duyệt production. Nếu staging acceptance PASS, bước kế tiếp là production cutover review độc lập với bằng chứng production riêng.
