# PHASE 4K-6V3F1 — Financial Collection Recovery + Revenue Routing + Inline Transaction Edit

## 1. Mục tiêu

Khắc phục các lỗi phát sinh sau Phase 4K-6V3F và bổ sung thao tác tài chính thuận tiện hơn mà không làm sai sổ học phí, công nợ Kho, tồn kho hoặc doanh thu:

1. Sửa lỗi bấm **💰 Thu** nhưng giao diện không ghi nhận hoặc người dùng không biết thao tác đã thành công/thất bại.
2. Sau khi **➕ Thêm võ sinh** thành công, cập nhật ngay Danh sách Đang tập và thông báo rõ cho HLV.
3. Phân luồng doanh thu canonical theo đúng nguồn: Học phí, Kho đồ, Thi đai, Khoản khác.
4. Cho phép bấm vào số tiền ở Học phí/Kho để sửa nhanh, nhưng không thay đổi tháng đã đóng hoặc số lượng tồn kho.
5. Giữ nguyên các bảo vệ V3D1 và V3F: ghi nguyên tử, không thu trùng, không trừ tồn hai lần, không cộng doanh thu hai lần.

## 2. Nguyên nhân gốc

### 2.1. Nút 💰 Thu học phí

Luồng cũ có thể ghi Firestore thành công nhưng không cập nhật tức thời Debt/runtime store. Khi listener phản hồi chậm, HLV vẫn nhìn thấy dòng nợ và tưởng rằng thao tác không được ghi nhận. Nút cũng chưa có khóa chống bấm lặp rõ ràng, trạng thái đang lưu chưa được hiển thị đầy đủ và lỗi bị gom thành thông báo chung.

### 2.2. Nút 💰 Thu công nợ Kho

Luồng đánh dấu đã thu và tạo giao dịch doanh thu trước đây chưa được ràng buộc bằng một Firestore transaction duy nhất. Hai thiết bị hoặc hai lần bấm gần nhau có thể gây trạng thái nửa chừng hoặc doanh thu trùng.

### 2.3. Quyền HLV và Firestore Rules

Giao diện cho HLV thêm võ sinh, nhưng Rules của gói V3F chỉ cho Admin ghi một số collection tài chính/hồ sơ. Nếu Rules đó được deploy, HLV có thể gặp `permission-denied` dù nút vẫn xuất hiện. Đây là một nguyên nhân có thể tạo đúng hiện tượng “bấm Thu/Thêm nhưng không ghi nhận”.

### 2.4. Phân loại doanh thu

Một số báo cáo và bảng tổng hợp vẫn dựa vào chuỗi `type` legacy. Giao dịch gộp có thể chứa Học phí + Kho + Thi đai nhưng bị phân toàn bộ vào một loại, hoặc bút toán đối soát Kho có nguy cơ bị tính như doanh thu mới.

### 2.5. Sửa giao dịch

Chưa có một editor theo component. Sửa trực tiếp tổng tiền của bundle dễ làm sai tỷ lệ Học phí/Kho/Thi đai và có thể tác động nhầm đến tồn kho hoặc `paidMonths`.

## 3. Nội dung sửa

### 3.1. Phục hồi luồng Thu học phí

- Thêm khóa `_quickPayInFlight` để chặn bấm lặp.
- Nút và modal có trạng thái `saving/success/error` rõ ràng.
- Sau khi Firestore commit thành công:
  - merge transaction vào runtime store;
  - cập nhật profile canonical;
  - invalidate Học phí, Báo nợ và Dashboard;
  - dispatch sự kiện `tuition:payment-committed`;
  - hiển thị xác nhận thu thành công.
- Lỗi in biên lai sau khi ghi tiền không còn làm người dùng hiểu nhầm rằng thu tiền thất bại.
- Canonical writer từ chối tháng đã có trong `paidMonths` ngay bên trong Firestore transaction.

### 3.2. Phục hồi luồng Thu công nợ Kho

- `markPaid()` được chuyển sang Firestore transaction.
- Đánh dấu khoản nợ đã thu và tạo giao dịch doanh thu trong cùng một transaction.
- Dùng transaction ID xác định theo khoản nợ: `inventory-debt-{inventoryId}`.
- Hai lần bấm hoặc hai thiết bị cùng thu chỉ tạo một giao dịch doanh thu.
- Nút có khóa chống bấm lặp và hiển thị lỗi Firestore thật.

### 3.3. Thông báo sau khi thêm võ sinh

Sau khi toàn bộ ghi bắt buộc hoàn tất:

- merge võ sinh mới vào runtime store ngay;
- đưa vào Danh sách Đang tập mà không chờ listener;
- hiển thị toast thành công;
- hiển thị thông báo cố định có nút **Xem danh sách**;
- chuyển tới tab Đang tập và làm nổi bật dòng võ sinh mới;
- dispatch sự kiện `student:created`.

Nếu ghi Firestore thất bại, không hiển thị thông báo thành công giả.

### 3.4. Phân luồng doanh thu canonical

Thêm `js/core/revenueRouting.js` làm nguồn phân loại chung:

- `tuition` → Học phí;
- `inventory` / `inventoryDebt` → Kho đồ;
- `exam` → Thi đai;
- `other` → Khoản khác.

Quy tắc:

