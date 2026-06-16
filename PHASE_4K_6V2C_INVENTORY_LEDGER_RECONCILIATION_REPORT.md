# Phase 4K-6V2C — Inventory Ledger Reconciliation

Ngày hoàn thành: 16/06/2026

## 1. Lỗi gốc đã xác định

### 1.1. Giao dịch Kho cũ bị biến mất khỏi danh sách

Lịch sử Kho trước đây dùng truy vấn `orderBy('timestamp', 'desc')`. Firestore không trả về document không có trường được dùng trong `orderBy`, nên các giao dịch cũ thiếu `timestamp` không xuất hiện dù document vẫn còn trong collection.

Đổi sang `orderBy('date', 'desc')` chỉ giải quyết được document có `date`. Một số dữ liệu legacy cũng thiếu `date`, vì vậy cần một lần đối soát để chuẩn hóa cả hai trường.

### 1.2. Bảng tồn kho bị lệch hoặc âm

`inventory_stats` từng được cập nhật tách rời khỏi document giao dịch Kho. Một số đường ghi chỉ lưu lịch sử nhưng không cập nhật thống kê, hoặc cập nhật thống kê thất bại nhưng giao diện vẫn báo thành công.

Các đường sửa/xóa cũ cũng không hoàn tác chính xác đóng góp của giao dịch cũ. Vì vậy:

- giao dịch Nhập vẫn tồn tại nhưng không được cộng vào `inventory_stats`;
- giao dịch Xuất tiếp tục bị trừ;
- Bảng tồn kho có thể âm;
- Thu gộp và Thêm võ sinh đọc `inventory_stats` nên thiếu size hoặc báo hết hàng.

### 1.3. Xóa transaction tài chính liên kết Kho không hoàn tồn

`FinanceService.deleteRelatedInventory()` trước đây xóa document inventory trực tiếp. Nó không đảo lại số Nhập/Xuất trong `inventory_stats`, làm số tồn tiếp tục lệch.

## 2. Sửa chữa đã triển khai

### 2.1. Sổ Kho nguyên tử

Các thao tác thêm, sửa và xóa Kho hiện dùng `writeBatch()`:

- lưu/sửa/xóa document inventory;
- cập nhật `settings/inventory_stats`;
- cập nhật hoặc xóa transaction liên quan khi cần;
- tất cả thành công cùng nhau hoặc cùng thất bại.

Không còn tình trạng lưu được giao dịch nhưng không cập nhật tồn kho.

### 2.2. Hoàn tác đúng khi sửa/xóa

Khi sửa giao dịch:

1. đảo đóng góp của dữ liệu cũ;
2. áp dụng đóng góp của dữ liệu mới;
3. commit trong cùng batch.

Khi xóa giao dịch:

1. đảo đóng góp Nhập/Xuất của giao dịch;
2. xóa document;
3. xóa transaction liên quan nếu có;
4. commit trong cùng batch.

### 2.3. Ghi mới luôn có `date` và `timestamp`

Mọi giao dịch Kho mới qua InventoryService và StudentService đều được bảo đảm có:

- `date: YYYY-MM-DD`;
- `timestamp: number`.

Do đó các giao dịch mới không bị loại khỏi phân trang Firestore.

### 2.4. Lịch sử Kho phân trang theo `date`

Lịch sử tiếp tục tải 100 document/trang và dùng cursor `startAfter()`.

Không khôi phục listener 500 document và không tự tải toàn bộ lịch sử khi đăng nhập.

### 2.5. Đối soát tồn kho một lần

Đã thêm nút:

`🔄 Đối soát tồn kho`

Thao tác này chỉ dành cho Admin và chỉ cần chạy một lần sau khi triển khai bản V2C đối với CLB đang có dữ liệu sai.

Quy trình đối soát:

