# Phase 4K-6V5U-2E — Attendance Excel `documentId` SDK Fix

## Mục tiêu

Khắc phục lỗi khi bấm **📊 Xuất Excel Điểm Danh**:

```text
Firebase SDK chưa sẵn sàng: documentId
```

Phạm vi sửa chỉ nằm ở Firebase SDK bootstrap và lazy report module. Không thay đổi dữ liệu điểm danh, schema Firestore, query theo tháng, công thức thống kê, quyền HLV, Học phí, Báo nợ, Đã nghỉ, Kho đồ hay Thi đai.

## Nguyên nhân gốc

`js/modules/reports/attendanceExcelReport.js` sử dụng:

```js
orderBy(documentId())
```

để phân trang ổn định theo document ID. Tuy nhiên, Firebase CDN bootstrap trong `index.html` trước đó:

- không import `documentId` từ `firebase-firestore.js`;
- không expose `documentId` trong `window._fb_init`;
- `js/firebase/config.js` cũng không chuyển tiếp dependency này trong shared SDK object.

Các dependency khác như `collection`, `query`, `where`, `orderBy`, `limit`, `startAfter`, `getDocs` đều có mặt, nên lỗi chỉ xuất hiện khi lazy module xuất Excel được tải.

Đây không phải lỗi thời điểm Firebase chưa tải xong. Đây là dependency bị thiếu cố định trong SDK bootstrap.

## Cách sửa

### 1. Bổ sung `documentId` vào CDN import

Trong `index.html` và `public/index.html`:

```js
import {
  ...,
  orderBy,
  documentId,
  where,
  ...
} from 'firebase-firestore.js';
```

### 2. Expose qua một SDK runtime duy nhất

```js
window._fb_init = {
  ...,
  orderBy,
  documentId,
  where,
  ...
};
```

Không tạo Firebase loader hoặc SDK object thứ hai.

### 3. Đồng bộ `firebase/config.js`

`documentId` được bổ sung vào shared SDK export để các module sau này không gặp lệch dependency giữa bootstrap và config.

### 4. Giữ nguyên một query path

Query xuất điểm danh vẫn là:

```js
where('month', '==', month)
orderBy(documentId())
startAfter(cursor)
limit(1000)
```

Không thêm fallback query, không thêm listener, không tạo Firestore read path thứ hai.

### 5. Cache-bust đúng lazy module

Đã cập nhật:

- `app.js` / `main.js` entry marker;
- `reportExportFacade.js` import marker;
- `attendanceExcelReport.js` dynamic import marker.

Điều này ngăn trình duyệt tiếp tục dùng lazy report module cũ sau deploy.

## Các file chính đã thay đổi

- `index.html`
- `public/index.html`
- `app.js`
- `public/app.js`
- `js/main.js`
- `public/js/main.js`
- `js/firebase/config.js`
- `public/js/firebase/config.js`
- `js/modules/reports/reportExportFacade.js`
- `public/js/modules/reports/reportExportFacade.js`
- `js/modules/reports/attendanceExcelReport.js`
- `public/js/modules/reports/attendanceExcelReport.js`
- `tools/check-v5u2e-attendance-excel-sdk-fix.mjs`
- `package.json`
- `public/package.json`

Một số regression gate cũ được cập nhật để nhận versioned lazy import/cache-bust V5U-2E. Chỉ assertion phiên bản/import được sửa; nghiệp vụ không bị thay đổi.

## Kiểm tra chuyên biệt

```text
check:v5u2e-attendance-excel-sdk-fix — PASS 22/22
```

Behavior test xác nhận:

- `documentId()` được gọi;
- `orderBy()` nhận đúng document-ID sentinel;
- query vẫn có `where + orderBy + limit`;
- toàn bộ mocked attendance docs được trả về;
- report module không có Firestore write hoặc realtime listener.

## Regression Điểm danh và báo cáo

```text
check:reports-module-syntax — PASS 8/8
check:report-export-lazy-isolation — PASS 115 assertions
check:attendance-canonical-ownership — PASS 141 assertions
check:attendance — PASS
check:attendance-schedule — PASS
check:attendance-offline-shift — PASS 18/18
check:attendance-shift-filter — PASS 10/10
check:coach-attendance-only-read-boundary — PASS 30/30
check:security-coach-branch-boundary — PASS 35/35
```

## Regression các phần đã ổn định

```text
check:v5u2-stability — PASS
check:tuition-debt-source-of-truth — PASS
check:debt-authoritative-tuition-coverage — PASS 32/32
check:transaction-delete-integrity — PASS 22/22
check:quit-tab-completeness — PASS 10/10
check:quit-tab-authoritative-completeness — PASS 9/9
check:quit-tab-mobile-parity — PASS 17/17
check:v5r-quit-single-source-lock — PASS 16/16
check:v5s-quit-context-render-loop-guard — PASS 16/16
```

## Pipeline tổng

```text
npm run check — PASS, exit code 0
npm run check:all:critical — PASS, exit code 0
check:deploy-package — PASS 12/12
```

## Rủi ro và tính ổn định

Rủi ro của bản sửa thấp vì:

- chỉ bổ sung một Firebase SDK export vốn đã được module report yêu cầu;
- không thay đổi query logic;
- không thay đổi dữ liệu hoặc write path;
- không thay đổi AttendanceService;
- không thay đổi HLV branch boundary;
- không thay đổi V5U-2 TuitionCommandBoundary;
- source và `public/` được đồng bộ.

## Deploy

Chỉ cần deploy **Hosting/source**.

Không cần đổi Firestore Rules cho lỗi này.

Sau deploy cần hard refresh hoặc xóa cache site. Build đúng:

```text
attendance-excel-documentid-sdk-fix-20260801-v5u2e
```

Kiểm tra thực tế:

1. Đăng nhập Admin.
2. Mở tab Điểm danh.
3. Chọn tháng.
4. Bấm **📊 Xuất Excel Điểm Danh**.
5. Console không còn `Firebase SDK chưa sẵn sàng: documentId`.
6. File Excel được tải và số lượng võ sinh/bản ghi đúng với tháng đã chọn.
