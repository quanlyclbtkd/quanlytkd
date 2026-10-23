# PHASE QR V11R6 A9 — KIỂM TOÁN VÀ SỬA HẸP (TEST ONLY)

**Nguồn:** `QR_V11R6_A8_COACH_ACL_ATTENDANCE_QR_TEST_ONLY_FULL_SOURCE.zip` đã xác minh SHA-256 `19cb8d8e4d0b438823d11f404c81462dda5e9eeda443654f3c9ed3f6ff1713dd`, ZIP CRC PASS; `app.js` A8 SHA-256 `74ceab77e8bfb9828baec368d9dc7076a47fd3d0be0516b13d25b231c6954dc0`; root/public A8 byte-identical. Kiểm thử baseline được lưu ở `logs/baseline-selected.log`, RED tại `logs/auth-red.log`. Không kết nối dữ liệu production.

## 1. P0 — `auth/coach-assignment-mismatch` giả: đã sửa cấp mã nguồn

**Nguyên nhân xác định:** tại `app.js:3847–3858` của bản A8, object `_freshContext` chuyển từ `users/{uid}` vào `_normalizeAuthContext()` làm rơi `primaryCoachBranch` và `assignmentVersion`, nên version bị thay bằng `'legacy'`. Canonical `clubs/{clubId}/coaches/{uid}` vẫn mang phiên bản đúng. So sánh do đó có thể báo mismatch dù hai tài liệu trong Firestore khớp nhau.

**Patch:** `app.js:3856–3857` truyền tiếp `primaryCoachBranch: _ud.primaryCoachBranch || ''` và `assignmentVersion: _ud.assignmentVersion || 'legacy'`. Không nới `resolveAuthContext`, không lấy canonical thay mirror. RED trước patch: case matched real login path FAIL; GREEN sau patch **10/10**, trong đó 9 negative controls: version, ACL, primary, locked, cross-club, cache-only, pending writes, missing canonical và revoked (xem `logs/auth-green.log`). Bài test lấy nguyên đoạn context builder từ `app.js`, không mock riêng đoạn lỗi.

**Giới hạn:** chưa xác nhận HLV đăng nhập thành công trên staging/production hoặc Firebase thực; trạng thái release vẫn HOLD.

## 2. P0 — Admin ACL deadlock khi mirror lệch version: có chế độ repair an toàn cấp nguồn

**Nguyên nhân:** `savePair()` cũ chặn khi phiên bản mirror khác canonical, đúng cho sửa bình thường nhưng không có đường khôi phục. Chỉ bỏ stale guard sẽ cho phép lost update, vì `writeBatch()` phía client không có compare-and-swap dựa trên một `getDoc()` trước đó.

**Patch:** `js/core/coachBranchRuntimeRepair.js` giữ nguyên `savePair()` là **owner duy nhất**. Normal mode vẫn batch ba tài liệu. Khi Admin nhấn **Khôi phục mirror**, repair mode yêu cầu account Admin đã xác minh, đọc server-confirmed canonical, mirror, club root, main_config; kiểm tra role alias cùng CLB, trạng thái khóa, danh sách và trường primary/branch aliases; bắt buộc Admin chọn canonical ACL làm nguồn và gõ `KHOI PHUC`. Repair không kết hợp cấp quyền mới cùng lần khôi phục. Sau đó dùng **một Firestore `runTransaction()` trong chính `savePair()`** để đọc lại bốn tài liệu và ghi ba tài liệu (`coaches`, `users`, `coachAclEpoch`) nguyên tử. Transaction tự kiểm tra phiên bản đã đọc, trong callback so sánh cả canonical, mirror, epoch và branchCount với preflight; nếu có thay đổi phải ABORT, không retry writer theo kiểu mất ACK. Tăng epoch đúng 1 khi giao dịch thành công. `assignmentPreviousVersion` lấy canonical version cũ. Readback xác minh cả cặp, version mới, ACL, status và epoch.

**Lưu ý khác biệt kỹ thuật so với cách diễn đạt trong prompt:** để bảo đảm CAS cả *hai* version, repair sử dụng một giao dịch nguyên tử SDK trong cùng owner `savePair()` thay vì gọi `writeBatch()` cũ; normal mode vẫn là batch cũ. Không thêm một writer owner riêng hoặc listener mới. Chưa có bằng chứng từ Rules Emulator rằng transaction repair ALLOW trên Rules thật, do thiếu dependency.

**Chứng cứ:** `tools/a9/repair-cas-source.test.mjs` **14/14 PASS**; gồm version legacy, lost ACK, stale canonical/mirror, root epoch, config, role/club, status, hủy confirm, không có transaction và readback không xác minh. Đây là **mock SDK**, không phải Firebase Emulator. `tools/a6/admin-assignment.test.mjs` **14/14 PASS**, `tools/a8/acl-preflight-and-ack.test.mjs` **14/14 PASS**. READS bình thường tăng **1 readback root on-demand** khi Admin lưu (ước tính 6→7 `getDoc` tại mã nguồn, không phải số tính tiền đo thực); riêng lần repair thành công khoảng 12 lần đọc ứng dụng trước retry từ SDK. Không có listener mới.