- Giao dịch bundle được phân theo từng component, không phân toàn bộ theo `receiptType`.
- Học phí gói nhiều tháng được phân bổ theo `packageMonths`.
- Thành phần một lần như Kho/Thi đai không bị lặp lại ở các tháng sau.
- Bút toán `reconciliationOnly` hoặc `affectsRevenue:false` không được tính vào doanh thu.
- Metadata canonical giữ đầy đủ danh mục doanh thu để Dashboard/Excel có thể dùng chung.

### 3.5. Sửa số tiền bằng cách bấm trực tiếp

Thêm `js/modules/financeTransactionEditor.js`:

- Tab Học phí/Thu chi: bấm số tiền để mở editor.
- Giao dịch bundle hiển thị riêng Học phí, Kho, Thi đai, Khoản khác.
- Tab Kho: bấm số tiền mở form sửa Kho hiện có.
- Khi lưu:
  - tính lại tổng tiền từ components;
  - cập nhật linked inventory amount nếu có;
  - cập nhật số tiền pending issue và pending stats nếu cần;
  - giữ nguyên `paidMonths`, `paidThroughMonth`, tháng học phí;
  - giữ nguyên `qty` và số tồn kho.

Quyền sửa/xóa giao dịch tài chính vẫn giữ cho Admin CLB/SuperAdmin; HLV không được mở rộng quyền sửa lịch sử tiền.

### 3.6. Firestore Rules cho HLV đúng cơ sở

Rules được bổ sung theo nguyên tắc tối thiểu:

- HLV chỉ tạo profile/giao dịch/Kho/pending issue ở đúng cơ sở được phân công.
- HLV chỉ được cập nhật các trường canonical tuition cần thiết khi thu tiền.
- HLV không có quyền sửa/xóa giao dịch tài chính tùy ý.
- HLV chỉ được cập nhật `settings/inventory_stats` phục vụ write-through nhập học/Kho.
- Admin CLB được tạo tài liệu `users/{uid}` cho HLV thuộc CLB để Rules nhận dạng tài khoản.
- Mọi payload nhập học/Kho mới đều mang `branch` thực tế.

## 4. Các bất biến an toàn

1. Giao dịch học phí và profile canonical cùng thành công hoặc cùng thất bại.
2. Không tạo giao dịch học phí trùng tháng đã đóng.
3. Thu nợ Kho và doanh thu Kho cùng thành công hoặc cùng thất bại.
4. Hai lần bấm 💰 Thu không tạo doanh thu trùng.
5. Sửa số tiền không làm thay đổi `paidMonths`.
6. Sửa số tiền không làm thay đổi `qty` hoặc tồn kho.
7. Đối soát pending Kho không tạo thêm doanh thu.
8. Doanh thu Học phí/Kho/Thi đai được tách theo component.
9. HLV chỉ ghi dữ liệu thuộc cơ sở được phân công.

## 5. Kiểm thử

### Bộ kiểm tra chính

- Syntax: **123/123 hợp lệ**.
- V3D1 Canonical Tuition Ledger: **27/27 PASS**.
- V3F Inventory Sale Policy: **21/21 PASS**.
- V3F1 static/business checks: **44/44 PASS**.
- V3F1 Firestore runtime simulation: **9/9 PASS**.
- Multi-item inventory hydration: **16/16 PASS**.
- Admission tuition normalization: **21/21 PASS**.
- Production Stability Gate: **22/22 PASS**.

Toàn bộ các script trong `check:all` đã được chạy theo các nhóm do giới hạn thời gian của runner; mọi nhóm và mọi bài kiểm tra thành phần đều trả về PASS.

### Tình huống runtime đã mô phỏng

- Thu một khoản nợ Kho thành công.
- Bấm thu lại phát hiện khoản đã thu.
- Chỉ có đúng một transaction doanh thu.
- Doanh thu được phân vào Kho đồ.
- Sửa bundle tính lại tổng đúng.
- Học phí và Kho vẫn là hai components riêng.
- Linked inventory amount cập nhật theo số tiền mới.
- Số lượng tồn không thay đổi khi sửa tiền.

## 6. Triển khai

1. Sao lưu bản đang chạy.
2. Upload mã nguồn mới lên GitHub Pages.
3. Deploy `firestore.rules` trong gói này bằng Firebase Console hoặc Firebase CLI.
4. Với tài khoản HLV cũ, Admin CLB chạy chức năng **Đồng bộ tài khoản HLV cũ** một lần để tạo/đồng bộ `users/{uid}`.
5. Tải lại trang bằng `Ctrl + F5`.
6. Smoke test một CLB:
   - thêm một võ sinh bằng tài khoản HLV;
   - thu học phí từ Báo nợ;
   - thu một công nợ Kho;
   - bấm số tiền và sửa giao dịch bằng Admin;
   - kiểm tra Dashboard phân đúng Học phí/Kho/Thi đai.

Không yêu cầu Cloud Functions mới, migration toàn bộ hoặc composite index mới cho hotfix này. Nếu hệ thống production đang dùng Cloud Functions thống kê cũ, cần bảo đảm Functions đang dùng logic component-aware đã có trong gói để số liệu tổng hợp server khớp revenue routing canonical.

## 7. Lưu ý

- Firestore Rules không tự được deploy khi chỉ upload GitHub Pages.
- Bộ kiểm tra Rules hiện là static contract/runtime mock; chưa chạy Rules Emulator trong môi trường này.
- Sửa số tiền chỉ sửa giá trị tài chính. Muốn thay đổi tháng học phí, sản phẩm, size hoặc số lượng tồn phải dùng luồng nghiệp vụ chuyên biệt để tránh phá sổ cái.
