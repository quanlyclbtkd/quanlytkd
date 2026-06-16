# PHASE 4K-6V3D — DEBT PROFILE COVERAGE READ BOUNDARY

## 1. Mục tiêu

Loại bỏ việc tab **BÁO NỢ** đọc lại toàn bộ collection `profiles` mỗi lần mở, nhưng vẫn bảo đảm không bỏ sót võ sinh do dữ liệu trạng thái cũ, thiếu trường hoặc khác chữ hoa/thường.

Phase này không thay đổi công thức tính nợ, không thay đổi giao dịch tài chính, không thay đổi cấu trúc Kho đồ và không phân trang listener võ sinh đang tập.

## 2. Phân tích các phương án

### Phương án A — Tạo query riêng `hasDebt == true`

Ưu điểm: chỉ đọc võ sinh thực sự nợ.

Rủi ro ở hệ thống hiện tại:

- Dữ liệu cũ chưa có `hasDebt` đầy đủ.
- Phải cập nhật summary nợ ở mọi đường Thu học phí, Thu gộp, Kho đồ, thi đai, báo nghỉ và nghỉ tập.
- Nếu một đường ghi bỏ sót, tab Báo nợ có thể thiếu người nhưng không có cảnh báo.
- Query mới đọc trùng một phần dữ liệu đã có trong active profiles listener.

Kết luận: chưa chọn ở phase này.

### Phương án B — Giữ full scan nhưng thêm cache

Ưu điểm: ít thay đổi code.

Nhược điểm:

- Phiên mới, thiết bị mới hoặc hết cache vẫn đọc lại 1.000–1.500 hồ sơ.
- Không xử lý nguyên nhân trạng thái legacy không khớp query.
- Khó xác minh cache còn đầy đủ sau khi nhiều thiết bị cùng cập nhật.

Kết luận: không chọn.

### Phương án C — Tái sử dụng active profiles listener + kiểm tra coverage bằng count aggregation

Cơ chế:

1. Active profiles listener tiếp tục là nguồn chính cho tab Báo nợ.
2. Hệ thống đếm tổng hồ sơ, hồ sơ trạng thái active và hồ sơ trạng thái quit.
3. Nếu `total == active + quit`, dữ liệu trạng thái đã phủ đầy đủ và không cần full scan.
4. Nếu có gap, hệ thống dùng full fallback đúng một lần, chuẩn hóa status cũ, rồi kiểm tra parity lại.
5. Kết quả xác minh lưu theo từng CLB trong `settings/main_config` với TTL 24 giờ.
6. Distributed lock ngăn hai thiết bị cùng chuẩn hóa.

Kết luận: **được chọn** vì giảm Reads ngay, giữ đầy đủ dữ liệu và không yêu cầu migration toàn bộ trước khi deploy.

## 3. Các bước triển khai đã thực hiện

### Bước 1 — Tạo Debt Profile Read Boundary dùng chung

Thêm file:

`js/core/debtProfileReadBoundary.js`

Boundary quản lý:

- readiness của active profiles listener;
- count coverage audit;
- distributed lock;
- one-time legacy normalization;
- parity gate;
- trạng thái theo từng CLB;
- metrics và reset lifecycle.

### Bước 2 — Thay full scan lặp bằng boundary

`loadAllProfilesForDebt()` được giữ tên để tương thích legacy nhưng không còn vòng lặp cursor đọc toàn bộ profiles.

`ensureDebtProfilesReady()` hiện gọi:

`window.ensureDebtProfileCoverage(reason)`

Tab Báo nợ không còn tự full scan mỗi lần mở nếu coverage đã được xác minh.

### Bước 3 — Count coverage audit

Mỗi lần cần xác minh, hệ thống chạy ba aggregation query:

- tổng số profile;
- số profile thuộc tập trạng thái active;
- số profile thuộc tập trạng thái quit.

Coverage đạt khi:

`total === active + quit`

Firestore query là phân biệt chữ hoa/thường. Vì vậy các giá trị như `Active`, `Đang tập`, thiếu `status` hoặc status cũ không nằm trong tập chuẩn sẽ tạo gap và được xử lý.

### Bước 4 — Chuẩn hóa dữ liệu legacy có kiểm soát

Chỉ Admin CLB mới có quyền tự chuẩn hóa.

Khi phát hiện gap:

1. Chiếm lease tại `settings/debt_profile_coverage_lock` bằng Firestore transaction.
2. Kiểm tra count lần nữa sau khi có lock.
3. Chỉ khi gap vẫn tồn tại mới gọi full fallback.
4. Chỉ cập nhật document có status không tương thích.
5. Ghi theo batch tối đa 400 document.
6. Kiểm tra count parity lần cuối.
7. Chỉ đánh dấu verified nếu parity đạt tuyệt đối.

Nếu lỗi, hệ thống không ghi trạng thái verified.

### Bước 5 — Trạng thái xác minh theo từng CLB

Các trường được lưu trong `settings/main_config`:

- `debtProfileCoverageVersion`
- `debtProfileCoverageVerified`
- `debtProfileCoverageVerifiedAt`
- `debtProfileCoverageSource`
- `debtProfileCoverageTotal`
- `debtProfileCoverageActive`
- `debtProfileCoverageQuit`

TTL xác minh là 24 giờ để phát hiện dữ liệu được tạo bởi client cũ trong tương lai, nhưng không full scan mỗi lần mở tab.

### Bước 6 — Lifecycle và quyền truy cập

- Tự lên lịch audit sau settings snapshot và active profiles snapshot.
- Hủy timer/reset state khi đổi CLB hoặc đăng xuất.
- Viewer/coach không thực hiện normalization writes.
- Non-admin có thể dùng count audit; nếu coverage chưa đầy đủ thì dùng guarded fallback để không hiển thị thiếu dữ liệu.

### Bước 7 — Metrics

Console:

`window.printDebtReadMetrics()`

Trạng thái:

`window.getDebtProfileCoverageStatus()`

Các số liệu gồm count audit, full scan tránh được, fallback đã chạy, số document được chuẩn hóa, lock/parity failure và nguồn dữ liệu hiện tại.

## 4. Tác động đến Firestore Reads

### Trường hợp CLB đã verified trong TTL

Mở tab Báo nợ:

- không chạy full profile scan;
- không thêm query document profiles;
- dùng dữ liệu active profiles listener đã có.

### Lần xác minh định kỳ

- chạy ba count aggregation query;
- không tải nội dung từng profile về client nếu coverage sạch.

### Chỉ khi phát hiện dữ liệu legacy

- chạy một full fallback để sửa dữ liệu cũ;
- chỉ ghi các profile status không tương thích;
- kiểm tra parity;
- các lần sau không scan lại trong TTL.

Phase này không loại bỏ Reads ban đầu của active profiles listener. Nó loại bỏ nguồn đọc lặp lớn khi mở tab Báo nợ.

## 5. Cổng an toàn

- Không đánh dấu verified chỉ dựa trên số hồ sơ đang có trong client.
- Không dùng heuristic `page size` để kết luận đầy đủ.
- Không normalization nếu tài khoản không có quyền Admin.
- Không cho hai thiết bị cùng migration nhờ distributed lock.
- Không ghi main_config trước parity.
- Không xóa profile.
- Không thay đổi dữ liệu học phí, giao dịch, Kho hoặc thi đai.
- Không Cloud Functions.
- Không yêu cầu Blaze.

## 6. Kết quả kiểm thử

- V3D Debt Profile Read Boundary: **21/21 PASS**.
- Syntax: **117/117 hợp lệ**.
- Toàn bộ `check:all`: **68/68 nhóm PASS** (67 nhóm chạy song song + syntax chạy độc lập để tránh timeout tổng).
- Runtime Smoke Test: PASS.
- Production Stability Gate: PASS.
- Debt Full Coverage: PASS.
- Debt Actions/Service Bridge: PASS.
- Transaction Canonical V3BC1: PASS.
- Payment Bundle V3A1: PASS.
- Inventory V2/V2A/V2B/V2C: PASS.
- GitHub Pages Paths: PASS.
- Deploy Package: PASS.

## 7. Giới hạn còn lại

- Active profiles listener vẫn tải toàn bộ võ sinh đang tập trong initial snapshot.
- Phase này không tạo `hasDebt` summary vì chưa thể bảo đảm mọi đường ghi cập nhật summary nguyên tử.
- Count verification có TTL 24 giờ; client cũ ghi status lạ có thể được phát hiện ở lần audit tiếp theo.
- Hiệu quả billing thực tế cần được xác nhận bằng Firebase Usage/Monitoring sau deploy.

## 8. Kết luận

V3D là bước an toàn nhất tiếp theo: loại bỏ full scan profiles lặp khi mở Báo nợ, vẫn giữ coverage đầy đủ cho dữ liệu cũ, và chỉ cho phép chuẩn hóa một lần khi có bằng chứng count gap. Hệ thống không cần nút thủ công và tự quản lý độc lập theo từng CLB.
