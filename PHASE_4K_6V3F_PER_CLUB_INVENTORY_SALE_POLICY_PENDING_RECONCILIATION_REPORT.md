# Phase 4K-6V3F — Per-Club Inventory Sale Policy + Pending Stock Reconciliation

Ngày hoàn thành: 18/06/2026

## 1. Mục tiêu

Cho phép mỗi CLB tự chọn cách xử lý sản phẩm Kho trong hai luồng:

- ➕ Thêm võ sinh.
- 💳 Thu gộp khoản.

Ba chế độ được hỗ trợ:

1. `strict` — bắt buộc hàng đang còn tồn và trừ tồn ngay.
2. `allow_pending` — cho phép bán tạm, ghi nhận tiền/công nợ trước và bổ sung Kho sau.
3. `disabled` — CLB không quản lý tồn kho; chỉ ghi nhận giao dịch tài chính.

Mặc định tất cả CLB cũ và CLB mới vẫn là `strict`. Không có migration dữ liệu và không làm thay đổi hành vi CLB hiện tại sau khi cập nhật.

## 2. Các vấn đề bắt buộc phải xử lý

### 2.1 Không được cho tồn kho âm

Khi ở chế độ `strict`, số tồn mới nhất được đọc và kiểm tra trong cùng Firestore transaction với thao tác xuất Kho. Hai thiết bị không thể đồng thời bán cùng đơn vị cuối cùng rồi cùng ghi thành công.

### 2.2 Tách trạng thái thanh toán và trạng thái Kho

Một giao dịch có hai trạng thái độc lập:

- Tài chính: đã thu/chưa thu.
- Kho: `posted`, `pending`, hoặc `not_applicable`.

Không sử dụng trạng thái thanh toán để suy luận rằng tồn kho đã được trừ.

### 2.3 Ghi nguyên tử giao dịch và hồ sơ chờ

Ở chế độ bán tạm, giao dịch tài chính, component Kho, hồ sơ `inventoryPendingIssues` và số đếm pending trong `inventory_stats` được ghi trong cùng Firestore transaction.

Không thể xảy ra trường hợp đã ghi tiền nhưng thiếu hồ sơ chờ, hoặc có hồ sơ chờ nhưng thiếu giao dịch gốc.

### 2.4 Không cộng doanh thu hai lần khi đối soát

Doanh thu được ghi nhận tại giao dịch bán ban đầu. Khi bổ sung Kho sau, hệ thống chỉ:

- Kiểm tra tồn.
- Tạo bút toán xuất Kho.
- Trừ tồn.
- Đóng hồ sơ chờ.

Bút toán đối soát có `affectsRevenue: false` và `reconciliationOnly: true`.

### 2.5 Không làm sai Học phí/Báo nợ

Nếu Thu gộp có cả Học phí và sản phẩm Kho:

- Giao dịch canonical Học phí.
- `paidMonths`/`paidThroughMonth` của profile.
- Giao dịch tài chính.
- Bút toán Kho hoặc hồ sơ pending.
- Các khoản nợ Kho được đánh dấu đã thu.

đều dùng cùng atomic boundary. Việc sản phẩm ở trạng thái pending không làm thay đổi công thức Học phí hoặc Báo nợ học phí.

### 2.6 Không cho xóa giao dịch pending trực tiếp

Giao dịch còn hồ sơ chờ bị khóa hard-delete để tránh tạo hồ sơ mồ côi và sai doanh thu. Admin phải:

- Đối soát với tồn kho; hoặc
- Chuyển thành “Không quản lý tồn”.

Sau khi xử lý, các cờ pending được dọn đúng; giao dịch không bị khóa xóa vĩnh viễn.

### 2.7 Không tăng Reads lúc đăng nhập

Danh sách `inventoryPendingIssues`:

- Không có realtime listener ở bootstrap.
- Chỉ tải khi mở tab Kho.
- Mỗi lần tải tối đa 50 mục.
- Không quét transaction để tìm pending.

Cấu hình chính sách nằm trong `settings/main_config` vốn đã được tải.

### 2.8 Tenant isolation

Mọi dữ liệu cấu hình, pending, inventory, transaction và stats đều nằm dưới:

`clubs/{clubId}/...`

Không có state chính sách dùng chung giữa các CLB.

## 3. Thay đổi giao diện

### Cấu hình CLB

Thêm mục “Chế độ quản lý xuất bán Kho đồ” gồm:

- Bắt buộc lấy từ Kho.
- Cho phép bán tạm — bổ sung Kho sau.
- Không quản lý tồn kho.

### ➕ Thêm võ sinh

Ở chế độ `allow_pending`, có tùy chọn “Bán tạm — bổ sung Kho sau”, nhập size thủ công và lý do.

### 💳 Thu gộp khoản

Ở chế độ `allow_pending`, phần Kho có thể chuyển sang bán tạm. Học phí và các khoản khác vẫn xử lý bình thường trong cùng ranh giới ghi an toàn.

### Kho đồ

Thêm khu vực “Chờ bổ sung / đối soát Kho”, chỉ tải khi mở tab Kho. Admin có thể:

