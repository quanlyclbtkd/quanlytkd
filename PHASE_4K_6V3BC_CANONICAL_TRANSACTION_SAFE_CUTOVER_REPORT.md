# Phase 4K-6V3B/C — Canonical Transaction Coverage + Safe Listener Cutover

## 1. Kết luận phương án

Phương án được chọn là **chuyển đổi theo từng CLB và từng tháng**, không quét toàn bộ lịch sử và không tắt ba listener cũ trước khi dữ liệu đạt parity.

Mục tiêu:

- Giữ nguyên nghiệp vụ Học phí, Thu gộp, Thêm võ sinh, Thi đai, Kho đồ và Chi phí.
- Chuẩn hóa giao dịch cũ của tháng đang mở bằng dữ liệu đã tải sẵn trong bộ nhớ.
- Chuyển từ ba listener `date + txMonth + packageMonths` sang một listener `accountingMonths`.
- Tự quay lại ba listener cũ nếu số lượng, ID hoặc tổng tiền không khớp.
- Không dùng Blaze, Cloud Functions hoặc migration toàn bộ collection.

## 2. Các phương án đã đánh giá

### Phương án A — Cắt ngay ba listener

Không chọn vì giao dịch cũ chưa có `accountingMonths` sẽ biến mất.

### Phương án B — Quét và migration toàn bộ giao dịch nhiều năm

Không chọn vì tạo lượng Reads và Writes lớn, khó rollback và không cần thiết đối với tháng không sử dụng.

### Phương án C — Backfill theo tháng từ dữ liệu listener đã tải

Được chọn vì:

- Kế hoạch backfill không tạo thêm Reads.
- Chỉ xử lý giao dịch của tháng Admin đang xem.
- Có thể kiểm tra giới hạn query trước khi ghi.
- Có parity và rollback.
- Sau cutover, các phiên sau chỉ dùng một listener cho tháng đó.

## 3. Các cổng an toàn đã triển khai

### Gate 1 — Chờ đủ cấu hình trước khi gắn transaction listener

Khi đăng nhập, hệ thống chờ snapshot `settings/main_config` có sẵn rồi mới chọn chế độ:

- `legacy`: ba listener.
- `canonical`: một listener.

Nhờ vậy tháng đã tối ưu không bị tải ba snapshot cũ trước rồi mới chuyển canonical.

Khi đổi CLB, settings gate và timer cũ được reset để không dùng nhầm cấu hình của CLB trước.

### Gate 2 — Ba nguồn cũ phải tải hoàn tất

Backfill chỉ được phép chạy khi đã nhận initial snapshot của:

- `byDate`.
- `byTxMonth`.
- `byPackageMonth`.

Nếu một nguồn chưa tải xong, thao tác bị chặn.

### Gate 3 — Không nguồn nào chạm giới hạn 1.200

Nếu bất kỳ query cũ trả về đúng giới hạn, hệ thống coi là có nguy cơ thiếu dữ liệu và không cho cutover.

### Gate 4 — Store phải khớp dữ liệu nguồn

Số document duy nhất trong `store.transactions` phải bằng số document duy nhất sau khi hợp nhất ba nguồn.

### Gate 5 — Mọi giao dịch phải suy ra được tháng canonical

Mỗi giao dịch của tháng đang mở phải tạo được `accountingMonths` chứa đúng tháng đó.

### Gate 6 — Backfill không quét Firestore

Backfill dùng dữ liệu đã có trong `store.transactions` và chỉ ghi bốn trường:

```javascript
accountingMonths
primaryAccountingMonth
accountingSchemaVersion
accountingBoundarySource
```

Các write được chia thành batch tối đa 400 document.

### Gate 7 — Tạm tháo ba listener trước khi backfill

Điều này tránh mỗi document vừa backfill kích hoạt lại cả ba listener và tạo Reads thay đổi không cần thiết.

### Gate 8 — Parity bắt buộc sau backfill

Canonical query được đối chiếu với bản sao dữ liệu legacy đã đóng băng trước khi ghi.

Phải đồng thời đạt:

- Số lượng document bằng nhau.
- Không thiếu ID.
- Không thừa ID.
- Tổng tiền bằng nhau.
- Canonical query không vượt giới hạn listener.

Chỉ khi tất cả điều kiện đạt, `readyForCanonicalCutover === true`.

