# Phase 4K-6V2A — Inventory Consumer Hydration Hotfix

**Ngày hoàn thành:** 16/06/2026  
**Nền tảng:** Vanilla JavaScript + Firebase SDK v9  
**Mục tiêu:** sửa lỗi `💳 THU GỘP KHOẢN` và `➕ THÊM VÕ SINH` không lấy được danh sách hàng hóa/size từ `📦 Kho Đồ` sau Phase 4K-6V2.

## 1. Triệu chứng

- Mở `➕ THÊM VÕ SINH`, danh sách size võ phục trống dù Kho đồ vẫn còn hàng.
- Mở `💳 THU GỘP KHOẢN`, phần chọn đồ võ/hàng hóa không có danh sách tồn kho.
- Có thể chỉ xuất hiện dữ liệu sau khi người dùng mở tab `📦 KHO ĐỒ`, hoặc vẫn trống tùy thời điểm listener chạy.
- Công nợ đang tồn tại có thể được tải, nhưng việc ghép công nợ với đúng võ sinh còn phụ thuộc tên nếu giao diện chưa giữ `profileId/memberId`.

## 2. Nguyên nhân gốc

Phase 4K-6V2 đã chủ động bỏ listener lịch sử Kho 500 document khi đăng nhập và chuyển lịch sử sang tải lười 100 document/trang. Đây là thay đổi đúng để giảm Firestore Reads.

Tuy nhiên, hai consumer cũ vẫn dùng nguồn không còn được hydrate sớm:

- `➕ THÊM VÕ SINH` dựng size từ `window.__store.inventory` / `allInventory`.
- `💳 THU GỘP KHOẢN` dựng bản đồ tồn kho từ cùng lịch sử Inventory.

Khi người dùng chưa mở tab Kho, lịch sử chưa được tải nên hai consumer nhận mảng rỗng.

Trong khi đó, số tồn đầy đủ đã có sẵn trong document tổng hợp:

```text
clubs/{clubId}/settings/inventory_stats
```

Document này đã có listener toàn cục nhưng trước bản vá chưa được dùng làm nguồn hydrate trực tiếp cho hai consumer trên.

## 3. Phương án xử lý được chọn

Tách đúng ba nguồn dữ liệu:

1. **Lịch sử Kho:** 100 document/trang, chỉ phục vụ bảng lịch sử.
2. **Tồn kho hiện tại:** lấy từ `inventory_stats`, phục vụ chọn size/hàng hóa.
3. **Công nợ Kho:** listener riêng `where("unpaid", "==", true)`, không limit, phục vụ Thu gộp và Báo nợ.

Không quay lại listener lịch sử 500 document và không thêm query Firestore mới.

## 4. Thay đổi đã triển khai

### 4.1. Nguồn tồn kho chuẩn từ `inventory_stats`

- Thêm bộ dựng stock map từ document `inventory_stats`.
- Hỗ trợ khóa thống kê legacy và khóa danh mục/size tùy chỉnh.
- Giữ đủ metadata `category`, `size`, `in`, `out`, `balance`.
- `inventory_stats` có quyền ghi đè dữ liệu fallback từ lịch sử vì đây là nguồn tổng hợp đầy đủ.

### 4.2. Sửa `➕ THÊM VÕ SINH`

- `ensureInventoryReady()` coi `inventory_stats` đã hydrate là đủ điều kiện hoạt động.
- Không còn chờ lịch sử Kho được mở.
- `getUniformSizesFromInventory()` luôn dựng lại stock map từ stats trước khi trả size.
- Khi stats realtime thay đổi trong lúc modal đang mở, danh sách size tự cập nhật.
- Giữ nguyên size người dùng đang chọn khi refresh để tránh nhảy lựa chọn.

### 4.3. Sửa `💳 THU GỘP KHOẢN`

- Bộ chọn hàng hóa/tồn kho force-refresh từ `inventory_stats` trước khi render.
- Mở Thu gộp không yêu cầu mở tab Kho trước.
- Khi stats thay đổi, phần Kho trong modal Thu gộp đang mở được refresh.
- Công nợ vẫn lấy từ listener đầy đủ `unpaid == true`, không phụ thuộc 100 document lịch sử.

