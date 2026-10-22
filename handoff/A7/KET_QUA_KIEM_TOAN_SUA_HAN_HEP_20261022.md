# QR V11R6 A7 — Báo cáo sửa hẹp có chứng cứ (TEST ONLY / NO DEPLOY)

Ngày: 22/10/2026. Nguồn cố định A6 ZIP SHA-256 `4603e3eb5a9d546e5ea489fe75e933340323e7f9cce711bd41ab4bc5f859b403`, CRC PASS. Không truy cập dữ liệu Firestore production và không thay đổi dữ liệu live.

## A. Phân quyền HLV — sửa và điều kiện còn mở

1. **Đã sửa lỗi không đồng bộ alias:** batch cũ set `branch`, `coachBranch`, `defaultBranch` nhưng để sót `primaryCoachBranch` có thể đã tồn tại từ tài khoản cũ. Khi đổi cơ sở mặc định, `normalizeAssignment()` ưu tiên trường còn sót này, dẫn đến login/mirror mismatch. A7 set **cùng một `primaryCoachBranch`** trên cả `clubs/{clubId}/coaches/{uid}` và `users/{uid}` trong batch 3 tài liệu hiện có. Không tạo batch/reader/listener thứ hai.
2. **Đã chặn cấu hình sai kiểu:** Rules dùng `configured is int` ở `main_config.branchCount`, trong khi A6 client `Number('2')` coi chuỗi như số 2; hiện trả thông báo cấu hình sai trước khi ghi. Không ép kiểu hoặc cập nhật settings ngầm.
3. **Đã tăng thông tin khi `permission-denied`:** hướng kiểm chứng Rules đang triển khai, phiên Admin, mirror, epoch, version; không tuyên bố biết predicate Firestore nào thất bại khi không có live trace.
4. Trong cùng UI, khóa các lựa chọn khi lưu để tránh sửa lựa chọn trong batch đang chạy; không cấp quyền thêm.

**Chưa xác minh/khép:** nguyên nhân cụ thể lỗi permission-denied trên website, vì thiếu Rules SHA deploy, dữ liệu `users`/`coaches`/`settings`/root epoch và local Firestore Emulator. Yêu cầu Rules Emulator với dữ liệu đã ẩn danh và 3-doc batch đối chiếu production Rules trước khi áp dụng; không nới ACL, không dùng `setDoc` thay cho atomic batch.

## B. Mobile

- Menu di động có lựa chọn **Quản lý HLV**, chỉ hiển thị khi `__verifiedAuthContextState` đã sẵn sàng, role admin/owner/super_admin, và khớp UID phiên ở store. Cả ESM UI owner và legacy fallback dùng chung điều kiện.
- Nút đi vào **chính modal hiện hữu** (`openCoachAccountsModal`), không tạo màn hình hay writer mới. Modal tái kết xuất checkbox đa cơ sở khi mở.
- Một HLV chọn **một cơ sở hoạt động** tại một thời điểm trong danh sách cơ sở đã được Admin cấp; không được tự cấp CS khác.

## C. QR / VietQR

- Vẫn verify ảnh QR ở `provider-pixels` và `preview-pixels`; không chuyển khoản/tạo biên lai nếu CRC sai, EMV sai hoặc nội dung khác intent.
- Có mã chính `QR_EMV_MISMATCH` như cũ; thêm `diagnostics.qrPixelAudit.failure` phân biệt `EMV_PARSE_OR_CRC_FAIL` và `INTENT_FIELD_MISMATCH`, trong trường hợp thứ hai chỉ gồm boolean của `bankBin`, `accountNo`, `amount`, `memo` cùng **độ dài** memo dự kiến/thực. **Không lưu/log raw EMV, tên VĐV, ngân hàng/thụ hưởng, số tiền, QR URL**.
- Bộ kiểm thử fixture: CRC sai, sai BIN, sai tài khoản, sai số tiền, sai nội dung, ảnh hợp lệ đều cho kết quả mong muốn (6/6). Không thay đổi memo, cắt tháng/đổi nội dung chuyển khoản, không đổi provider.

**Chưa khép:** chưa có raw evidence phía provider cho từng võ sinh lỗi; do đó không thể xác nhận nhà cung cấp normalize/truncate memo hay lỗi thiết bị. Cần chạy test QR thật với nhật ký cấu trúc đã ẩn danh trên iOS Safari/Android, kiểm tra `qrPixelAudit`. Không đưa QR đang fail ra production.

## D. HLV Điểm danh — HOLD bắt buộc

`js/core/attendanceContract.js` vẫn `HISTORY_COACH_ACCESS=false`; `firestore.rules` vẫn `coachAttendanceCutoverOpen() => false`. Đây là maintenance có chủ đích; **không mở attendance bằng cách gạt cờ** khi P0 S01 lịch sử giả, phê duyệt CAS/READS và Rules production chưa khép. Mở cutover cần một bản active candidate riêng cùng Emulator, index/staging, backup/rollback, iOS/Android IndexedDB và chứng cứ historyAuthority hợp lệ.

## E. Kết quả tự chạy

- SHA ZIP nguồn A6: **MATCH**; ZIP CRC: **PASS**.
- `node tools/a6/admin-assignment.test.mjs`: **14/14 PASS** (bổ sung `primaryCoachBranch` + `branchCount` chuỗi).
- `node tools/a6/coach-assignment.test.mjs`: **16/16 PASS**.
- `node tools/a6/qr-job-races.test.mjs`: **6/6 PASS**.
- `node tools/a7/qr-pixels-sanitized.test.mjs`: **6/6 PASS**.
- `node tools/a7/mobile-coach-menu.test.mjs`: **3/3 PASS** (kiểm thử hợp đồng source, chưa phải test thiết bị).
- `node tools/check-payment-accounts.mjs`: **EXIT 0** (1 warning).
- `node tools/check-qr-report-render-payment-intent.mjs`: **EXIT 0**.
- `node tools/check-qr-v4-payment-account-authority.mjs`: **EXIT 0**.
- `node tools/check-syntax.mjs`: **276 mục OK** (268 JS + 8 inline).
- `node tools/check-root-public-parity.mjs`: **128/128 PASS**.
- Một lượt `check-qr-v7-actual-handlers.mjs` đã từng hoàn tất với 0 lỗi trong trước khi build parity; lần chạy lặp sau chưa hoàn tất trong giới hạn môi trường, **không tính PASS lại**.

**Không chạy được:** các Rules Emulator tests do thiếu `@firebase/rules-unit-testing` và Firestore emulator JAR trong môi trường; gate cũ `check-coach-branch-runtime-repair.mjs` dừng do A6 source hash bị khóa (`SOURCE_RUNTIME_NOT_ACCEPTED`), chưa cập nhật thẩm quyền chấp nhận A7. Không sửa manifest/expected để ép PASS.

## F. Release gates và bước tiếp theo

**RELEASE_HOLD / NO_DEPLOY**. A7 là mã nguồn **TEST ONLY**, không được xem là bản sửa 100% trên website. Cần 1) chốt live Rules SHA và tái hiện batch `permission-denied` bằng Emulator; 2) xác minh dữ liệu HLV cũ và alias `primaryCoachBranch` sau đăng nhập; 3) đối soát QR provider thật theo fixture an toàn; 4) xử lý các P0 S01/READS/CAS, xác minh `txId` trước release; 5) chạy đầy đủ regression + thiết bị di động và ký chấp nhận build A7. Không tự động deploy, không ghi tài chính.
