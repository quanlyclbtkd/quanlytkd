# Phase 4K-6V3BC1 — Automatic Canonical Transaction Optimization

## 1. Mục tiêu

Loại bỏ thao tác thủ công **⚡ TỐI ƯU READS** và chuyển cơ chế canonical transaction sang tự động theo từng CLB, từng tháng, nhưng vẫn giữ đầy đủ các cổng an toàn của V3B/C.

Bản này không tạo Cloud Functions, không yêu cầu Blaze và không quét toàn bộ collection giao dịch.

## 2. Vấn đề của phương án nút thủ công

- Mỗi CLB sử dụng tài khoản và dữ liệu riêng.
- Người vận hành không nên phải nhớ chạy một thao tác kỹ thuật dùng đúng một lần.
- Nút tồn tại lâu dài sau khi hoàn tất gây dư thừa giao diện và có thể khiến người dùng hiểu nhầm.
- Nếu một CLB không bấm nút, ba listener cũ tiếp tục hoạt động và lợi ích giảm Reads không được áp dụng.

## 3. Kiến trúc tự động được chọn

### 3.1 Quyết định read mode theo cấu hình riêng của CLB

Hệ thống tiếp tục đọc:

`clubs/{clubId}/settings/main_config.canonicalTransactionReadMonths`

- Tháng đã có trong cấu hình: gắn **một listener canonical**.
- Tháng chưa có: tạm thời gắn **ba listener legacy** để bảo đảm đủ dữ liệu.

Không có listener cấu hình mới. Hệ thống dùng lại settings listener đã tồn tại.

### 3.2 Chỉ lên lịch tự động khi ba nguồn legacy đã hoàn tất

Tự động tối ưu chỉ được lên lịch sau khi nhận đủ initial snapshot của:

- `date`
- `txMonth`
- `packageMonths`

Đồng thời:

- Không nguồn nào chạm giới hạn `txListenerLimit`.
- Store giao dịch khớp số document unique của ba snapshot.
- Tháng đang tối ưu chính là tháng đang mở.
- Tài khoản có quyền Admin phù hợp.
- Thiết bị đang online.
- Không có tiến trình cutover hoặc thao tác tài chính quan trọng đang chạy.

### 3.3 Không quét lại collection khi lập kế hoạch

Backfill plan dùng `window.__store.transactions`, tức dữ liệu ba listener đã tải sẵn.

Chi phí lập kế hoạch:

- `0 Firestore Reads`
- `0 Firestore Writes`

### 3.4 Backfill theo batch

Chỉ các giao dịch thiếu hoặc sai canonical fields mới được cập nhật:

- `accountingMonths`
- `primaryAccountingMonth`
- `accountingSchemaVersion`
- `accountingBoundarySource`

Mỗi batch tối đa 400 document.

Không thay đổi số tiền, nội dung, ngày, loại giao dịch, công nợ hoặc thông tin võ sinh.

### 3.5 Parity bắt buộc

Sau backfill, canonical query được đối chiếu với snapshot legacy đã đóng băng theo:

- Số lượng document.
- Tập document ID.
- Tổng số tiền.
- Nguy cơ vượt giới hạn query.

Chỉ khi khớp tuyệt đối mới ghi tháng vào `canonicalTransactionReadMonths`.

### 3.6 Rollback tự động

Nếu backfill, parity hoặc ghi cấu hình thất bại:

- Không bật canonical.
- Ba listener legacy được gắn lại.
- Hệ thống tiếp tục hoạt động theo kiến trúc cũ.
- Lần thử thất bại được cooldown 12 giờ trên thiết bị để tránh lặp Reads/Writes liên tục.

### 3.7 Tách biệt từng CLB

Khóa runtime và cooldown dùng:

`clubId + month`

Khi đổi CLB hoặc đăng xuất:

- Timer tự động của phiên cũ bị hủy.
- Không dùng nhầm trạng thái của CLB trước.

Trạng thái canonical thành công vẫn được lưu trong `main_config` của đúng CLB và có hiệu lực trên các thiết bị khác.

## 4. Điều chỉnh giao diện

Nút **⚡ TỐI ƯU READS** không còn được tạo.

Nếu trình duyệt còn giữ nút từ cache cũ, mã mới tự xóa nút khi:

- DOM sẵn sàng.
- App shell sẵn sàng.
- Settings được cập nhật.

Vẫn giữ API rollback khẩn cấp trong Console:

```javascript
await window.disableCanonicalTransactionRead('2026-06');
```

Kiểm tra trạng thái tự động:

```javascript
window.getAutomaticCanonicalTransactionOptimizationStatus();
```

## 5. Ảnh hưởng đến Firebase Reads

### Hoạt động thường ngày

Bản V3BC1 không thêm listener nền và không thêm query định kỳ.

### Lần tự động chuyển đổi đầu tiên của một tháng

- Lập kế hoạch: 0 Reads.
- Backfill: chỉ Writes cho document thiếu canonical fields.
- Parity: khoảng N Reads, với N là số giao dịch unique của tháng.
- Canonical listener khởi tạo: khoảng N Reads một lần.

Đây là chi phí một lần. Các lần đăng nhập/reconnect sau chỉ dùng một listener thay vì ba listener.

### Trường hợp không an toàn

Nếu query chạm giới hạn, role không phù hợp, thiết bị offline hoặc parity không đạt, hệ thống không bật canonical và không làm mất dữ liệu.

## 6. File thay đổi chính

- `js/core/transactionCanonicalBoundary.js`
- `app.js`
- `index.html`
- `tools/check-canonical-transaction-safe-cutover.mjs`
- `package.json` tiếp tục dùng gate `check:canonical-transaction-safe-cutover`

## 7. Kết quả kiểm thử

- Syntax: 116 mục hợp lệ.
- Automatic canonical optimization: 27/27 PASS.
- Default `npm run check`: PASS.
- `check:all`: 67/67 nhóm PASS khi chạy hoàn tất theo từng nhóm.
- Runtime smoke: 12/12 PASS.
- Production stability gate: 22/22 PASS.
- Deploy package: 12/12 PASS.
- GitHub Pages paths: 18/18 PASS.
- Payment Bundle Runtime Hotfix: 20/20 PASS.
- Inventory Ledger Reconciliation: 33/33 PASS.
- Không có file `.bak`, `.tmp`, `.log` hoặc ZIP lồng trong gói.

## 8. Giới hạn cần hiểu đúng

- Tự động tối ưu chỉ chạy đối với tài khoản có quyền ghi tương ứng với Admin CLB.
- Tháng chạm giới hạn 1.200 ở bất kỳ legacy query nào sẽ tiếp tục dùng legacy để tránh mất giao dịch.
- Bản này giảm Reads của transaction listener; profiles listener và full scan Báo nợ vẫn là các mục tối ưu tiếp theo.
- Số Reads thực tế phải tiếp tục theo dõi trong Firebase Console vì metrics client chỉ là ước tính.