### Gate 9 — Chỉ lưu cấu hình sau parity

Sau parity thành công, tháng được thêm vào:

```javascript
settings/main_config.canonicalTransactionReadMonths
```

Hệ thống tận dụng settings listener đã có, không tạo listener cấu hình mới.

### Gate 10 — Rollback

Nếu parity thất bại hoặc có exception:

- Không bật canonical mode.
- Tự gắn lại ba listener legacy.
- Các trường canonical đã ghi vẫn an toàn và giúp lần kiểm tra sau nhanh hơn.

Admin có thể rollback thủ công:

```javascript
await window.disableCanonicalTransactionRead('2026-06');
```

## 4. Cách sử dụng

Sau khi deploy và tải lại mạnh trình duyệt:

1. Đăng nhập bằng Admin.
2. Chọn tháng cần tối ưu.
3. Chờ danh sách giao dịch tải hoàn tất.
4. Trong tab Thu học phí, nhấn **⚡ TỐI ƯU READS**.
5. Kiểm tra số giao dịch và số bản ghi cần chuẩn hóa.
6. Xác nhận.
7. Khi thành công, nút đổi thành **✅ READS ĐÃ TỐI ƯU**.

Nên thực hiện trước cho tháng hiện tại. Các tháng cũ chỉ cần tối ưu khi thường xuyên mở chúng.

## 5. Tác động đến Firestore Reads

### Hoạt động bình thường trước cutover

Mỗi phiên/tháng dùng ba query realtime:

- `date`.
- `txMonth`.
- `packageMonths`.

Một document có thể bị đọc từ nhiều query.

### Hoạt động bình thường sau cutover

Chỉ còn:

```javascript
where('accountingMonths', 'array-contains', selectedMonth)
```

Một listener duy nhất cho tháng đã tối ưu.

### Chi phí một lần khi cutover

- Kế hoạch backfill: **0 Reads**.
- Backfill: Writes theo số document thiếu canonical fields.
- Parity canonical: khoảng bằng số giao dịch unique của tháng.
- Listener canonical ban đầu: khoảng bằng số giao dịch của tháng.
- Cập nhật `main_config`: một write nhỏ; settings listener nhận một document change.

Đây là chi phí một lần để giảm Reads cho các lần đăng nhập, reconnect và mở tháng sau đó.

## 6. Các API chẩn đoán

```javascript
window.printFirestoreReadAudit();
```

```javascript
window.planCanonicalTransactionCutover('2026-06');
```

Dry-run không đọc/ghi:

```javascript
await window.executeCanonicalTransactionCutover('2026-06', { dryRun: true });
```

Thực thi có kiểm soát:

```javascript
await window.executeCanonicalTransactionCutover('2026-06', {
  dryRun: false,
  confirmToken: 'ENABLE_CANONICAL_READ'
});
```

Kiểm tra chế độ hiện tại:

```javascript
window.getCanonicalTransactionReadMode(null, '2026-06');
```

## 7. File thay đổi chính

- `js/core/transactionCanonicalBoundary.js`
- `app.js`
- `js/main.js`
- `index.html`
- `package.json`
- `tools/check-canonical-transaction-safe-cutover.mjs`

## 8. Kết quả kiểm thử

- `check:canonical-transaction-safe-cutover`: **28/28 PASS**.
- V3A canonical boundary: **34/34 PASS**.
- Payment bundle runtime hotfix: **20/20 PASS**.
- Inventory ledger reconciliation: **33/33 PASS**.
- Transaction realtime safety: **46/46 PASS**.
- Toàn bộ `check:all`: **67/67 nhóm PASS** khi chạy độc lập song song.
- Syntax: PASS.
- Deploy package: PASS.
- `app.js`: 10.684 dòng, dưới giới hạn 10.700.

## 9. Phạm vi chưa xử lý

Phase này giảm Reads giao dịch sau khi từng tháng được cutover. Nó chưa xử lý:

- Listener toàn bộ võ sinh đang tập.
- Full profile scan của tab Báo nợ.
- Dashboard unified cache hoàn toàn.

Bước tiếp theo có hiệu quả cao là **Phase 4K-6V3D — Debt Summary Without Full Profile Scan**, nhưng chỉ nên thực hiện sau khi vận hành V3B/C ổn định và quan sát metrics thực tế.
