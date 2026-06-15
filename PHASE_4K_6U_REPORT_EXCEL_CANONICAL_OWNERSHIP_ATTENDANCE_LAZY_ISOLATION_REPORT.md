# Phase 4K-6U — Report/Excel Canonical Ownership + Attendance Export Lazy Isolation

Ngày hoàn thành: 2026-06-16  
Nguồn nâng cấp: Phase 4K-6T — Legacy Diagnostics, Pilot & Audit Tooling Isolation

## 1. Mục tiêu

- Giảm tiếp kích thước `app.js` mà không chạm vào Auth, realtime listener, render kernel hoặc các luồng ghi tài chính.
- Loại bỏ implementation Excel bị trùng trong `js/modules/finance.js`.
- Không tải `js/modules/reports.js` trong mọi lần đăng nhập.
- Tách xuất Excel điểm danh khỏi `app.js`.
- Bỏ giới hạn cố định 10.000 document của **xuất Excel điểm danh**, tránh tạo file thiếu dữ liệu mà không báo lỗi.
- Chốt canonical ownership cho các global báo cáo đang được inline HTML gọi.

## 2. Kiến trúc sau cập nhật

### 2.1 Eager facade nhỏ

Tạo mới:

```text
js/modules/reports/reportExportFacade.js
```

Facade được tải cùng `main.js`, chỉ chứa:

- mở modal và cập nhật bộ chọn kỳ;
- global bridge cho inline handler;
- dynamic import;
- viewer guard;
- shared import promise;
- in-flight action guard;
- phục hồi canonical global sau khi module legacy report khởi tạo.

Facade không có Firestore write API và không tạo realtime listener.

### 2.2 Heavy Reports lazy-load

`js/modules/reports.js` không còn được static import từ `main.js`.

Nó chỉ được tải khi người dùng thực sự gọi một trong các thao tác:

- `executeExcelExport`
- `exportAchievementsExcel`
- `exportExamPaidList`
- `executeTaxExport`

Sau khi `initReports()` tạo `window.ReportsModule`, facade phục hồi lại toàn bộ public globals về canonical owner. Vì vậy implementation nặng nằm trong API nội bộ, còn public entrypoint vẫn ổn định.

### 2.3 Attendance Excel lazy module

Tạo mới:

```text
js/modules/reports/attendanceExcelReport.js
```

Module chỉ tải khi gọi `exportAttendanceExcel`.

Query cũ:

```js
where('month', '==', selectedMonth), limit(10000)
```

được thay bằng cursor pagination:

- page size: 1.000 document;
- stable order: `orderBy(documentId())`;
- cursor: `startAfter(lastDocument)`;
- safety ceiling: 200 trang;
- cập nhật tiến trình theo số trang/document;
- nếu chạm trần khi vẫn còn dữ liệu, dừng và báo lỗi thay vì xuất file bị thiếu.

Runtime simulation đã lấy đầy đủ **10.500 document trong 11 trang**.

## 3. Canonical ownership

Canonical owner mới:

```text
js/modules/reports/reportExportFacade.js
```

Sở hữu 10 globals:

```text
openExcelExportModal
updateExcelPeriodOptions
exportToExcel
executeExcelExport
exportAchievementsExcel
exportExamPaidList
updateTaxPeriodOptions
executeTaxExport
exportAttendanceExcel
copyAttReport
```

Kết quả ownership:

- required canonical owners: 36/36;
- report owners: 10/10;
- ownership collision: 0;
- canonical reference replaced: 0;
- classic rollback references: 21/21 được giữ.

## 4. Bảo vệ runtime

### Viewer guard

Tài khoản `viewer` bị chặn trước khi dynamic import hoặc tải XLSX.

### Shared import promise

Nhiều lệnh gọi đồng thời dùng chung một promise tải module, không tải lặp `reports.js` hoặc `attendanceExcelReport.js`.

### Action in-flight guard

Mỗi loại export chỉ có một action promise đang chạy. Bấm nhanh nhiều lần không khởi động nhiều lượt đọc Firestore hoặc tải nhiều file cùng lúc.

### Rollback

`js/legacy/legacyUiFallbacks.js` giữ bridge nhỏ:

- mở modal và cập nhật kỳ vẫn hoạt động;
- copy báo cáo vẫn hoạt động;
- action cần module nặng hiển thị cảnh báo rõ nếu `main.js` không tải được.

Không sao chép lại implementation báo cáo nặng vào classic fallback.

## 5. Phần code đã xóa khỏi legacy

### `app.js`

Đã xóa:

- Excel/Tax bridge cũ;
- exam/achievement report bridge cũ;
- toàn bộ `exportAttendanceExcel`;
- `copyAttReport` implementation.

### `js/modules/finance.js`

Đã xóa duplicate implementation:

- `openExcelExportModal`;
- `updateExcelPeriodOptions`;
- `exportToExcel`;
- `executeExcelExport` và toàn bộ workbook builder bị trùng.

Implementation báo cáo canonical vẫn nằm trong `js/modules/reports.js` và chỉ tải khi dùng.

## 6. Chỉ số trước và sau

| Chỉ số | Phase 4K-6T | Phase 4K-6U | Chênh lệch |
|---|---:|---:|---:|
| `app.js` | 758.250 bytes | **730.409 bytes** | **-27.841 bytes (-3,67%)** |
| Dòng `app.js` | 12.110 | **11.681** | **-429 dòng** |
| `finance.js` | 98.041 bytes | **68.627 bytes** | **-29.414 bytes (-30,0%)** |
| Dòng `finance.js` | 1.758 | **1.316** | **-442 dòng** |
| Static dependency graph của `main.js` | 1.811.052 bytes | **1.694.306 bytes** | **-116.746 bytes (-6,45%)** |
| `app.js` + startup static graph | 2.569.302 bytes | **2.424.715 bytes** | **-144.587 bytes (-5,63%)** |
| Toàn bộ runtime JS (`app.js` + `js/`) | 2.703.898 bytes | **2.684.366 bytes** | **-19.532 bytes** |
| Global trùng app/module | 162 | **154** | **-8** |

Các lazy payload không còn nằm trong startup graph:

- `js/modules/reports.js`: 98.143 bytes;
- `js/modules/reports/attendanceExcelReport.js`: 23.724 bytes.

## 7. Ranh giới không thay đổi

Phase này không thay đổi:

- Firestore schema, rules hoặc indexes;
- Authentication và phân quyền;
- realtime listener;
- `initSaaSDatabase`, `listenToData`, `renderApp`, `scheduleRender`;
- `quickPay`, `processMultiItem`, `deleteTx`, `markInvPaid`;
- thu lệ phí thi, hủy lệ phí thi;
- `processBatchUpgrade` và bản sửa tách thăng đai khỏi thu phí;
- transaction components và canonical exam ledger;
- logic học phí, Báo nợ, Kho đồ.

Các module report mới không có:

```text
setDoc
updateDoc
addDoc
deleteDoc
writeBatch
runTransaction
onSnapshot
```

## 8. Kết quả kiểm tra

### Syntax

- JavaScript files: 106;
- inline scripts: 8;
- tổng: 114;
- kết quả: PASS.

### Phase 4K-6U gate

```text
npm run check:report-export-lazy-isolation
```

- 114 assertions;
- lazy loading, viewer gate, rollback, ownership, no-write boundary;
- actual lazy initialization của `reports.js`;
- canonical restoration sau lazy init;
- pagination simulation 10.500 document;
- kết quả: PASS.

### Default system gate

```text
npm run check
```

- 12 command groups;
- kết quả: PASS.

### Full system gate

```text
npm run check:all
```

- 58 command groups;
- kết quả: PASS.

### Critical production gate

```text
npm run check:all:critical
```

- 80 command groups;
- kết quả: PASS.

### Report/Exam checks bổ sung

- `check:reports-module-syntax`: 8/8 PASS;
- `check:exam-export-belt-sort`: 13/13 PASS;
- `check:exam-export-download`: 10/10 PASS.

Không ghi nhận test failure, `SyntaxError`, `ReferenceError` hoặc `TypeError` trong các suite cuối cùng.

## 9. Giới hạn xác minh

Automated checks xác nhận source contract, runtime simulation, ownership và query pagination. Chúng không thay thế hoàn toàn:

- kiểm thử Firebase production bằng dữ liệu thật;
- tải file XLSX thực tế trên Safari iOS/Chrome Android;
- thử mạng yếu hoặc mất mạng giữa lúc dynamic import;
- đo Firestore read thực tế trên một CLB lớn.

Nên triển khai canary cho một CLB trước khi cập nhật đồng loạt.

## 10. Phát hiện còn lại ngoài phạm vi 4K-6U

Màn hình thống kê điểm danh tháng trong `app.js` vẫn có query UI giới hạn 10.000 document. Phase này đã sửa **xuất Excel điểm danh**, nhưng chưa thay đổi query render trên màn hình để tránh mở rộng phạm vi sang Attendance runtime. Với CLB rất lớn, đây là hạng mục nên xử lý bằng pagination/aggregation ở phase riêng.