1. đọc toàn bộ collection inventory đúng một lần;
2. tính lại Nhập, Xuất và Tồn từ sổ giao dịch thật;
3. sửa các document legacy thiếu `date` hoặc `timestamp` theo batch 400 document;
4. thay thế `inventory_stats` bằng bản tổng hợp chính xác;
5. dùng ngay dữ liệu đã đọc để hiển thị toàn bộ lịch sử, không query lần thứ hai;
6. cập nhật lại danh sách size cho Thu gộp và Thêm võ sinh ngay lập tức.

Document không có bất kỳ thông tin thời gian nào được giữ lại với:

- `date: 1970-01-01`;
- `timestamp: 0`;
- `legacyDateUnknown: true`.

Mục tiêu là không làm mất giao dịch; các bản ghi này nằm cuối lịch sử.

## 3. Ảnh hưởng đến Firebase Reads

### Hoạt động bình thường

Không thêm query hoặc listener định kỳ mới.

- lịch sử Kho: 100 document/trang, chỉ khi mở tab Kho;
- công nợ: listener riêng `unpaid == true`;
- số tồn và size: một document `inventory_stats`;
- thêm/sửa/xóa dùng write batch và write-through local, không đọc lại lịch sử ngay sau khi lưu.

Sửa/xóa chỉ phát sinh tối đa một document read khi caller không còn dữ liệu gốc trong bộ nhớ. Các luồng giao diện chính truyền dữ liệu gốc nên không cần read bổ sung.

### Lần đối soát duy nhất

Nếu collection có N giao dịch Kho, thao tác đối soát phát sinh khoảng N document reads đúng một lần. Đây là số đọc tối thiểu cần thiết để xây lại tồn kho chính xác từ dữ liệu thật.

Ngoài ra có write cho các document thiếu ngày/thời gian và một write cho `inventory_stats`. Write không được tính là Reads.

## 4. Các đường nghiệp vụ đã đồng bộ

- Nhập kho thủ công;
- Xuất bán thủ công;
- Bán nợ;
- Thu gộp khoản có đồ võ;
- Thêm võ sinh có võ phục;
- sửa giao dịch Kho;
- xóa giao dịch Kho;
- xóa transaction tài chính có `relatedInvId`;
- dữ liệu Kho legacy mở qua bridge cũ.

## 5. Kiểm thử

- Syntax: 115/115 hợp lệ.
- Default project check: PASS toàn bộ trong lần chạy hoàn chỉnh trước thay đổi cache-bust cuối; các kiểm tra liên quan sau thay đổi cuối tiếp tục PASS.
- Phase 4K-6V2: 25/25 PASS.
- Phase 4K-6V2A: 25/25 PASS.
- Phase 4K-6V2B: 28/28 PASS.
- Phase 4K-6V2C: 33/33 PASS.
- MultiItem inventory hydration: 16/16 PASS.
- Inventory MultiItem read-only UI: PASS.
- Financial Action Audit Guard: PASS.
- Listener Ownership Boundary: PASS.
- Legacy Render Entrypoints: PASS.
- Runtime Smoke Test: 12/12 PASS.
- Production Stability Gate: 22/22 PASS.

Bộ `check:all` mở rộng đã chạy qua nhiều nhóm kiểm tra thành công nhưng vượt giới hạn thời gian thực thi của môi trường trước khi hoàn tất toàn bộ chuỗi; không ghi nhận lỗi chức năng trong phần đã chạy.

## 6. Thao tác bắt buộc sau khi deploy

1. Upload toàn bộ bản V2C lên GitHub Pages.
2. Nhấn `Ctrl + Shift + R`.
3. Đăng nhập bằng Admin.
4. Mở tab `📦 KHO ĐỒ`.
5. Nhấn `🔄 Đối soát tồn kho` đúng một lần.
6. Chờ thông báo hoàn thành.
7. Kiểm tra Bảng tồn kho, Thu gộp và Thêm võ sinh.
8. Dùng `⬇ Tải thêm 100 giao dịch` để xem tiếp lịch sử sau 100 dòng đầu.

Không chạy Đối soát mỗi ngày. Chỉ chạy lại khi dữ liệu cũ đã được import thêm hoặc có bằng chứng số tồn bị lệch.
