# Phase 4K-6V4C1A — Coach Branch Resolution + Attendance Recovery

Ngày hoàn thành: 22/06/2026

## 1. Hiện tượng

Một số tài khoản HLV đăng nhập được và chỉ nhìn thấy tab Điểm danh, nhưng danh sách võ sinh trống. Console hiển thị:

```text
[ProfilesListener] Coach missing branch — fail closed, no profiles query
```

Giao diện đồng thời hiển thị `Tất cả cơ sở` hoặc `Cơ sở: Tất cả` dù HLV phải được gán một cơ sở cụ thể.

## 2. Kết luận nguyên nhân

Lỗi không nằm ở dữ liệu võ sinh hoặc tab Điểm danh. Listener V4A đã chủ động dừng query khi không xác định được `coachBranch`, nhằm tránh tải toàn bộ võ sinh của CLB và làm tăng Reads. Một số tài khoản cũ không có cơ sở hợp lệ nên cơ chế fail-closed đã trả danh sách rỗng.

Các nguyên nhân cụ thể:

1. Form tạo HLV cũ cho phép chọn `Tất cả cơ sở`, dẫn đến `branch` được lưu rỗng.
2. `users/{uid}.branch` và `clubs/{clubId}/coaches/{uid}.branch` có thể không đồng bộ. Có tài khoản một nơi rỗng nhưng nơi còn lại vẫn đúng.
3. Auth cache cũ lưu `coachBranch` rỗng tối đa bảy ngày. Phiên đăng nhập nhanh dùng cache trước khi dữ liệu HLV được xác minh lại.
4. Giá trị cơ sở trong dữ liệu cũ không đồng nhất: `CS1`, `cs1`, `CS 1`, `Cơ sở 1`, tên cơ sở tùy chỉnh hoặc `Mặc định`.
5. Firestore so khớp chuỗi chính xác. HLV `CS1` không khớp profile lưu `Mặc định` hoặc tên cơ sở tùy chỉnh.
6. CLB một cơ sở thường có dữ liệu cũ ghi `Mặc định`, trong khi tài khoản mới dùng `CS1`.
7. Query cũ chỉ dùng một giá trị branch duy nhất, nên không thu hồi được các nhãn legacy tương đương.

## 3. Nguyên tắc sửa

- Không quay lại tải toàn bộ profiles cho HLV của CLB nhiều cơ sở.
- Không bỏ cơ chế fail-closed.
- Không thay đổi Học phí, Báo nợ hoặc Kho đồ của Admin.
- Tự sửa được tài khoản một cơ sở và các giá trị legacy có thể suy luận chắc chắn.
- Tài khoản nhiều cơ sở nhưng hoàn toàn không có dữ liệu phân công phải được Admin chọn thủ công; hệ thống không được tự đoán.

## 4. Nội dung đã sửa

### 4.1. Bộ phân giải cơ sở dùng chung

Tạo mới:

```text
js/core/coachBranchResolver.js
```

Bộ phân giải chuẩn hóa:

- `CS1`, `cs1`, `CS 1` → `CS1`
- `Cơ sở 1`, `Co so 1`, `1` → `CS1`
- Tên cơ sở tùy chỉnh trong `main_config` → mã `CSn`
- `Mặc định` trong CLB một cơ sở → `CS1`
- Branch rỗng trong CLB một cơ sở → `CS1`
- Branch rỗng trong CLB nhiều cơ sở → không resolve, tiếp tục fail-closed

Nguồn được ưu tiên theo thứ tự:

1. `clubs/{clubId}/coaches/{uid}.branch`
2. `coaches/{uid}.coachBranch`
3. `coaches/{uid}.assignedBranch`
4. `users/{uid}.branch`
5. `users/{uid}.coachBranch`
6. Auth cache

Nếu các nguồn mâu thuẫn, coaches document được ưu tiên và diagnostics ghi nhận conflict.

### 4.2. Xác minh branch trước khi mount listener

Cả ba đường đăng nhập đều resolve branch trước `initSaaSDatabase()`:

- Fast path từ cache.
- Slow path từ `users/{uid}`.
- Fallback tìm trong coaches collection.

Auth cache được đổi từ `_qlclb_auth_v2` sang `_qlclb_auth_v3`, vì vậy cache cũ chứa branch rỗng không tiếp tục được dùng trong bảy ngày.

Khi xác định được branch, hệ thống best-effort cập nhật lại `users/{uid}`. Nếu Rules không cho phép, đăng nhập vẫn tiếp tục bằng dữ liệu coaches document.

### 4.3. Query profiles an toàn cho dữ liệu legacy

#### CLB nhiều cơ sở

Query chỉ đọc các alias của đúng cơ sở:

```js
where('branch', 'in', branchAliases)
```

Ví dụ alias có thể gồm:

```text
CS1
cs1
CS 1
Cơ sở 1
tên cơ sở cấu hình
```

Kết quả được lọc status trong bộ nhớ để tránh query có hai toán tử `in`.

#### CLB một cơ sở

Query dùng status mà không thêm branch predicate. Đây vẫn là phạm vi an toàn vì CLB chỉ có một cơ sở, đồng thời thu hồi được profile legacy có branch `Mặc định`, `CS1` hoặc thiếu branch.

#### Fallback

- Một cơ sở: được phép đọc collection profiles của chính CLB rồi lọc active, vì toàn CLB chính là một cơ sở.
- Nhiều cơ sở: chỉ query branch aliases.
- Thiếu branch: không query.

