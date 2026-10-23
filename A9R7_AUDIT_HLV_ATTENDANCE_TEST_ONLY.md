# A9R7 — Kiểm toán lỗi HLV không tải Ca tập/Danh sách và không ghi Điểm danh

**Trạng thái: DEMO/TEST ONLY — RELEASE_HOLD — NO DEPLOY.**

## Nguyên nhân đã chứng minh từ A9R6

1. **Auth không phải nguyên nhân trực tiếp cho màn hình này:** HLV đã đăng nhập và thấy tab Điểm danh; A9R5R2 Auth+Firestore integration trước đó 9/9 PASS (theo bộ kết quả người dùng cung cấp, không chạy lại ở pha này).
2. **Client cắt luồng trước khi tải dữ liệu:** `js/core/attendanceContract.js` xuất `HISTORY_COACH_ACCESS = false`; `_requestAttendanceDailyRefresh()` trong `js/modules/attendance.js` phát hiện `coachMaintenance` và trả `attendance-maintenance` ngay trước `_loadClubShifts()` và trước `AttendanceService.loadByDate()`. Vì vậy ca tập và võ sinh không lên.
3. **Rules từ chối điểm danh Coach:** `firestore.rules`, `match /clubs/{clubId}/attendance/{attendanceId}`, trả `false` ở `coachAttendanceCutoverOpen()`. Các nhánh Coach `get/list/create/update` yêu cầu cổng này.
4. **Không thiếu quyền đọc ca tập:** Coach được `get` `settings/shifts` nhưng không được đọc `settings/main_config` vì nhạy cảm; Coach chỉ được đọc `profiles` cùng cơ sở. Không nới quyền cài đặt hay finance.
5. **Không được bật hai cổng đơn thuần:** Có S01 (tài liệu lịch sử giả có marker trước cutover), V1/V2 Journal chưa xác minh độc lập, nguy cơ ghi chồng khi mất ACK và lịch sử không có revision. Mã đã có bộ cutover bắt buộc tạo authority mới, scan server xác minh cohort=0, Rules/index/read budget và ký quyết định hệ thống.

## Thay đổi trong A9R7 này

- Gắn **pin nguồn A9R6 chính xác 128 runtime files** vào `tools/v11r2/source-identity.mjs` và manifest riêng để công cụ cutover có thể tạo bản DEMO từ A9R6 (trước đó pin chỉ nhận các bản cũ).
- Thêm bài `tools/a9r7/coach-readiness-offline.test.mjs` xác minh nguồn, hai khóa, quyền ca/profiles, chuẩn bị DEMO, authority mới và rollback.
- Thêm bài `tools/a9r7/coach-attendance-cutover-demo.emulator.mjs` thử quy tắc đọc Ca, đọc profile CS1/CS2, tạo/cập nhật điểm danh CAS, chặn giả cơ sở, chặn legacy không chuẩn, tài chính, xóa, khác CLB, và nêu rõ **marker giả có sẵn vẫn đọc được nếu mở cổng mà chưa scan cohort**.
- Thêm `Run-A9R7-Coach-Attendance-Demo.ps1` tạo bản active riêng, cấu hình Firebase `demo-v11r2-cutover`, chạy Firestore Emulator loopback, xuất JSON kết quả. Mọi dữ liệu đều là fixture giả.

**Chưa sửa `app.js`, `firestore.rules`, `attendanceContract.js`, `AttendanceService` hay `attendance.js` của bản mặc định A9R6**. Không tăng READS/listeners, không viết production, không tắt journal, không thay Mirror CAS.

## Kết quả thực thi tại đây

- `coach-readiness-offline`: **11/11 PASS**.
- `tools/v11r2/cutover-gates.test.mjs`: **36/36 PASS**.
- `tools/check-d1c3b7r2-attendance-entrypoints.mjs`: **21/21 PASS**.
- `tools/check-d1c3b7r2-attendance-roster-write-guard.mjs`: **9/9 PASS**.
- `tools/a9r6/protected-boundaries.test.mjs`: **8/8 PASS**.
- `tools/check-root-public-parity.mjs`: **PASS**.
- `tools/check-syntax.mjs`: **PASS**.
- DEMO candidate được sinh riêng thành công với `DEMO_VERIFIED_NOT_RELEASE` từ trình chuẩn bị cutover hiện hữu; active Rules chỉ ở output demo.
- **Chưa chạy bộ Firestore Emulator A9R7 tại đây** vì môi trường không có `node_modules/@firebase/rules-unit-testing`. Người dùng chạy script Windows đính kèm rồi gửi JSON/log để khép ca.

## Cổng bắt buộc trước khi HLV được điểm danh trên staging/production

1. Firestore Emulator A9R7 thực sự PASS toàn bộ ca, không dựa vào offline mocks.
2. Ảnh chụp server có xác nhận `fromCache=false` và đầy đủ hồ sơ/attendance hiện có, inventory toàn dự án, cohort của fresh `historyAuthority` bằng 0; kiểm chứng tài liệu giả có marker từ trước không tồn tại trong candidate thật.
3. Đối soát V1/V2/V3 Journal, bản ghi chưa ACK, mất gói, retry và CAS; không tự backfill/cấp marker cho lịch sử cũ.
4. Kiểm tra Rules/index chính xác trên staging, quyền theo 2 cơ sở, HLV khác CLB bị DENY, branch spoof DENY; iOS/Android offline/online.
5. Có phê duyệt bằng chứng của chủ hệ thống cho ngân sách Rules lookup, CAS retry/read và thời điểm cutover; tạm dừng client cũ; kịch bản rollback giữ IDB và Firestore lịch sử.
6. QR thực, source identity và các gate release còn mở vẫn phải đạt trước production.

**Không chỉnh thủ công `HISTORY_COACH_ACCESS=false` thành `true` trên bản A9R6 đang nối dự án `quanly-tst`.**