### 4.4. Nhận dạng công nợ an toàn

- Autocomplete Thu gộp lưu `profileId` và `memberId` của võ sinh được chọn.
- Tra công nợ theo thứ tự:

```text
profileId → memberId → tên chuẩn hóa
```

- Hạn chế nhầm công nợ khi hai võ sinh trùng tên.
- Vẫn tương thích dữ liệu cũ chỉ có tên.

### 4.5. An toàn đa CLB và cache

- Xóa `_liveInvMap` khi đổi CLB để không giữ tồn kho của tenant trước.
- Thêm cache-bust mới trong `index.html`.
- Giữ build marker Phase 4K-6V2 để không phá các gate cũ và thêm patch marker:

```javascript
window.APP_PATCH_VERSION = '4K-6V2A-inventory-consumer-hydration-hotfix-20260616';
```

## 5. Ảnh hưởng Firestore Reads

Bản vá **không thêm query lịch sử Kho** và không khôi phục listener 500 document.

Hai chức năng dùng lại các nguồn đã tồn tại:

- `inventory_stats`: một document tổng hợp đã có listener.
- active debt listener: chỉ các document `unpaid == true`.

Do đó:

- Mở `➕ THÊM VÕ SINH` không đọc thêm 100/500 lịch sử Kho.
- Mở `💳 THU GỘP KHOẢN` không đọc thêm lịch sử Kho.
- Công nợ đầy đủ vẫn phụ thuộc số khoản đang nợ, không phụ thuộc tổng số giao dịch Kho.

## 6. Kết quả kiểm thử

### Bộ kiểm tra trực tiếp Phase 4K-6V2A

- **25/25 PASS**.
- Xác nhận stock tải được khi lịch sử Inventory có 0 document.
- Xác nhận key võ phục legacy chuyển đúng thành category/size.
- Xác nhận danh mục tùy chỉnh được dựng đúng.
- Xác nhận `_liveInvMap` được hydrate mà không mở tab Kho.
- Xác nhận công nợ được tra đúng bằng `profileId`.
- Xác nhận readiness không yêu cầu tải lịch sử.

### Kiểm tra hồi quy mặc định

- `npm run check`: **PASS**.
- Syntax: **115/115 hợp lệ**.
- Phase 4K-6V2: **25/25 PASS**.
- Spark read-cost hardening: **17/17 PASS**.
- Inventory finance rollup: **43/43 PASS**.
- Admission uniform size và MultiItem inventory hydration: **PASS**.

### Ghi chú về `npm run check:all`

Bộ mở rộng chạy đến gate `check:tab-render-recovery` và dừng ở một assertion cũ của `tabs.js` (`ensureStudentTabRendered` cho active/debt/quit). Lỗi gate này không nằm trong các file hoặc luồng của bản vá Inventory consumer và không được sửa lan sang phase này để tránh thay đổi ngoài phạm vi.

## 7. Kiểm tra vận hành đề nghị sau deploy

1. Hard refresh trình duyệt để nhận cache-bust mới.
2. Không mở tab Kho; mở ngay `➕ THÊM VÕ SINH` và kiểm tra size võ phục.
3. Không mở tab Kho; mở ngay `💳 THU GỘP KHOẢN` và kiểm tra danh sách hàng hóa.
4. Chọn võ sinh có khoản nợ cũ nằm ngoài 100 giao dịch gần nhất; xác nhận khoản nợ vẫn xuất hiện.
5. Kiểm tra hai võ sinh trùng tên nhưng khác mã hội viên.
6. Đổi CLB và xác nhận tồn kho/công nợ không bị giữ từ CLB trước.

## 8. Kết luận

Phase 4K-6V2A sửa đúng nguyên nhân phát sinh sau khi lịch sử Kho chuyển sang lazy pagination. Hai chức năng `💳 THU GỘP KHOẢN` và `➕ THÊM VÕ SINH` giờ đọc tồn kho từ `inventory_stats`, còn công nợ tiếp tục dùng complete active-debt listener. Không cần Blaze, Cloud Functions hoặc migration dữ liệu.
