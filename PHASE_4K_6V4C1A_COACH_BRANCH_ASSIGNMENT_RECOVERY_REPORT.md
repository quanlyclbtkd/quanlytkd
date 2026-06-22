# Phase 4K-6V4C1A — Coach Branch Assignment Recovery + Attendance List Hotfix

Ngày hoàn thành: 22/06/2026

## 1. Hiện tượng

Một số tài khoản HLV đăng nhập được và chỉ nhìn thấy tab Điểm danh, nhưng danh sách võ sinh trống. Console hiển thị:

```text
[ProfilesListener] Coach missing branch — fail closed, no profiles query
```

Giao diện đồng thời hiển thị "Tất cả cơ sở" dù runtime V4A yêu cầu HLV phải có một cơ sở cụ thể.

## 2. Kết luận nguyên nhân

Đây không phải lỗi dữ liệu võ sinh hoặc lỗi query trạng thái active. Profiles listener chủ động không chạy vì `coachBranch` bị rỗng.

V4A đã áp dụng nguyên tắc fail-closed để giảm Reads và ngăn HLV tải dữ liệu toàn CLB:

```text
Coach có branch  → query status + branch
Coach thiếu branch → không chạy query nào
```

Một số tài khoản HLV cũ rơi vào trạng thái thiếu branch do ba nguyên nhân hệ thống:

1. `users/{uid}.branch` rỗng hoặc dùng giá trị legacy như tên cơ sở, trong khi `clubs/{clubId}/coaches/{uid}` có thể vẫn chứa phân công đúng.
2. Fast-path đăng nhập sử dụng auth cache cũ có `coachBranch=""` và khởi động runtime trước khi xác minh lại Firestore.
3. Giao diện tạo HLV cũ từng cho chọn "Tất cả cơ sở", không tương thích với ranh giới Reads mới yêu cầu một cơ sở cụ thể.

Vì vậy lỗi chỉ xảy ra ở một số tài khoản cũ, không xảy ra đồng loạt.

## 3. Phương án được chọn

Không bỏ fail-closed và không fallback tải toàn bộ CLB. Thay vào đó, bổ sung một lớp phân giải cơ sở HLV trước bootstrap:

```text
clubs/{clubId}/coaches/{uid}  → nguồn chính
users/{uid}                   → fallback dữ liệu cũ
main_config                   → ánh xạ tên cơ sở cũ sang CS1…CS10
```

Quy tắc:

- CLB một cơ sở và HLV chưa có branch: tự phục hồi `CS1`.
- CLB nhiều cơ sở: không đoán; Admin phải gán chính xác.
- Không có trường hợp nào tải toàn bộ profiles để "chữa cháy".

## 4. Các thay đổi đã thực hiện

### 4.1. Resolver mới

Tạo:

```text
js/core/coachBranchResolver.js
```

Chức năng:

- Chuẩn hóa `CS1`, `CS01`, `Cơ sở 1`, số `1` về `CS1`.
- Ánh xạ tên hiển thị cơ sở legacy sang mã canonical.
- Đọc Coach subdocument làm nguồn phân công chính.
- Dùng users document làm fallback tương thích.
- Tự phục hồi CS1 cho CLB chỉ có một cơ sở.
- Cập nhật runtime, RoleReadBoundary và bộ lọc Điểm danh.
- Hiển thị thông báo rõ ràng nếu tài khoản chưa được gán cơ sở.
- Cung cấp diagnostics:

```js
printCoachBranchDiagnostics()
```

### 4.2. Sửa fast-path đăng nhập

Tài khoản Coach không còn được bootstrap trực tiếp từ auth cache.

Luồng mới:

```text
Auth cache xác định role/club
→ đọc phân công authoritative
→ resolve branch
→ lưu cache đã sửa
→ mới initSaaSDatabase và mount profiles listener
```

Điều này xử lý trường hợp cache cũ có branch rỗng và tránh race condition "runtime đã chạy trước khi branch được cập nhật".

### 4.3. Sửa slow-path và fallback login

Tất cả ba đường đăng nhập Coach đều dùng cùng resolver:

- Cache path.
- users document path.
- Fallback tìm Coach subdocument.

Không còn đường nào tự gán `window.coachBranch` từ một field chưa chuẩn hóa.

### 4.4. Runtime recovery một lần

Nếu profiles listener vẫn gặp branch rỗng do race condition:

- Thực hiện đúng một lần recovery.
- Đọc Coach assignment an toàn.
- Nếu thành công, remount listener theo branch.
- Nếu thất bại, giữ fail-closed và hiển thị hướng dẫn.
- Tuyệt đối không chạy full-club profiles fallback.

### 4.5. Sửa giao diện quản lý HLV

Admin hiện thấy với mỗi HLV:

- Cơ sở đang được phân công.
- Nhãn vàng `CHƯA GÁN CƠ SỞ` nếu dữ liệu thiếu.
- Select cơ sở.
- Nút `💾 Lưu cơ sở`.

