# A9R10 — Staging Evidence Collection & Coach Attendance Acceptance

**STATUS: TEST ONLY — STAGING WORKFLOW READY — NO PRODUCTION DEPLOY**

## Phạm vi
- Kế thừa runtime A9R9/A9R8; không thay `app.js`, `firestore.rules`, AttendanceService hoặc writer Điểm danh.
- Bổ sung source-identity pin phục vụ **tạo staging derivative** từ runtime 128 file hiện tại.
- Bổ sung orchestration Windows, template evidence, evaluator HLV và capture read-only đúng current principal để không bỏ sót Journal V3 của Coach.
- Hard-block project production `quanly-tst`; project `demo-*` không được xem là staging evidence.

## Vấn đề A9R9 được A9R10 đóng về mặt tooling
1. A9R9 chưa có workflow Windows liền mạch từ source staging → owner approval → server snapshot → device fleet → evidence closure → Coach UI acceptance.
2. Backup V11R3 cũ chỉ cho Admin/SuperAdmin và loại V3 của principal khác. A9R10 thêm `A9R10_CURRENT_PRINCIPAL_DEVICE_BACKUP` staging-only để Coach tự chụp Journal của chính tài khoản, không xuất raw V1/V2.
3. Nếu thiết bị còn legacy V1/V2 hoặc foreign V3, A9R10 **không** coi snapshot current-principal là đủ; kết quả HOLD để owner xử lý riêng.
4. Acceptance evaluator bắt buộc 18/18 ca PASS, evidence SHA-256, zero finance/production write và đúng một attendance writer.

## Các gate vẫn cần dữ liệu thực
- Snapshot Firestore staging S01 với fixed read time và signed provenance.
- Signed device fleet roster + evidence của từng thiết bị.
- UI HLV staging trên thiết bị thực.
- Review cutover production độc lập sau A9R10; không suy diễn từ staging.

## QA đã chạy trước bàn giao
- A9R10 core: 10/10 PASS.
- Current-principal device Journal evidence: 6/6 PASS.
- A9R9 evidence regression: 22/22 PASS.
- Attendance entrypoints: 21/21 PASS.
- Attendance write guard: 9/9 PASS.
- JS syntax: PASS.
- Root/Public: 128/128 PASS.
- Staging source derivation synthetic: PASS.
- Owner staging read approval/sign synthetic: PASS.
- Staging cutover review draft synthetic: PASS.
- Restrictive rollback candidate synthetic: PASS.

## Gate kế thừa không bị che
`app.js = 703656 bytes`, vẫn vượt gate 700000 bytes. Không nâng threshold, không sửa expected để tạo PASS.

## Kết luận
A9R10 đóng khoảng trống **tooling/workflow** để có thể thu bằng chứng thật và nghiệm thu HLV staging một cách có kiểm soát. Nó không giả lập việc đã có staging evidence. Trước khi chạy trên staging thật, source vẫn maintenance locked. Production `quanly-tst` bị hard-block trong các script A9R10.
