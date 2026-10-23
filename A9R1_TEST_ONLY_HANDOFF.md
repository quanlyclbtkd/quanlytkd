# KIỂM TOÁN A9R1 — COACH AUTH / ADMIN ACL / QR / ATTENDANCE (TEST ONLY)

Ngày: 23/10/2026. Kiểm toán bản sao độc lập, không deploy, không kết nối production.

## 1. Identity

- A8 baseline ZIP SHA256: `19cb8d8e4d0b438823d11f404c81462dda5e9eeda443654f3c9ed3f6ff1713dd` (khớp yêu cầu).
- A8 `app.js` SHA256: `74ceab77e8bfb9828baec368d9dc7076a47fd3d0be0516b13d25b231c6954dc0` (khớp yêu cầu).
- A8 `app.js` và `public/app.js`: byte-identical; ZIP CRC PASS.
- A9 parent ZIP SHA256: `bee77d013cf5c1e48b8d3c242cb3807dcf8229f3eb33857f7cf52731788cb525`; A9 parent ZIP CRC PASS.
- A9R1 runtime source SHA256: `3dd0d01ac85833c19ba37ce1349c6222bf64802a7ac9625370d8646ae5acf3a0`.
- Rules nguồn được giữ nguyên, SHA: `4800a5e196342fee35be81d3cc08a03e5c7f4b062481fe7fe0be9b0e4c92c362`.
- A9R1 có lineage manifest mới; A9/A8/A6/A5 manifests cũ không bị sửa; `verifySourceIdentity` xác nhận đủ 128 runtime files.

## 2. Kết quả sửa đúng lỗi, không suy đoán

**A8 → A9:** Giữ đầy đủ `primaryCoachBranch`/`assignmentVersion` trong `_freshContext` tại `app.js` dòng 3856–3857. RED→GREEN 10/10, gồm trường hợp mismatch thật và quyền bị revoke vẫn bị deny. Đây là kết quả harness trích đúng code login, chưa phải đăng nhập real Firebase.

**A8 → A9:** Mở rộng chính `savePair()` thêm repair mode có server-confirmed preflight, Admin confirmation, CAS bằng Firestore transaction (đọc 4 tài liệu, ghi 3 tài liệu) và readback. Giữ normal mode, không thêm owner thứ hai; mock 14/14 PASS. Chưa thể chứng minh Rules hiện tại ALLOW transaction do Firestore Emulator chưa chạy được.

**Lỗi bổ sung tìm thấy trong A9:** Danh sách HLV có `list.querySelectorAll('[data-coach-repair]')` nhưng không hề render nút `data-coach-repair`, khiến `repairCoachMirror()` không thể kích hoạt bằng giao diện. Đây là khiếm khuyết thực tế trong source A9, tách biệt với correctness của CAS.

**Sửa A9R1:** `js/core/coachBranchRuntimeRepair.js` dòng 224, thêm nút `🛠 Khôi phục mirror` vào đúng hàng tài khoản HLV của Admin, sử dụng handler và `savePair()` canonical có sẵn, không thêm listener/writer. RED được tái hiện trực tiếp từ module nguyên bản A9, GREEN sau patch; kiểm thử xác nhận render → click → transaction duy nhất → đọc lại cặp ACL và epoch. Không ghi dữ liệu lúc render.

**Cache identity:** `index.html` chỉ thay cache-bust của module HLV đã sửa sang `qr-v11r6-a9r1-coach-repair-ui-20261023`. Không thay tags `app.js` và `main.js` vì bytes giữ nguyên. `public/` được dựng từ root; parity 128/128 PASS. Thêm manifest A9R1 và kiểm tra cache scope theo đúng graph hiện hành, không thay business assertion.

**QR:** Không có cặp ảnh QR PASS/FAIL thực tế và dữ liệu decoded EMV/CRC thực tế. A9R1 không sửa chính sách memo, không bỏ CRC/EMV, không đổi tài khoản/số tiền và không bật success cho mismatch. Các fixture QR PASS là synthetic-only. Dòng `[Receipt] Object` không tự chứng minh lỗi QR do provider hay Firestore.

**Điểm danh:** `HISTORY_COACH_ACCESS=false` và `coachAttendanceCutoverOpen() => false` giữ nguyên. Không mở khi chưa khép S01, Journal history provenance, CAS/READS approvals và kiểm thử browser/Rules.

## 3. Kiểm thử, giới hạn, READS

- Cục bộ A9R1: Auth 10/10, CAS 14/14, repair UI 3 assertions integration PASS, Coach 16/16, Admin 14/14, ACL preflight 14/14, QR races 6/6, QR pixel 6/6, QR memo 9/9. Syntax 276/276; root/public 128/128; cache identity 33/33. Raw logs trong bộ evidence.
- `npm run check`: FAIL tại assertion V5U6D canonical Attendance event layer mounted once by main (chưa phân định runtime hay pin harness).
- `npm run check:release`: ENV_BLOCKED do Playwright dependency; npm registry không sẵn nên không thể cài Firebase tools/rules-unit-testing. Không giả báo Rules Emulator PASS.
- READS ước lượng từ code đường Admin: normal savePair 3 preflight + 3 readback, caller preflight canonical 1 = khoảng 7 document gets, chưa kể danh sách/listener khác; repair từ nút khoảng 12 reads ứng dụng trong điều kiện không retry (1 canonical + 4 preflight + 4 transaction + 3 readback). Đây không phải billed READS trên server hay ngân sách Rules lookup. Không thêm getDocs/getDoc chỉ để sửa UI A9R1.
- Không có bằng chứng độc lập cho network/provider pixel thực, thiết bị iOS/Android, Rules deployment hash, transaction SDK ALLOW/DENY hay chi phí thực. Bắt buộc giữ release blocked.

## 4. Quyết định và bước tiếp theo

1. **Đã khép cấp source:** trường auth context bị rơi; nút Admin khôi phục mirror bị thiếu. ACL CAS repair được kiểm thử mô phỏng, chưa xác nhận trên Firebase.
2. **Còn chặn:** xác thực Rules Emulator normal/repair, case QR thật, mobile UI/IndexedDB, S01/Journal history provenance và READS/CAS approval.
3. **Staging/production:** CHƯA ĐỦ ĐIỀU KIỆN SIGN-OFF. Chỉ dùng bản này để kiểm thử cô lập trên demo; không deploy.

Đối chiếu chi tiết: `A9R1_GATE_MATRIX.md`; quy trình phục hồi: `A9R1_ROLLBACK.md`. Các báo cáo/lệnh log A9 trước đó giữ nguyên trong bộ A9 gốc, không được nâng cấp thành bằng chứng thực nghiệm mới.