Không có đường fallback nào cho phép HLV nhiều cơ sở tải toàn CLB.

### 4.4. Query Điểm danh

Các query ngày, tháng, lịch sử võ sinh và ghi chú buổi tập:

- Fail-closed nếu HLV nhiều cơ sở chưa được gán branch.
- Có branch predicate đối với CLB nhiều cơ sở.
- Bỏ branch predicate có chủ đích đối với CLB một cơ sở để đọc được attendance legacy lưu `Mặc định`.
- Vẫn giữ lọc ngày, tháng và ca tập.

### 4.5. Quản lý tài khoản HLV

Form tạo HLV:

- Không còn lựa chọn `Tất cả cơ sở`.
- Bắt buộc chọn một cơ sở.
- CLB một cơ sở tự chọn `CS1`.
- Ghi đồng thời `branch`, `coachBranch`, `assignedBranch` trong coaches document.

Danh sách tài khoản HLV:

- Tài khoản thiếu branch được hiển thị màu đỏ `CHƯA GÁN CƠ SỞ`.
- Có select cơ sở và nút `Lưu cơ sở` cho từng tài khoản.
- Nút đồng bộ HLV cũ chuẩn hóa các giá trị có thể xác định.
- Tài khoản nhiều cơ sở không thể suy luận được được liệt kê để Admin xử lý thủ công.

### 4.6. Chuẩn hóa dữ liệu mới

Các đường ghi mới của CLB một cơ sở dùng `CS1` thay cho `Mặc định`, gồm profile, giao dịch và các module liên quan. Dữ liệu cũ không cần migration bắt buộc vì resolver/query compatibility đã xử lý.

## 5. Kết quả đối với ảnh lỗi

Sau khi deploy:

- Nếu CLB Tùng Bách chỉ có một cơ sở, tài khoản branch rỗng sẽ tự resolve thành `CS1`, profiles và attendance legacy được tải lại.
- Nếu CLB có nhiều cơ sở, Admin phải chọn đúng cơ sở cho tài khoản. Hệ thống không tự đoán để tránh HLV nhìn thấy võ sinh của cơ sở khác.
- Giao diện không còn hiển thị `Tất cả cơ sở` cho HLV chưa được gán; nó hiển thị cảnh báo rõ ràng.

## 6. Ảnh hưởng đến Firestore Reads

Bản sửa không làm mất tối ưu V4A:

- HLV nhiều cơ sở vẫn chỉ đọc profiles đúng branch aliases.
- HLV thiếu branch tạo 0 query profiles/attendance.
- HLV một cơ sở có thể đọc profiles active toàn CLB; đây là dữ liệu cùng một cơ sở và không mở rộng phạm vi thực tế.
- Không mount transactions, inventory debts, dashboard hoặc dữ liệu tài chính cho HLV.

Việc resolve branch thêm tối đa một vài document reads nhỏ khi HLV đăng nhập (`coaches/{uid}`, `main_config`), đổi lại ngăn query sai hoặc danh sách trống. Đây là chi phí nhỏ so với hàng trăm/hàng nghìn profile reads.

## 7. Giới hạn và yêu cầu vận hành

Không thể tự suy luận branch cho một tài khoản nhiều cơ sở khi cả coaches document, users document và cache đều rỗng/không hợp lệ. Tự chọn ngẫu nhiên sẽ gây sai quyền dữ liệu.

Đối với các tài khoản này:

1. Admin đăng nhập.
2. Mở `Quản lý tài khoản HLV`.
3. Tìm tài khoản có nhãn đỏ `CHƯA GÁN CƠ SỞ`.
4. Chọn đúng cơ sở.
5. Bấm `Lưu cơ sở`.
6. HLV tải lại trang hoặc đăng nhập lại.

## 8. Kiểm thử

- Syntax toàn dự án: PASS.
- `npm run check`: PASS, exit code 0.
- `npm run check:all:critical`: PASS, exit code 0.
- Coach Branch Resolution Recovery: 29/29 PASS.
- Coach Attendance-only Boundary: 30/30 PASS.
- Attendance Canonical Ownership: 141 assertions PASS.
- Attendance Reliability: 20/20 PASS.
- Attendance Scheduled Accuracy: 22/22 PASS.
- Attendance Shift Filtering: 10/10 PASS.
- Debt Profile Read Boundary: 21/21 PASS.
- Trusted Cache + Lazy Admin Reads: 28/28 PASS.
- Runtime Stability: 17/17 PASS.
- Production Stability: 22/22 PASS.
- Deploy package, GitHub Pages paths và Firestore indexes: PASS.

## 9. File chính thay đổi

- `app.js`
- `index.html`
- `js/core/coachBranchResolver.js` — mới
- `js/listeners/profiles.listeners.js`
- `js/services/attendance.service.js`
- `js/modules/attendance.js`
- `js/modules/students.js`
- `js/modules/finance.js`
- `js/main.js`
- `js/store.js`
- `package.json`
- `tools/check-coach-branch-resolution-recovery.mjs` — mới
- Các checker cũ được cập nhật để nhận cache-bust và contract branch mới.

## 10. Diagnostics sau deploy

Đăng nhập HLV và chạy:

```js
printCoachBranchResolution()
```

Kết quả hợp lệ phải có:

```text
resolved: true
branch: CS1/CS2/...
source: coaches.branch hoặc users.branch hoặc single-branch-default
```

Sau đó chạy:

```js
printRoleReadBudget()
```

Transactions và Kho vẫn phải nằm trong nhóm blocked đối với HLV.