Nguồn ghi bắt buộc:

```text
clubs/{clubId}/coaches/{uid}.branch
```

Ghi `users/{uid}.branch` chỉ là tương thích best-effort, vì Rules có thể không cho Club Admin sửa top-level user của người khác.

### 4.6. Tài khoản HLV mới bắt buộc chọn cơ sở

Đã loại bỏ lựa chọn:

```text
Tất cả cơ sở (không giới hạn)
```

Form không cho tạo tài khoản nếu chưa chọn cơ sở. CLB chỉ có một cơ sở sẽ tự chọn CS1.

### 4.7. Đồng bộ tài khoản HLV cũ

Nút đồng bộ cũ hiện:

- Chuẩn hóa mã/tên cơ sở.
- Tự gán CS1 cho CLB một cơ sở.
- Không đoán cho CLB nhiều cơ sở.
- Đếm và báo các tài khoản còn chưa gán.
- Reload danh sách để Admin sửa trực tiếp.

## 5. Ảnh hưởng Firebase Reads

Bản sửa không quay lại cách tải toàn CLB.

Mỗi lần đăng nhập Coach có thể phát sinh thêm một số document reads rất nhỏ để xác minh:

- `users/{uid}` nếu cần.
- `clubs/{clubId}/coaches/{uid}`.
- `settings/main_config` chỉ khi cần ánh xạ/phục hồi.

Đổi lại, hệ thống tránh hoàn toàn trường hợp Coach thiếu branch rồi tải 1.000+ profiles toàn CLB. Sau khi resolve, query vẫn là:

```text
status IN active statuses
AND branch == coachBranch
```

Do đó V4A/V4C1 vẫn giữ nguyên hiệu quả giảm Reads.

## 6. Ảnh hưởng Học phí, Báo nợ và Kho

Không thay đổi:

- Transaction listener Admin.
- Tuition ledger.
- Debt profile boundary.
- Inventory active debt lifecycle.
- Inventory history pagination.
- Thu gộp và completeness gate.

Tài khoản HLV vẫn không được mount các nguồn tài chính/Kho.

## 7. Firestore Rules

Bản sửa không thay Rules.

Rules đi kèm source hiện cho Club Member đọc subcollection thuộc đúng Club và chỉ Admin/SuperAdmin ghi. Điều này phù hợp với thiết kế:

- Coach đọc assignment của chính CLB.
- Admin cập nhật `clubs/{clubId}/coaches/{uid}`.
- users document chỉ được self-heal bởi chính Coach hoặc SuperAdmin nếu Rules cho phép.

Nếu production dùng Rules khác source, cần xác nhận Coach có quyền đọc Coach subdocument của đúng Club và Admin có quyền cập nhật nó.

## 8. Kiểm thử

### Chuyên biệt Phase 4K-6V4C1A

```text
16/16 PASS
```

Bao gồm:

- Coach subdocument sửa users branch rỗng.
- users branch legacy vẫn hoạt động.
- Tên cơ sở legacy ánh xạ sang CS code.
- CLB một cơ sở tự phục hồi CS1.
- CLB nhiều cơ sở thiếu assignment vẫn fail-closed.
- Apply assignment khóa bộ lọc Attendance đúng branch.
- Fast, slow và fallback auth cùng dùng resolver.
- Profiles listener chỉ recovery một lần và không full-read.

### Regression

```text
npm run check              PASS — exit code 0
npm run check:all:critical PASS — exit code 0
```

Các gate chính:

- Coach Attendance-only: 30/30 PASS.
- Trusted cache/lazy Admin reads: 28/28 PASS.
- Debt profile boundary: 21/21 PASS.
- Deploy package: 12/12 PASS.
- GitHub Pages paths: 18/18 PASS.
- Firestore indexes: 16/16 PASS.
- Production stability: 22/22 PASS.
- Runtime stability: 17/17 PASS.
- Attendance reliability: 20/20 PASS.

## 9. Cách khắc phục tài khoản đang lỗi sau deploy

### CLB một cơ sở

HLV đăng nhập lại. Resolver sẽ tự nhận CS1. Admin có thể bấm `Đồng bộ tài khoản HLV cũ` để ghi dữ liệu bền.

### CLB nhiều cơ sở

1. Admin đăng nhập.
2. Mở `Quản lý tài khoản HLV`.
3. Tìm tài khoản có nhãn vàng `CHƯA GÁN CƠ SỞ`.
4. Chọn đúng cơ sở.
5. Bấm `💾 Lưu cơ sở`.
6. HLV đăng xuất/đăng nhập lại hoặc tải lại trang.

Kết quả đúng trên Console:

```js
printCoachBranchDiagnostics()
printRoleReadBudget()
```

Coach phải có branch cụ thể và profiles listener chỉ query đúng branch đó.
