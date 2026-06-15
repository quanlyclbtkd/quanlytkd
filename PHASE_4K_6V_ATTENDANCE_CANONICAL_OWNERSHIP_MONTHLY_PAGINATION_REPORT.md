# PHASE 4K-6V — ATTENDANCE CANONICAL OWNERSHIP + MONTHLY PAGINATION + LEGACY DUPLICATE CLEANUP

Ngày thực hiện: 16/06/2026  
Baseline: Phase 4K-6U — Report/Excel Canonical Ownership + Attendance Export Lazy Isolation

## 1. Mục tiêu

Phase này tiếp tục giảm `app.js` theo hướng production-safe, tập trung vào khối Điểm danh đã tồn tại đồng thời trong:

- `app.js` legacy;
- `js/modules/attendance.js`;
- các bridge và monkey-patch chạy theo thứ tự bootstrap.

Mục tiêu bắt buộc:

1. Chỉ còn một canonical owner cho attendance core.
2. Xóa implementation trùng khỏi `app.js` mà không đổi schema hoặc cấu trúc bản ghi điểm danh.
3. Không làm hỏng điểm danh theo ca, offline queue, bulk check-in, lịch sử võ sinh và ghi chú buổi tập.
4. Bỏ giới hạn cứng 10.000 document khi xem thống kê tháng.
5. Chống stale request khi đổi tháng/ngày nhanh.
6. Không chạm các luồng Finance, Thi Đai, Auth, listener kernel hoặc render kernel.

## 2. Phương án được chọn

Canonical owner:

```text
js/modules/attendance.js
```

Compatibility bridge tải trước `app.js`:

```text
js/legacy/legacyAttendanceFallbacks.js
```

Data access:

```text
js/services/attendance.service.js
```

Ownership enforcement:

```text
js/core/globalOwnershipRegistry.js
```

Phương án không sao chép toàn bộ implementation legacy sang một fallback khác. Fallback chỉ là bridge nhỏ để inline handler không bị `undefined` trong lúc ES module đang khởi tạo hoặc khi cache GitHub Pages lệch phiên bản.

## 3. Những phần đã chuyển sang canonical ownership

19 global attendance hiện do `js/modules/attendance.js` sở hữu:

```text
_getClubShifts
_ensureClubShiftsLoaded
_renderHomeBirthdayBanner
showAttMemberHistory
renderAttendanceList
onShiftChange
openShiftModal
closeShiftModal
addShift
deleteShift
toggleAttendance
toggleAttendanceStatus
bulkCheckIn
syncOfflineAttendance
switchAttSubTab
renderAttMonthly
printAttendanceStatus
printAttendanceSessionCompletion
printAttendanceBranchReport
```

Kết quả registry toàn hệ thống:

- Required canonical owners: **55/55**.
- Attendance canonical owners: **19/19**.
- Ownership collisions: **0**.
- UI/Report/Attendance classic rollback references: **40/40**.
- Canonical references bị thay thế sau bootstrap: **0**.

## 4. Các lỗi kiến trúc và lỗi tiềm ẩn đã sửa

### 4.1. Xóa duplicate attendance core khỏi `app.js`

Khối Điểm danh legacy hơn 1.300 dòng đã được xóa theo function boundary. Không cắt nguyên vùng mù để tránh xóa nhầm tài khoản HLV, ghi chú buổi tập hoặc notification logic nằm gần đó.

### 4.2. Xóa monkey-patch `renderAttendanceList`

Đã loại bỏ:

```javascript
const _origRenderAttendanceList = window.renderAttendanceList;
window.renderAttendanceList = async () => { ... };
```

Ghi chú buổi tập hiện được tải trong lifecycle rõ ràng của canonical `renderAttendanceList`, tránh phụ thuộc implementation nào được gán trước.

### 4.3. Chống ghi chú ngày cũ ghi đè ngày mới

`loadSessionNote()` được bổ sung sequence guard và kiểm tra lại:

- request sequence;
- `currentClubId`;
- ngày đang được chọn.

Khi HLV đổi ngày nhanh, response cũ không thể ghi đè ghi chú của ngày mới.

### 4.4. Sửa filter ca tập trong module

Module cũ có nhánh filter dễ loại sai dữ liệu khi không chọn ca. Logic mới:

- Không chọn ca: chấp nhận mọi record trong ngày.
- Có chọn ca: chỉ nhận đúng `shiftId`.
- Query theo ca được đẩy xuống Firestore để giảm read không cần thiết.

### 4.5. Sửa service method không đồng nhất

Call site dùng tên cũ `loadNotesByDate`, trong khi service chính thức là `loadCoachNotes`. Đã đồng bộ về `loadCoachNotes`.

### 4.6. Bỏ giới hạn cứng 10.000 record tháng

`AttendanceService.loadByMonth()` chuyển sang cursor pagination:

- page size mặc định: **1.000**;
- max pages mặc định: **200**;
- `where('month', '==', month)`;
- `startAfter(DocumentSnapshot)`;
- Firestore default document-ID ordering;
- progress callback;
- metrics;
- AbortSignal;
- safety ceiling.

Nếu chạm safety ceiling, hệ thống ném lỗi `attendance/monthly-max-pages` và dừng render thay vì âm thầm hiển thị dữ liệu thiếu.

### 4.7. Chống stale monthly request

Khi người dùng đổi tháng nhanh:

- request trước bị abort;
- request ID cũ bị vô hiệu hóa;
- response cũ không được render;
- progress UI chỉ cập nhật cho request hiện hành.

### 4.8. Chống listener online bị gắn nhiều lần

Listener đồng bộ offline dùng bind-once guard. Runtime test xác nhận:

- init lần đầu: 1 listener;
- init lần hai: vẫn 1 listener;
- đổi CLB: vẫn 1 listener.

### 4.9. Bảo toàn rollback reference đúng cách

Bộ test mới phát hiện một lỗi tinh vi: module gán function lên `window` trước khi registry đăng ký, khiến registry không còn nhìn thấy classic fallback ban đầu.

Đã sửa bằng cách:

1. chụp fallback references trước khi module gán canonical functions;
2. tạm phục hồi fallback tại thời điểm register;
3. để registry lưu fallback;
4. cài canonical implementation;
5. phục hồi canonical nếu registration lỗi.

Kết quả: 19/19 attendance rollback references được giữ đúng.

## 5. Mức giảm `app.js`

| Chỉ số | Phase 4K-6U | Phase 4K-6V | Thay đổi |
|---|---:|---:|---:|
| Dung lượng `app.js` | 730.409 bytes | **642.994 bytes** | **-87.415 bytes** |
| Logical lines | 11.682 | **10.344** | **-1.338 dòng** |
| `window.*` assignments | 306 | **287** | **-19** |
| Unique `window.*` globals trong `app.js` | 258 | **241** | **-17** |
| Duplicate names với module, cùng regex | 87 | **70** | **-17** |

`attendance.js` tăng do nhận canonical implementation, stale guards, pagination orchestration và ownership diagnostics. Đây là code có owner rõ ràng, không phải duplication mới.

## 6. Những ranh giới không thay đổi

Phase này không thay đổi:

```text
processMultiItem
quickPay
deleteTx
markInvPaid
cancelExamPayment
processBatchUpgrade
initSaaSDatabase
listenToData
renderApp
scheduleRender
```

Không thay đổi:

- Firestore schema;
- Firestore rules;
- cấu trúc document attendance;
- trạng thái điểm danh 0/1/2/3;
- logic Thu học phí;
- Thu gộp khoản;
- Kho đồ;
- Thu/Hủy lệ phí thi;
- bản sửa chống thu phí lần hai khi Xác nhận thăng đai;
- Auth và role permissions.

## 7. Regression gate mới

Đã tạo:

```text
tools/check-attendance-canonical-ownership.mjs
```

Gate gồm **141 assertions**, kiểm tra:

- bootstrap/cache keys;
- xóa duplicate trong `app.js`;
- 19 canonical owners;
- rollback references;
- collision;
- bind-once listener;
- reset state khi đổi CLB;
- shift-aware daily query;
- session-note stale guard;
- monthly cursor pagination;
- AbortController;
- stale response;
- safety ceiling;
- protected financial/runtime boundaries;
- kích thước và số dòng `app.js`.

Runtime pagination simulation:

- tải đủ **10.500 documents**;
- **11 trang**;
- không duplicate;
- progress callback đủ 11 lần;
- abort trả `attendance/monthly-load-aborted`;
- max-pages trả `attendance/monthly-max-pages`;
- không trả array bị cắt.

## 8. Kết quả kiểm tra toàn hệ thống

### Syntax

- JavaScript files: **107**.
- Inline scripts: **8**.
- Tổng mục kiểm tra: **115**.
- Kết quả: **PASS**.

### Attendance regression

- Attendance reliability: **20/20 PASS**.
- Scheduled accuracy: **22/22 PASS**.
- Offline/shift: **18/18 PASS**.
- Shift filter: **10/10 PASS**.
- Phase 4K-6V dedicated gate: **141/141 PASS**.
- Scale readiness: **68/68 PASS**.
- Search bindings/stability: **26/26 PASS**.

### Ownership / prior phases

- Global ownership adoption cleanup: **105 assertions PASS**.
- Diagnostics tooling isolation: **114 assertions PASS**.
- Report/Excel lazy isolation: **115 assertions PASS**.

### Composite suites

- `npm run check`: **PASS**.
- `npm run check:all`: **60 command entries, PASS**.
- `npm run check:all:critical`: **82 command entries, PASS**.

Không phát hiện trong log cuối:

```text
FAIL:
npm ERR!
SyntaxError
ReferenceError
TypeError
Command failed
```

## 9. Giới hạn còn lại và bước vận hành

1. Daily attendance list vẫn có hard safety limit 1.200 record. Khi chọn ca, query đã lọc phía server; khi chạm limit hệ thống cảnh báo rõ. Với CLB rất lớn, phase sau nên pagination hoặc tách daily summary.
2. Monthly pagination bảo đảm đầy đủ dữ liệu, nhưng đọc 10.000–30.000 document mỗi lần vẫn tốn chi phí. Bước scale dài hạn nên là `attendanceMonthlyStats` aggregation.
3. Automated tests không thay thế hoàn toàn Firebase production, iPhone Safari, Android WebView và mạng yếu thật.
4. Nên canary trên một CLB trước khi phát hành đồng loạt:
   - điểm danh ngày;
   - chọn ca;
   - bulk check-in;
   - offline rồi online;
   - đổi ngày nhanh và kiểm tra ghi chú;
   - đổi tháng nhanh;
   - thống kê tháng;
   - tài khoản HLV/Admin;
   - logout và đăng nhập CLB khác.

## 10. Kết luận

Phase 4K-6V đã đạt mục tiêu chính:

- Attendance core chỉ còn một canonical owner.
- Xóa hơn 87 KB và 1.338 dòng khỏi `app.js`.
- Không còn monkey-patch `renderAttendanceList`.
- Không còn giới hạn cứng 10.000 record tháng.
- Không render stale response khi đổi tháng/ngày.
- Không duplicate online listener.
- Rollback reference được bảo toàn.
- Các luồng tài chính, Thi Đai, Auth và render kernel không bị thay đổi.
- Toàn bộ default/full/critical regression suites đều PASS.