- Đối soát và trừ tồn.
- Chuyển sang không quản lý tồn.

## 4. Cấu trúc dữ liệu

### Cấu hình

```js
inventorySalePolicy: 'strict' | 'allow_pending' | 'disabled'
```

### Giao dịch tài chính/component

```js
inventoryPostingStatus: 'posted' | 'pending' | 'not_applicable'
affectsInventory: boolean
affectsRevenue: boolean
pendingInventoryIssueIds: string[]
relatedInvId: string
```

### Hồ sơ chờ

Collection:

`clubs/{clubId}/inventoryPendingIssues/{issueId}`

Các trường chính:

```js
{
  status: 'pending' | 'reconciled' | 'not_applicable',
  category,
  size,
  qty,
  saleAmount,
  studentName,
  profileId,
  memberId,
  saleTransactionId,
  pendingReason,
  affectsInventory: false,
  affectsRevenue: false
}
```

## 5. Ranh giới nghiệp vụ

- Tồn kho chính thức: `settings/inventory_stats`.
- Lịch sử Kho: collection `inventory`, phân trang.
- Công nợ Kho: complete query `unpaid == true` hiện có.
- Pending: collection riêng `inventoryPendingIssues`.
- Doanh thu: transaction/component tài chính gốc.
- Học phí: canonical tuition ledger V3D1.

Không dùng lịch sử 100 dòng đầu để tính tồn hoặc công nợ.

## 6. Firestore Rules

Đã thêm rule cho:

`clubs/{clubId}/inventoryPendingIssues/{issueId}`

- Thành viên CLB được đọc.
- Admin CLB/SuperAdmin được tạo, sửa, xóa.

Lưu ý: đưa mã nguồn lên GitHub Pages không tự deploy Firestore Rules. Nếu Rules production chưa có đường dẫn này, phải cập nhật Rules trong Firebase Console hoặc dùng Firebase CLI. Không cần Blaze hoặc Cloud Functions.

## 7. Firestore Index

Phase này không yêu cầu composite index mới vì query pending hiện chỉ lọc `status == 'pending'` và có `limit`.

## 8. File chính thay đổi

- `js/core/inventorySalePolicy.js` — mới.
- `js/services/inventoryPending.service.js` — mới.
- `app.js`.
- `index.html`.
- `js/main.js`.
- `js/core/tuitionMonthLedger.js`.
- `js/core/transactionDeleteIntegrity.js`.
- `js/services/inventory.service.js`.
- `js/services/students.service.js`.
- `js/modules/students.js`.
- `js/modules/inventory.js`.
- `js/ui/tabs.js`.
- `firestore.rules`.
- `tools/check-inventory-sale-policy-pending-reconciliation.mjs` — mới.

## 9. Kiểm thử phát hành

- `npm run check`: PASS, exit code 0.
- V3F chuyên biệt: 21/21 PASS.
- Canonical Tuition Ledger V3D1: 27/27 PASS.
- Inventory Ledger V2C: 33/33 PASS.
- Debt Profile Boundary V3D: 21/21 PASS.
- Financial Flow Guard: 19/19 PASS.
- Scale Readiness/Write Safety: 22/22 PASS.
- Production Stability Gate: 22/22 PASS.
- Syntax: 120 mục hợp lệ.

Các tình huống động đã kiểm tra:

- Bán tạm tạo giao dịch + pending nhưng không trừ tồn.
- Bán strict đủ tồn trừ đúng một lần.
- Bán strict thiếu tồn bị từ chối và không ghi một phần.
- Đối soát trừ tồn đúng một lần, không cộng doanh thu lại.
- Chuyển “không quản lý tồn” không thay đổi số tồn.
- Cờ pending được dọn sau xử lý.
- Giao dịch unresolved pending bị khóa xóa.
- Giao dịch đã xử lý không bị khóa xóa vĩnh viễn.
- Chế độ disabled chỉ ghi tài chính, không tạo bút toán/pending.

## 10. Smoke test sau deploy

1. CLB strict: thử bán sản phẩm hết tồn; hệ thống phải từ chối.
2. CLB allow_pending: bật bán tạm trong Thêm võ sinh; tiền/biên lai đúng, tồn không đổi, mục chờ xuất hiện.
3. Đối soát mục chờ khi đủ tồn; tồn giảm một lần, doanh thu không đổi.
4. Thu gộp Học phí + sản phẩm pending; profile Học phí và Báo nợ phải đúng.
5. Chuyển một mục pending thành không quản lý tồn; tồn không đổi, cờ pending được xóa.
6. Đổi sang CLB khác; chính sách không được dùng lẫn.
7. Kiểm tra Firebase Console để xác nhận không có listener pending ở bootstrap.

## 11. Giới hạn an toàn có chủ đích

- Không tự động đối soát khi CLB nhập hàng mới; Admin phải xác nhận để tránh gắn nhầm sản phẩm/size.
- Không cho tồn âm.
- Không cho hard-delete giao dịch còn pending.
- Danh sách chờ tải 50 mục/lần để bảo vệ Reads; sau khi xử lý mục hiện tại, làm mới sẽ đưa các mục còn lại vào danh sách.
