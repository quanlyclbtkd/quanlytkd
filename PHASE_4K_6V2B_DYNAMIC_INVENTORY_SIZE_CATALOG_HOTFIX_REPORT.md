# Phase 4K-6V2B — Dynamic Inventory Size Catalog Hotfix

**Ngày hoàn thành:** 16/06/2026  
**Mục tiêu:** Khắc phục tình trạng `💳 THU GỘP KHOẢN` và `➕ THÊM VÕ SINH` thiếu mặt hàng/size dù `BẢNG TỒN KHO` vẫn còn số lượng, đồng thời không tăng Firestore document reads.

## 1. Nguyên nhân gốc

Phase 4K-6V2A đã chuyển hai chức năng sang dùng bản đồ tồn kho tổng hợp `_liveInvMap`, nhưng một số lớp giao diện vẫn dựng danh sách bằng nguồn tĩnh:

- Võ phục chỉ dùng dải size cố định `Size 1m` đến `Size 1m8`.
- Danh mục tùy chỉnh chỉ dùng danh sách size đã khai báo trong cấu hình.
- Size phát sinh sau, size chỉ tồn tại trong `inventory_stats`, hoặc size có cách viết khác nhau bị loại khỏi dropdown.
- So khớp category/size dùng chuỗi tuyệt đối nên các biến thể như `Võ Phục`/`Võ phục`, `Size 1m 9`/`Size 1m9`, khác chữ hoa-thường hoặc khoảng trắng không được hợp nhất.
- Renderer legacy và renderer module có thể ghi đè dropdown động bằng danh sách cố định trong lần render tiếp theo.

Vì vậy dữ liệu vẫn hiện trong `BẢNG TỒN KHO`, nhưng không xuất hiện đầy đủ trong `THU GỘP KHOẢN` và `THÊM VÕ SINH`.

## 2. Kiến trúc sửa lỗi

Danh sách size hiện được hợp nhất từ ba nguồn trong bộ nhớ:

1. Size mặc định để bảo đảm tương thích.
2. Size cấu hình theo danh mục.
3. Mọi category/size thực tế đang tồn tại trong `_liveInvMap`, vốn đã được hydrate từ document `settings/inventory_stats`.

Quy tắc ưu tiên:

- `inventory_stats` là nguồn authoritative cho số tồn hiện tại.
- Lịch sử 100 bản ghi chỉ là fallback hiển thị, không quyết định catalog đầy đủ.
- Category và size được chuẩn hóa trước khi hợp nhất.
- Biến thể cùng ý nghĩa chỉ tạo một option; số tồn từ `inventory_stats` được giữ lại.
- Size có tồn thực tế luôn được thêm vào dropdown dù không nằm trong danh sách cố định hoặc cấu hình cũ.

## 3. Các phần đã sửa

### `js/core/multiItemInventorySafety.js`

- Thêm chuẩn hóa category và size không phụ thuộc dấu, chữ hoa-thường và khoảng trắng.
- Canonicalize/merge bản đồ lịch sử và `inventory_stats`.
- Thêm resolver tìm tồn kho theo identity chuẩn hóa.
- Thêm builder danh sách size động theo từng category.

### `js/core/inventoryMultiItemReadOnlyUI.js`

- `THU GỘP KHOẢN` không còn giới hạn ở size cố định/cấu hình.
- Hợp nhất size mặc định, cấu hình và size đang có tồn thực tế.
- Category chỉ có dữ liệu tồn nhưng chưa có cấu hình size vẫn hiển thị dropdown đúng.

### `js/main.js`, `app.js`, `js/ui/render.js`

- `THÊM VÕ SINH` dùng danh sách size động từ bản đồ tồn kho.
- Ngăn renderer legacy/module ghi đè lại bằng danh sách hardcoded.
- Giữ lựa chọn hiện tại khi `inventory_stats` cập nhật realtime.

### `js/modules/inventory.js`

- Dropdown category gồm cả category được phát hiện từ tồn kho thực tế.
- MultiItem selector ưu tiên renderer động canonical.

### `js/services/inventory.service.js` và đường ghi legacy trong `app.js`

- Giao dịch Kho mới cập nhật cùng document `settings/inventory_stats` bằng `FieldValue.increment`.
- Category/size mới được duy trì trong summary để các selector biết ngay mà không tải lịch sử Kho.
- Nếu summary update lỗi, giao dịch lịch sử vẫn được giữ và hệ thống ghi cảnh báo.

### Cache bust

- `index.html` và các import lồng nhau dùng marker:
  `inventory-dynamic-size-catalog-20260616-v2b`.

## 4. Ảnh hưởng Firestore Reads

Bản vá **không thêm**:

- `getDoc()` hoặc `getDocs()` mới.
- Query lịch sử Kho mới.
- Listener Firestore mới.
- Việc tải lại 500 hoặc toàn bộ giao dịch Kho.

`THU GỘP KHOẢN` và `THÊM VÕ SINH` tiếp tục dùng document `inventory_stats` đã được lắng nghe sẵn và dữ liệu trong bộ nhớ.

Thay đổi chi phí duy nhất:

- Mỗi giao dịch Kho mới có thêm **một write merge nhỏ** vào document `inventory_stats` bằng `increment`.
- **Document reads không tăng.**

## 5. Khả năng tương thích dữ liệu

Đã hỗ trợ:

- Size ngoài dải mặc định, ví dụ `Size 1m9`, `Size 2m`, `XXL`, `Số 4`.
- Category tùy chỉnh chưa có danh sách size cấu hình.
- Khác biệt chữ hoa/thường và dấu tiếng Việt.
- Khoảng trắng hoặc ký tự phân cách khác nhau.
- Dữ liệu cũ vẫn hoạt động, không cần migration hàng loạt.

Lưu ý: size lịch sử rất cũ không tồn tại trong `inventory_stats`, không nằm trong trang lịch sử đã tải và cũng không xuất hiện trong BẢNG TỒN KHO thì client không thể biết đến mà không đọc thêm dữ liệu. Trường hợp người dùng báo — size đang nhìn thấy trong BẢNG TỒN KHO — đã được xử lý hoàn toàn bằng bản vá này.

## 6. Kiểm thử

- `npm run check`: **PASS**.
- Kiểm tra cú pháp: **115/115 hợp lệ**.
- Phase 4K-6V1 Spark Read Cost: **17/17 PASS**.
- Phase 4K-6V2 Inventory History + Complete Debt: **25/25 PASS**.
- Phase 4K-6V2A Consumer Hydration: **25/25 PASS**.
- Phase 4K-6V2B Dynamic Inventory Size Catalog: **28/28 PASS**.
- `app.js`: **10.699 dòng**, vẫn trong gate tối đa 10.700 dòng.

Các case động đã kiểm tra gồm:

- Size không có trong hardcoded list vẫn xuất hiện.
- Alias khác hoa/thường/khoảng trắng được hợp nhất.
- `inventory_stats` giữ quyền authoritative.
- Category chưa cấu hình vẫn nhận size từ tồn kho.
- Size cấu hình không bị mất và size tồn thực tế được nối thêm.
- Thu gộp nhận đủ danh sách configured + live stock.
- Size còn tồn được enable đúng.
- Không dùng API đọc Firestore để dựng catalog.

## 7. Kết luận

Phase 4K-6V2B sửa đúng nguyên nhân thiếu size mà không quay lại kiến trúc tải lịch sử lớn. Hai chức năng hiện dùng chung một catalog tồn kho động, chuẩn hóa và data-backed; Firestore Reads không tăng, còn size/category mới được duy trì bằng một write summary nhỏ khi phát sinh giao dịch.
