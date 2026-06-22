# Phase 4K-6V4C2A — Coach Branch Resolution + Legacy Account Repair

Ngày hoàn thành: 22/06/2026

## 1. Hiện tượng

Một số tài khoản HLV chỉ thấy tab Điểm danh nhưng danh sách võ sinh trống. Console hiển thị:

```text
[ProfilesListener] Coach missing branch — fail closed, no profiles query
```

Giao diện đồng thời hiển thị cơ sở “Tất cả” và không có võ sinh phù hợp bộ lọc.

## 2. Nguyên nhân gốc

Đây không phải lỗi Attendance renderer và cũng không phải do Firestore không có võ sinh. V4A chủ động fail-closed khi HLV không có cơ sở để tránh tải toàn bộ CLB. Một số tài khoản legacy vi phạm hợp đồng dữ liệu mới.

Các nguyên nhân đã xác định:

1. Form tạo HLV cũ cho phép `branch` rỗng và hiểu rỗng là “Tất cả cơ sở”.
2. V4A đổi `branch` rỗng thành thiếu phân quyền và chặn query, nhưng dữ liệu tài khoản cũ chưa được sửa.
3. CLB một cơ sở có profiles lưu `branch: "Mặc định"`, trong khi tài khoản HLV có thể lưu `CS1` hoặc tên hiển thị cơ sở.
4. `users/{uid}` và `clubs/{clubId}/coaches/{uid}` có thể không đồng nhất.
5. Auth cache cũ có thể giữ `coachBranch` rỗng trong nhiều ngày.
6. Admin chưa có thao tác sửa cơ sở trực tiếp cho từng tài khoản HLV.
7. Dữ liệu profile legacy có thể trộn các cách lưu cùng một cơ sở: `Mặc định`, `CS1`, `Cơ sở 1` hoặc tên cơ sở cấu hình.

## 3. Phương án đã thực hiện

### 3.1. Canonical Coach Branch Resolver

Tạo mới:

```text
js/core/coachBranchResolver.js
```

Quy tắc:

- `""` = thiếu cơ sở, không bao giờ tự hiểu là toàn CLB.
- `all` = toàn bộ cơ sở được chọn rõ ràng.
- CLB một cơ sở dùng giá trị lưu legacy `Mặc định`.
- CLB nhiều cơ sở dùng `CS1`…`CS10`.
- Hỗ trợ các field cũ: `branchId`, `branchCode`, `coachBranch`, `assignedBranch`, `facility`, `location`, `branchName`.
- Tự nhận diện số cơ sở từ `branchCount` hoặc các field `branchName1..10`.

### 3.2. Xác minh cơ sở trước bootstrap HLV

Coach không còn dùng auth cache để bootstrap nhanh khi chưa xác minh.

Mỗi lần HLV đăng nhập:

1. Đọc cấu hình cơ sở từ `settings/main_config`.
2. Nếu cần, fallback sang document CLB.
3. Đọc `clubs/{clubId}/coaches/{uid}` làm nguồn gán cơ sở chính.
4. Fallback `users/{uid}` rồi mới dùng cache cũ.
5. Chuẩn hóa cơ sở.
6. Nếu CLB chỉ có một cơ sở và chưa gán, suy ra an toàn thành `Mặc định`.
7. Nếu CLB nhiều cơ sở mà vẫn thiếu, đăng nhập bị chặn và hiển thị hướng dẫn rõ ràng.

Không còn trường hợp app vào màn hình Điểm danh rỗng mà chỉ có lỗi console.

### 3.3. Công cụ sửa tài khoản HLV trong Admin

Danh sách tài khoản HLV hiện:

- Đánh dấu màu cam/đỏ tài khoản chưa gán cơ sở.
- Hiển thị cảnh báo “HLV sẽ không tải được võ sinh”.
- Có select chọn cơ sở cho từng HLV.
- Có nút `💾 Lưu cơ sở`.
- Ghi đồng thời `coaches/{uid}` và best-effort `users/{uid}`.
- Yêu cầu HLV đăng nhập lại sau khi sửa.

Form tạo HLV mới bắt buộc chọn cơ sở. “Tất cả cơ sở” là lựa chọn riêng `all` và có cảnh báo Reads cao hơn.

### 3.4. Sửa công cụ đồng bộ tài khoản cũ

`migrateCoachAccounts()` hiện:

- Ưu tiên branch trong `coaches/{uid}`.
- Nếu thiếu mới thử phục hồi từ `users/{uid}`.
- CLB một cơ sở tự điền `Mặc định`.
- CLB nhiều cơ sở không tự đoán; tài khoản được báo là unresolved để Admin chọn.
- Đồng bộ `branchScope` và hai nguồn dữ liệu.
- Không tuyên bố thành công toàn bộ nếu vẫn còn tài khoản chưa gán.

### 3.5. Listener profiles hỗ trợ dữ liệu branch legacy

HLV cơ sở cụ thể sử dụng các realtime queries có `status + branch` cho từng alias của đúng cơ sở, rồi hợp nhất dữ liệu:

```text
Mặc định
CS1
Cơ sở 1
tên cơ sở cấu hình
```

Các alias là rời nhau nên một profile chỉ thuộc một query. Hệ thống vẫn:

- Không tải cơ sở khác.
- Không tải profiles đã nghỉ trong primary listener.
- Không mount transactions, Kho, Báo nợ, Dashboard hoặc Exam cho Coach.

Nếu query status không có kết quả do profile legacy thiếu/sai status, fallback chỉ query các alias của cơ sở được giao rồi lọc status tại máy. Không có full-club fallback.

### 3.6. Explicit all-branch Coach

Tài khoản được Admin chọn rõ `Tất cả cơ sở` dùng scope `all` và query active profiles toàn CLB. Đây là lựa chọn có Reads cao hơn nhưng không còn phụ thuộc vào branch rỗng mơ hồ.

## 4. Ảnh hưởng Firebase Reads

HLV cơ sở cụ thể vẫn chỉ đọc profiles đúng cơ sở.

Với dữ liệu branch đồng nhất, tổng document reads gần tương đương V4A. Với dữ liệu legacy trộn alias, listener có thêm vài query nhưng các tập document không chồng nhau; chi phí bổ sung chủ yếu là minimum read của query rỗng, đổi lại danh sách không bị thiếu.

Mỗi lần HLV đăng nhập có thêm khoảng 1–3 document reads nhỏ để xác minh:

- main_config/club config;
- coaches/{uid};
- users/{uid} đã được đọc trong auth flow hiện có.

Chi phí này nhỏ hơn rất nhiều so với việc fallback tải toàn bộ CLB và cần thiết để bảo đảm phân quyền cơ sở chính xác.

## 5. Những phần không thay đổi

- Học phí Admin.
- Canonical transaction listener.
- Báo nợ Admin.
- Công nợ Kho và inventory ledger.
- Thu gộp khoản.
- Trusted persistent cache V4C1.
- Attendance write logic.
- Firestore schema profiles/transactions/inventory.
- Firestore Rules.
- Không dùng Blaze, Cloud Functions hoặc migration toàn collection.

## 6. Kiểm thử

- `npm run check`: PASS, exit code 0.
- `npm run check:all:critical`: PASS, exit code 0.
- V4C2A dedicated checks: 23/23 PASS.
- V4A Coach Attendance-only checks: 31/31 PASS.
- V4C1 Trusted Cache checks: 28/28 PASS.
- Syntax: 121 items PASS.
- Deploy package: 12/12 PASS.
- GitHub Pages paths: 18/18 PASS.
- Firestore indexes: 16/16 PASS.
- Runtime stability: 17/17 PASS.
- Production stability: 22/22 PASS.
- Debt read boundary: 21/21 PASS.
- Inventory history/debt: 25/25 PASS.
- Inventory ledger reconciliation: 33/33 PASS.

## 7. Quy trình sau deploy

1. Admin đăng nhập.
2. Mở `Quản lý tài khoản HLV`.
3. Bấm `Đồng bộ tài khoản HLV cũ`.
4. Với tài khoản còn cảnh báo màu cam, chọn đúng cơ sở rồi bấm `Lưu cơ sở`.
5. HLV đăng xuất/đăng nhập lại hoặc tải lại trang bằng Ctrl+F5.
6. Trên tài khoản HLV chạy:

```js
printCoachBranchResolution()
printRoleReadBudget()
```

Kết quả đúng:

```text
coachBranch: Mặc định / CSx / all
missing: false
profiles.active: allowed
transactions.month: blocked
inventory.active-debts: blocked
```

## 8. Kết luận

Lỗi ảnh chụp phát sinh vì tài khoản HLV thiếu branch, không phải vì danh sách võ sinh bị mất. Bản V4C2A sửa cả dữ liệu tài khoản, auth cache, khác biệt cách lưu branch và listener realtime, đồng thời vẫn giữ ranh giới giảm Reads của V4A.
