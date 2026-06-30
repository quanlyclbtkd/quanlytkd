# Phase 4K-6V4D11 — Attendance Excel + Transaction Delete Reconcile

## Mục tiêu
Sửa hai lỗi production user báo:

1. Tab Điểm danh → `📊 Xuất Excel Điểm Danh` báo: `Firebase SDK chưa sẵn sàng: documentId`.
2. Tab Học phí → thao tác `🗑 xóa Giao dịch` bị `Missing or insufficient permissions`; khi xóa giao dịch thu học phí cần khôi phục đúng trạng thái nợ ở tab Báo nợ.

## Nguyên nhân

### 1. Xuất Excel Điểm danh lỗi `documentId`
`attendanceExcelReport.js` dùng `orderBy(documentId())` để phân trang điểm danh theo document ID, nhưng bootstrap Firebase trong `index.html` chưa import và chưa expose `documentId` vào `window._fb_init`. Vì vậy module export thấy SDK thiếu `documentId` và dừng trước khi đọc dữ liệu.

### 2. Xóa giao dịch học phí bị permission-denied
`firestore.rules` đang cho Club Admin tạo/cập nhật giao dịch, nhưng delete transaction chỉ cho SuperAdmin. Vì vậy tài khoản Admin CLB bấm xóa giao dịch học phí sẽ bị Rules chặn.

### 3. Reconcile học phí sau xóa có thể dựa vào cache trang hiện tại
Luồng reconcile sau delete dùng transaction cache phân trang trong store. Cache này có thể chỉ chứa tháng/trang đang xem, không phải toàn bộ lịch sử học phí của võ sinh. Nếu dùng cache này để tính `paidMonths/paidUntil`, tab Báo nợ có thể không khôi phục chính xác tháng vừa xóa.

## Sửa đổi chính

- `index.html` và `public/index.html`: import `documentId` từ Firebase Firestore CDN và expose vào `window._fb_init`.
- `app.js` và `public/app.js`: bổ sung destructuring `documentId` để SDK bridge đầy đủ.
- `attendanceExcelReport.js`: không coi `documentId` là hard dependency nữa; dùng `documentId()` nếu có, fallback `orderBy('__name__')` nếu trình duyệt còn giữ index cũ khi đang rollout.
- `firestore.rules` và `public/firestore.rules`: cho phép `isClubAdmin(clubId)` delete transactions; Coach/Viewer vẫn bị chặn.
- `finance.js`: bọc `FinanceService.deleteTransaction()` bằng `try/catch` để không còn Uncaught Promise, báo rõ nếu Rules chưa deploy.
- `finance.js`: sau khi delete thành công, gọi `reloadTransactionsPage()` để dòng giao dịch biến mất ngay.
- `main.js`: reconcile học phí sau xóa đọc lại authoritative transactions còn lại từ Firestore theo `description == studentName`, rồi mới tính `monthsToRemove`, `paidMonths`, `paidUntil`. Nếu đọc Firestore lỗi mới fallback về cache.
- Thêm regression check `tools/check-v4d11-attendance-excel-tx-delete-reconcile.mjs`.

## File đã chỉnh

- `index.html`
- `app.js`
- `firestore.rules`
- `js/modules/reports/attendanceExcelReport.js`
- `js/modules/finance.js`
- `js/main.js`
- `tools/check-report-export-lazy-isolation.mjs`
- `tools/check-v4d11-attendance-excel-tx-delete-reconcile.mjs`
- `package.json`
- Các file mirror tương ứng trong `public/`

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:report-export-lazy-isolation` — PASS 115 assertions
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:finance-indexes` — PASS 9/9
- `npm run check:v4d10-admin-tx-quit-authoritative` — PASS 11/11
- `npm run check:v4d11-attendance-excel-tx-delete-reconcile` — PASS 12/12
- `npm run check` — PASS toàn bộ pipeline

## Ghi chú deploy
Bản này có sửa `firestore.rules`, nên cần deploy cả Hosting/source và Firestore Rules. Nếu chỉ upload source mà không deploy Rules, Admin CLB vẫn có thể bị chặn khi xóa transaction.