## 3. P0 — QR chỉ hỏng với một số võ sinh: chưa thể đóng root cause provider

Mã nguồn vẫn dùng `_receiptPaymentMemo` → `generateVietQR` → fetch Quick Link → decode ảnh → `_verifyReceiptQrPixels` → `_receiptDecodeEMV` + CRC → so sánh BIN/tài khoản/số tiền/memo. `app.js:6963` logger không phải bản thân root cause. Tại A9 thêm các trường chẩn đoán đã ẩn danh `expectedMemoLength`, `providerEndpoint='vietqr-qr-only-svg'`, `providerRedirected`; kết hợp `reason`, `stage`, `jobId`, `kind`, HTTP status, timing và `qrPixelAudit.fieldsMatch` sẵn có. Không log full URL, tên, số tài khoản, tiền hoặc raw EMV. Sau RED phát hiện hostname provider xuất hiện trong log, đã đổi sang nhãn nội bộ; `check-qr-v7-actual-handlers` privacy check GREEN.

**Không sửa policy memo, không rút memo 25 ký tự, không bypass CRC, không fallback tài khoản khác.** Test synthetic QR: `qr-job-races` 6/6, pixel mismatch 6/6, memo boundary 9/9. **Chưa có log/ảnh pixel thật của tối thiểu một ca PASS và một ca FAIL** trên cùng thiết bị/tài khoản để kết luận provider có thay memo, parse EMV sai hay network. Mobile iOS/Android, Safari, Playwright, staging chưa xác minh. Xem `A9_QR_PASS_FAIL_PIXEL_MATRIX.md`.

## 4. HLV Điểm danh và mobile

`js/core/attendanceContract.js` giữ `HISTORY_COACH_ACCESS=false`; `firestore.rules` giữ `coachAttendanceCutoverOpen() => false`. Đây là bảo trì có chủ đích, không được coi là lỗi login. Multi-branch UI dùng cùng owner; A7 mobile menu fixture PASS nhưng chưa chạy trình duyệt thật. Chưa có bằng chứng S01 historical provenance, Journal V1/V2/V3, CAS/ACK replay, READS phê duyệt. **ATTENDANCE_MAINTENANCE_HOLD**.

## 5. Hồi quy, cache, môi trường và rủi ro

- Auth source path **10/10 PASS**, repair CAS synthetic **14/14 PASS**, A6 Coach **16/16 PASS**, A6 Admin **14/14 PASS**, A8 ACL preflight **14/14 PASS**.
- QR races **6/6 PASS**, QR pixel synthetic **6/6 PASS**, A8 memo **9/9 PASS**, A7 mobile menu source PASS, QR V7 actual handlers privacy PASS.
- `npm run check:syntax` **276/276 PASS**, `npm run build:public` PASS, `npm run check:root-public-parity` **128/128 PASS**, `check-production-residual-defect-closure` **33/33 PASS** sau khi sửa nhận diện cache A9 có kiểm tra graph cho hai file thay đổi; các pin A8/A6/A5 cũ còn nguyên.
- `npm run check` FAIL tại `V5U6D` assertion *canonical attendance event layer is mounted once by main*; cần phân biệt static harness lỗi thời hay runtime thật; không xóa assertion.
- `tools/a5/owner-boundary.test.mjs` FAIL hash pin owner A5 `_verifyReceiptQrPixels` (đã khác từ A8); test cũ chưa được repin theo lineage A9; không nới bất cứ owner tài chính nào chỉ để PASS.
- `check-security-coach-branch-boundary` và `check-coach-branch-runtime-repair` FAIL `STALE_AUTHORITY_IMPORT` do dùng toàn graph tag A6 cho nguồn A9; identity/scope phù hợp hai file A9 đã kiểm tra riêng, nhưng legacy test chưa được chứng minh hợp lệ hoàn toàn.
- `npm run check:release` chạy tới gate phụ thuộc Playwright, bị `TEST_DEPENDENCY_MISSING`; `npm ci --offline` lỗi `ENOTCACHED`, nên **Playwright/Chromium + Rules Emulator ENV_BLOCKED**. Không có Firestore live, staging hoặc chi phí Firestore đo thực.

## 6. Quyết định

**RELEASE_HOLD · NO_DEPLOY.** Bản ZIP là **candidate TEST ONLY** để tiếp tục Rules Emulator trên demo project và browser/mobile acceptance; không được công bố là sửa xong QR thực tế hay mở Coach Attendance. Không tạo transaction tài chính, không tăng listener; normal Admin-save +1 getDoc xác minh epoch, cần đo chi phí thật và phê duyệt. Không sửa expected/mock/test để ép PASS.

## 7. Rollback

Không deploy nên không cần thao tác production. Nếu phục hồi bản kiểm thử cũ: giữ nguyên ZIP A8 SHA-256 bên trên và thay toàn bộ thư mục source A9 bằng nguyên bản A8; không trộn root/public; chạy `npm run build:public`, `npm run check:root-public-parity`, so SHA. Không chạy migration ACL trực tiếp trên production khi chưa backup, chưa có Emulator và phê duyệt; nếu một repair commit đã xảy ra trên staging, phục hồi qua quy trình Admin được audit, không giảm `coachAclEpoch` thủ công và không ghi đè journal.
