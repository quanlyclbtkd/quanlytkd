# Phase 4K-6V5C — Transaction Delete Reconcile + Smart Student Search

## Mục tiêu

Sửa hai lỗi người dùng báo:

1. Tab Học phí không xóa được giao dịch, console báo:
   `finance.js?v=payment-bundle-runtime-hotfix-20260616-v3a1:374 FirebaseError: Missing or insufficient permissions`.
2. Sau khi xóa giao dịch học phí phải trả đúng nợ ở tab Báo nợ.
3. Nâng cấp tìm kiếm tên võ sinh để nhập tên riêng như `Uyên` vẫn tìm được `Bảo Uyên`, không cần nhập đủ họ tên.

## Nguyên nhân chính

### 1. Giao diện production vẫn tải finance bundle quá cũ

`js/main.js` của bản trước vẫn import:

- `./modules/finance.js?v=payment-bundle-runtime-hotfix-20260616-v3a1`
- `./modules/inventory.js?v=payment-bundle-runtime-hotfix-20260616-v3a1`
- `./modules/dashboard.js?v=payment-bundle-runtime-hotfix-20260616-v3a1`

Điều này làm trình duyệt có thể dùng lại cache cũ của finance module. Vì vậy lỗi console chỉ vào bundle V3A1 thay vì bản V5B/V5A mới.

### 2. Firestore Rules vẫn chặn Admin CLB xóa transactions

Trong `firestore.rules`, `transactions/{transactionId}` vẫn chỉ cho SuperAdmin delete:

```js
allow delete: if isSuperAdmin();
```

Vì vậy Admin CLB bấm xóa giao dịch bị `Missing or insufficient permissions`.

### 3. Reconcile học phí sau xóa cần đọc authoritative Firestore

Khi xóa giao dịch học phí, nếu chỉ dùng cache giao dịch đang xem thì có thể tính sai `paidMonths/paidUntil`, vì cache phân trang chỉ chứa tháng/trang hiện tại. V5C đọc lại giao dịch còn lại của võ sinh từ Firestore trước khi tính lại nợ.

### 4. Tìm kiếm tên còn cần nâng cấp token tên

Search cũ đã có bỏ dấu nhưng cần tăng độ chính xác cho tên riêng/cuối tên. V5C thêm score theo token tên để `Uyên` ưu tiên khớp `Bảo Uyên`.

## Thay đổi chính

### Firestore Rules

- Cho phép `isClubAdmin(clubId)` xóa giao dịch sai.
- Coach/Viewer vẫn bị chặn.

```js
allow delete: if isSuperAdmin() || isClubAdmin(clubId);
```

### Cache-bust runtime

Cập nhật toàn bộ entry/import quan trọng sang:

```txt
tx-delete-reconcile-smart-search-20260703-v5c
```

Đặc biệt đã bỏ import stale V3A1 của finance/inventory/dashboard trong `main.js`.

### Finance delete flow

- `finance.js` bắt lỗi permission-denied, không còn `Uncaught (in promise)`.
- Sau khi xóa thành công gọi `reloadTransactionsPage()` để dòng giao dịch biến mất ngay.
- Invalidate lại `tx.txList`, `students.debtList`, dashboard.
- Legacy `app.js` fallback cũng gọi reconcile canonical nếu main.js đã sẵn sàng.

### Reconcile Báo nợ sau xóa

- `reconcileStudentTuitionAfterDeletedTransaction()` trong `main.js` đọc lại các giao dịch còn lại theo `description == studentName`.
- Sau đó mới tính lại:
  - `paidMonths`
  - `paidUntil`
  - trạng thái nợ ở tab Báo nợ

### Smart Student Search

- `StudentSearchIndex` thêm token scoring:
  - `name-token-exact`
  - `name-token-prefix`
  - `name-token-contains`
- Index thêm `fullName`, `studentName`, `searchName`, `branchCode`.
- `searchRuntime` và `StudentService` fallback cũng thêm các trường này.
- Có test động xác nhận nhập `Uyên` trả về `Bảo Uyên`.

## Files chính đã sửa

- `firestore.rules`
- `index.html`
- `app.js`
- `js/main.js`
- `js/modules/finance.js`
- `js/services/finance.service.js`
- `js/core/studentSearchIndex.js`
- `js/modules/searchRuntime.js`
- `js/services/students.service.js`
- `js/ui/render/renderStudents.js`
- `js/ui/render/listComputationRefresh.js`
- `package.json`
- `tools/check-v5c-tx-delete-reconcile-smart-search.mjs`
- các mirror tương ứng trong `public/`

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 14/14
- `npm run check:finance-indexes` — PASS 9/9
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `npm run check:student-search-index` — PASS
- `npm run check:search-runtime-v2` — PASS
- `npm run check:search-latency-optimization` — PASS
- `npm run check:inventory-consumer-hydration-hotfix` — PASS 25/25
- `npm run check:inventory-dynamic-size-catalog` — PASS 28/28
- `npm run check:inventory-ledger-reconciliation` — PASS 33/33
- `npm run check:firestore-read-attribution-canonical-tx-boundary` — PASS 34/34
- `npm run check:payment-bundle-runtime-hotfix` — PASS 20/20
- `npm run check:canonical-transaction-safe-cutover` — PASS 27/27
- `npm run check:debt-profile-read-boundary` — PASS 23/23
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:tuition-debt-source-of-truth` — PASS

`npm run check` đầy đủ đã chạy qua nhiều nhóm không lỗi nhưng bị timeout ở môi trường tool sau các nhóm inventory; các nhóm trọng yếu liên quan Học phí/Xóa giao dịch/Báo nợ/Search/HLV/Rules đã chạy riêng và PASS.

## Ghi chú deploy bắt buộc

Bản này có sửa `firestore.rules`, nên phải deploy cả:

1. Hosting/source
2. Firestore Rules

Nếu chỉ deploy source mà không deploy Rules, Admin CLB vẫn có thể bị `Missing or insufficient permissions` khi xóa transaction.

Sau deploy nên hard refresh/xóa cache trình duyệt, vì lỗi console đang cho thấy production đã tải bundle cũ `payment-bundle-runtime-hotfix-20260616-v3a1`.
