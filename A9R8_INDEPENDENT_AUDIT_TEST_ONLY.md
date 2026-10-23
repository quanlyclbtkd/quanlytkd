# PHASE A9R8 — Attendance History S01 & Journal Closure (TEST ONLY)

**TRẠNG THÁI: RELEASE_HOLD — NO DEPLOY — S01/Journal chưa khép dữ liệu server thực.**

## Nguồn
- Baseline nguyên vẹn: `QR_V11R6_A9R7_COACH_ATTENDANCE_DEMO_GATED_TEST_ONLY_FULL_SOURCE.zip`.
- A9R7 Firestore Emulator user evidence: `A9R7_COACH_ATTENDANCE_RESULTS.zip`, 14/14 báo cáo PASS. Ca `S01 proof: forged pre-cutover marker remains a release blocker` PASS chứng minh lỗ hổng tiền-cutover, **không** chứng minh đã sửa S01.
- Không dùng production credential, không chạy Firebase writer/deploy/cloud functions.

## Phát hiện thực chứng
1. Rules mặc định `coachAttendanceCutoverOpen() = false`, client `HISTORY_COACH_ACCESS = false`. S01 không thể được khép chỉ bằng việc đổi marker.
2. Quy tắc Coach `historicalProof(data)` kiểm tra `historyAuthority` chứ không xác minh nguồn gốc tạo tài liệu cũ. Một marker tương lai đã có trên server trước cutover có thể được đọc sau khi mở quyền. Để khép phải kiểm kê chính xác, đầy đủ trên server và chứng minh cohort authority mới bằng **0** dưới khóa maintenance, không dựa vào cache/lọc trang.
3. Hệ thống đã có lớp đánh giá staging cần bản sao lưu nguồn server full, global attendance inventory, cặp Rules/indexes đúng, readTime thống nhất, hồ sơ nguồn gốc từng bản ghi, chữ ký chủ hệ thống, kiểm tra S01/rollback. Tái sử dụng `tools/v11r3/server-export.mjs`, `history-audit.mjs`, `tools/v11r2/cutover.mjs` theo quy trình quyền đã có, không bypass.
4. IndexedDB `attendanceJournal.js` có bug `request.onblocked` chỉ reject mà không reset `databasePromise`; lần mở lại trong phiên vẫn giữ Promise bị reject. Đã sửa reset + đóng connection trả về trễ. Không thay enqueue, importLegacy, replay, ACK, CAS, worker, Rules, tài chính.
5. Mã nguồn còn `js/utils/offline-queue.js` với store `taekwondo_cache/offline_queue` từng hỗ trợ ghi offline; `tools/v11r3/capture-legacy.mjs` hiện chỉ chụp localStorage và `tst-attendance-journal-v3`. Vì chưa có inventory IndexedDB legacy an toàn, không thể chứng minh hàng đợi cũ trống hoặc từng được sử dụng. Không tự chạy queue processor, không khôi phục bằng replay.
6. Chưa có server backup, các thiết bị V1/V2/V3 hoặc owner signed approval trong các tệp người dùng gửi. Vì vậy không biết lượng chưa ACK, conflict, bản ghi cũ hay tình trạng cohort thực tế.

## Patch runtime duy nhất
- `js/data/attendanceJournal.js` và mirror `public/js/data/attendanceJournal.js`: sửa lifecycle IndexedDB khi `onblocked` và `onsuccess` đến muộn. RED trên baseline A9R7, GREEN trên A9R8.
- Không sửa `app.js`, `firestore.rules`, `js/core/attendanceContract.js`, `js/modules/attendance.js`, `js/services/attendance.service.js`, `coachBranchRuntimeRepair.js`, Finance hoặc QR.

## Công cụ đọc / kiểm toán bổ sung
- `tools/a9r8/journal-readonly-audit.mjs`: nhận bản sao lưu do owner thu thập qua quy trình chấp thuận hiện hữu; xác minh hash và scope, phân loại V1/V2, pending/inflight/needs-review/conflict, ACK, dependencies, unowned rows, kiểm toán phủ thiết bị. Chỉ xuất **số lượng và mã cảnh báo**, không xuất raw/UID/tên người trong báo cáo. Không thêm writer, không tự gán quyền dữ liệu legacy.
- Đọc kết quả A9R7 với phân biệt S01 proof PASS vẫn là release BLOCKED.
- `Run-A9R8-Offline.ps1` để kiểm tra offline trên Windows.

## Kiểm thử
- RED baseline lỗi blocked retry: FAIL đúng mục tiêu (lượt retry thứ hai không gọi indexedDB.open).
- GREEN A9R8: 3/3 PASS giả lập vòng đời IndexedDB.
- 14/14 PASS bộ phân loại/kiểm chứng backup đọc-only, gồm phản ví dụ giả mạo S01.
- 21/21 PASS điểm vào chức năng Điểm danh; 9/9 PASS bảo vệ ghi; root/public 128/128 PASS; syntax PASS (268 JS + 8 inline).
- Kiểm thử journal V2 đầy đủ: **ENV_BLOCKED** vì thiếu dependency Playwright; phần hợp đồng ban đầu báo 13 PASS rồi dừng.
- Cutover-gates A9R8: **SOURCE_RUNTIME_NOT_ACCEPTED** (source pin A9R6 cũ; giữ FAIL có chủ đích, cần ký duyệt/pin nguồn A9R8 độc lập). Không chỉnh test expected.
- Gate `check-attendance-canonical-ownership`: **FAIL kế thừa** do `app.js` 703,656 > 700,000 byte; 11,317 > 11,300 dòng. Không thay ngưỡng.
- Firestore Emulator/browser physical staging A9R8: **CHƯA CHẠY**.

## Chứng cứ còn thiếu (không giả lập)
1. Server snapshot **được phép** và ghi nhận fixed read time, pagination completeness, global collection-group `attendance` inventory; đối chiếu mọi `historyAuthority` dự kiến và branch-at-attendance, giả marker cohort phải bằng 0. Tốt nhất làm trên **staging riêng**, không lấy production làm test.
2. Device backup V1/V2/V3 của mọi principal/browser/origin có lịch sử điểm danh được kiểm kê, gồm pending/inflight/conflict/needs-review/ACK. Đối soát ACK theo `attendanceVersion`/`intent.id` từ server, mất ACK retry không phát sinh ghi đúp. Nếu thiếu bất kỳ thiết bị, giữ HOLD.
3. Người quản trị duyệt mapping chủ thể và ca lịch sử, phục hồi thủ công có dấu vết; không auto replay/import/cấp `historyAuthority` mới cho legacy.
4. Đánh giá chỉ số Rules-dependent READS, 3 lần CAS retry, snapshot/listener and reconnect budget cho 20 CLB; thiết bị Android/iOS offline/online và logout-login nhiều tài khoản.
5. Cutover mới phải dùng đúng source pin đã duyệt, signed decision/provenance và rollback. A9R8 hiện không có chứng nhận đó.

## Quyết định
`S01 RELEASE_BLOCKED`, `JOURNAL HISTORICAL AUDIT INCOMPLETE`, `A9R8 TEST_ONLY`, `NO DEPLOY`, `NO AUTHORITY CHANGE`, `NO FINANCIAL WRITE`.
