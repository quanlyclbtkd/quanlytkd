# Phase 4K-6V2 — Inventory History Pagination + Complete Active Debt Listener

**Ngày hoàn thành:** 16/06/2026  
**Mục tiêu:** tải đầy đủ công nợ Kho cho CLB 1.000–1.500 võ sinh nhưng không đọc toàn bộ lịch sử Kho khi đăng nhập.

## 1. Kiến trúc sau nâng cấp

### Inventory history

- Bỏ listener toàn cục `limit(500)` cho lịch sử Kho.
- Không tải lịch sử Kho khi đăng nhập hoặc khi tab Kho đang đóng.
- Khi mở tab Kho, tải trang đầu tối đa **100 document**.
- Nút **⬇ Tải thêm 100 bản ghi** dùng `startAfter(lastDocument)`.
- Dữ liệu tải thêm được gộp theo document ID và giữ thứ tự mới nhất trước.
- Sau thao tác thêm/sửa/xóa/đã thu, lịch sử được đánh dấu stale; chỉ refresh ngay nếu tab Kho đang mở.

### Complete active inventory debts

- Một listener canonical duy nhất theo CLB:
  `where('unpaid', '==', true)` và **không có limit**.
- Listener chỉ đọc những document đang nợ, không đọc toàn bộ lịch sử nhập/xuất.
- Snapshot công nợ được lưu vào `inventoryStore.financeInventoryDebts` và rebuild index một lần.
- Recent history không còn quyền derive hoặc ghi đè danh sách công nợ.
- Khi listener lỗi, trạng thái chuyển `partial/failed` và giao diện cảnh báo không Thu gộp cho tới khi kết nối phục hồi.
- Khi đổi CLB, mirror công nợ được reset để tránh hiển thị dữ liệu tenant trước.

### Debt identity

Thứ tự nhận dạng:

1. `profileId`
2. `memberId`
3. tên võ sinh đã chuẩn hóa

Dữ liệu mới từ thêm võ sinh, bán Kho, sửa giao dịch và Thu gộp được bổ sung identity khi có thể. Dữ liệu cũ không cần migration và vẫn tra theo tên.

## 2. Tương thích số tồn Kho

Lịch sử 100 bản ghi chỉ phục vụ bảng hiển thị, không được xem là toàn bộ lịch sử để tính tồn. Renderer sử dụng `settings/inventory_stats` làm lớp tổng hợp canonical và overlay lên dữ liệu lịch sử đã tải. Luồng Thu gộp vẫn có lớp fallback tương thích hiện hữu.

## 3. Theo dõi lượt đọc

Mở Console và chạy:

```javascript
window.printInventoryReadMetrics()
```

Các chỉ số chính:

- `historyNetworkFetches`
- `historyDocsRead`
- `historyPagesLoaded`
- `historySkippedClosedTab`
- `debtListenerInitialDocs`
- `debtListenerChangedDocs`
- `completeDebtCount`
- `debtCompleteness`

## 4. Phạm vi không thay đổi

- Không dùng Blaze.
- Không dùng Cloud Functions.
- Không migration hàng loạt.
- Không đổi collection hiện tại.
- Không thay nghiệp vụ Thu gộp, Đã thu hoặc giao dịch doanh thu Kho.

## 5. Kiểm thử tự động

Lệnh riêng:

```bash
npm run check:inventory-history-active-debt
```

Checker xác nhận:

- Trang lịch sử là 100 document và dùng cursor.
- Không còn global inventory-history listener 500 document trong Phase 4K-6V2.
- Công nợ dùng một listener `unpaid == true`, không limit.
- History không thể ghi đè công nợ canonical.
- Lookup hoạt động theo `profileId`, `memberId`, tên chuẩn hóa.
- Các đường ghi mới bổ sung identity.
- Dynamic regression test mô phỏng khoản nợ cũ nằm ngoài 100 bản ghi gần nhất.

## 6. Lưu ý vận hành

Phase này giảm mạnh Reads nhưng không làm Reads bằng 0. Khi listener công nợ khởi tạo, Firestore vẫn đọc số document thực tế đang có `unpaid == true`; sau đó đọc các document công nợ thay đổi. Đây là hành vi cần thiết để công nợ luôn đầy đủ và realtime.

## 7. Kết quả xác minh bản đóng gói

- `npm run check`: **PASS**.
- Kiểm tra cú pháp: **115/115 mục hợp lệ**.
- Kiểm tra riêng Phase 4K-6V2: **25/25 PASS**.
- Spark Dashboard Phase 4K-6V1: **17/17 PASS**.
- MultiItem inventory hydration: **16/16 PASS**.
- Inventory finance rollup: **43/43 PASS**.
- Debt full coverage, debt action sync và debt service bridge: **PASS**.

## 8. Ranh giới của Phase 4K-6V2

Phase này bảo đảm **công nợ Kho đầy đủ** và **lịch sử Kho phân trang**. Nó không tự quét lại toàn bộ lịch sử cũ để tái tạo `settings/inventory_stats`, vì việc đó sẽ phát sinh một đợt đọc toàn bộ dữ liệu và tương đương một bước migration/reconciliation. Renderer tiếp tục ưu tiên summary hiện có và dùng lịch sử đã tải làm fallback tương thích. Việc kiểm tra hoặc tái tạo summary tồn kho cũ nên được thực hiện trong một phase riêng nếu CLB phát hiện số tồn hiện tại vốn đã không chính xác.
