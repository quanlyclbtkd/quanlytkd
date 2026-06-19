# Phase 4K-6V4A — Coach Attendance-Only Read Boundary + Role-Aware Bootstrap

Ngày hoàn thành: 19/06/2026

## 1. Quyết định kiến trúc

Phương án được chọn là tách ranh giới đọc Firestore theo vai trò ngay tại thời điểm bootstrap:

- **Admin/SuperAdmin:** giữ nguyên đường dữ liệu Học phí, Báo nợ, Kho đồ, giao dịch, dashboard và các chức năng quản trị.
- **Coach/HLV:** chỉ được mount các nguồn dữ liệu phục vụ Điểm danh của đúng cơ sở được phân công.

Đây là phương án an toàn nhất vì cắt các Reads không cần thiết của HLV mà không phân trang hoặc thay đổi nguồn dữ liệu của Học phí, Báo nợ và Kho đồ.

## 2. Bản nguồn sử dụng

Bản mã nguồn thực tế có trong môi trường để sửa là:

```text
taekwondo-phase4K-6V3D-debt-profile-read-boundary-complete(1).zip
SHA-256: 5d32598d72cf39f00733ae363426aa2d4f590aff39b45fd2ad2e3f877f5b1b8e
```

Lưu ý: ZIP V3D1/V3F/V3F2 mới hơn không có trong môi trường mã nguồn hiện tại. Vì vậy:

- Bản ZIP hoàn chỉnh V4A là **V3D + V4A**.
- Nếu production đang chạy V3D1/V3F/V3F2, không được chép đè nguyên ZIP V4A này. Hãy áp dụng file patch V4A lên mã nguồn mới nhất hoặc tải ZIP mới nhất lên để merge và kiểm thử lại.

## 3. Nguyên nhân Reads cao ở tài khoản HLV

Trước V4A, giao diện chỉ ẩn các tab nhưng bootstrap chung vẫn có thể tạo:

- Active profiles listener cho toàn bộ CLB.
- Transaction listener tháng hiện tại.
- Inventory stats listener.
- Inventory active debt listener.
- Student/transaction pagination.
- Debt profile coverage audit.
- Dashboard/club stats cache.
- Exam settings.
- Attendance ngày/tháng chưa bắt buộc lọc theo cơ sở ở tầng Firestore.

Ẩn tab sau khi listener đã mount không làm giảm Reads. Ranh giới phải chặn trước lệnh `onSnapshot`, `getDocs` hoặc pagination init.

## 4. Nội dung triển khai

### 4.1. Role Read Boundary dùng chung

Tạo mới:

```text
js/core/roleReadBoundary.js
```

Module được nạp trước transaction boundary và `app.js`, cung cấp:

```javascript
RoleReadBoundary.setContext({ role, coachBranch, clubId })
RoleReadBoundary.canMount(source, details)
RoleReadBoundary.enforceTab(tabId)
RoleReadBoundary.diagnostics()
printRoleReadBudget()
```

Nguồn được phép cho Coach:

- `club.config`
- `settings.main`
- `profiles.active` — bắt buộc có `coachBranch`
- `attendance.daily`
- `attendance.monthly`
- `attendance.notes`
- `attendance.shifts`
- `attendance.member-history`

Các nguồn tài chính, Kho, Báo nợ, dashboard, exam, quit profiles và pagination bị chặn.

### 4.2. Coach chỉ nhìn thấy và chỉ mở được tab Điểm danh

Đã khóa ở ba lớp:

- Legacy `app.js` switchTab.
- Module `js/main.js` switchTab.
- `js/ui/tabs.js`.

Mọi yêu cầu mở tab khác của Coach được chuyển về `attendance`, kể cả lời gọi programmatic từ console hoặc code cũ.

Nút/form **Thêm võ sinh đầy đủ** bị ẩn đối với Coach vì form này kéo theo Học phí, transaction và Kho đồ.

### 4.3. Active profiles query theo đúng cơ sở

Admin giữ nguyên:

```javascript
where('status', 'in', activeStatuses)
```

Coach dùng:

```javascript
where('status', 'in', activeStatuses)
where('branch', '==', coachBranch)
```

Listener key chứa role và branch để không tái sử dụng nhầm listener Admin:

```text
students:profiles:active:{clubId}:coach:{branch}
```

Các bảo vệ bổ sung:

- Thiếu `coachBranch` → fail-closed, không query.
- Zero-profile probe chỉ probe đúng branch.
- Query lỗi/index chưa sẵn → fallback `where(branch == coachBranch)`, rồi lọc active status trong memory.
- Không bao giờ full-scan toàn collection profiles cho Coach.
- Coach không load quit profiles hoặc export-all profiles.
- Coach không chạy debt coverage audit.

### 4.4. Attendance query theo branch ngay tại Firestore

#### Theo ngày

```javascript
where('date', '==', date)
where('branch', '==', coachBranch)
where('shiftId', '==', shiftId) // khi chọn ca
```

#### Theo tháng

```javascript
where('month', '==', month)
where('branch', '==', coachBranch)
```

Monthly pagination vẫn giữ cursor và safety ceiling hiện tại.

#### Lịch sử một võ sinh

```javascript
where('profileId', '==', profileId)
where('month', 'in', months)
where('branch', '==', coachBranch)
```

#### Ghi chú buổi tập

```javascript
where('date', '==', date)
where('branch', '==', coachBranch)
```

Mọi query Coach thiếu branch đều bị chặn trước `getDocs()`.

### 4.5. Chặn nguồn Reads không cần thiết của Coach

Đã chặn cả nơi gọi và bên trong boundary tương ứng:

- Transaction listener tháng.
- Canonical transaction settings gate/optimizer.
- Inventory stats listener.
- Inventory active debt listener.
- Inventory categories hydration.
- Debt profile coverage.
- Student pagination.
- Transaction pagination.
- Quit profiles.
- Export-all profiles.
- Exam settings.
- Club stats auto cache.

Khi bị chặn, hệ thống ghi diagnostics nhưng không tạo Firestore request.

### 4.6. Admin runtime được giữ nguyên

Không thay đổi query hoặc nghiệp vụ Admin đối với:

- Học phí và transaction listener tháng.
- Canonical transaction read mode.
- Báo nợ và debt profile boundary.
- Inventory stats.
- Complete inventory active debt listener.
- Inventory history pagination 100 bản ghi/trang.
- Thu gộp khoản.

Guard `canMount()` luôn trả `true` với Admin/SuperAdmin, vì vậy đường cũ tiếp tục hoạt động.

## 5. Firestore indexes bổ sung

`firestore.indexes.json` đã bổ sung:

- profiles: `status + branch`
- attendance: `date + branch`
- attendance: `date + branch + shiftId`
- attendance: `month + branch`
- attendance: `profileId + month + branch`
- attendanceNotes: `date + branch`

Không cần Blaze, Cloud Functions hoặc migration dữ liệu.

## 6. Mức giảm Reads dự kiến

Ví dụ một CLB có:

- 1.000 võ sinh, chia 5 cơ sở.
- 500 giao dịch tháng hiện tại.
- 50 công nợ Kho.
- Khoảng 100 bản ghi điểm danh/ngày toàn CLB.

Trước V4A, một phiên HLV có thể tải gần:

```text
1.000 profiles + 500 transactions + 50 inventory debts + 100 attendance ≈ 1.650 Reads ban đầu
```

Sau V4A, một HLV ở cơ sở khoảng 200 võ sinh có thể chỉ tải:

```text
200 profiles đúng cơ sở + khoảng 20 attendance đúng cơ sở + vài config docs ≈ 225 Reads
```

Mức giảm minh họa khoảng 86%. Số thực tế phụ thuộc số võ sinh, cơ sở và dữ liệu ngày đang xem.

## 7. Thứ tự triển khai production

### Bước 1 — Backup bản đang chạy

Giữ lại ZIP hoặc commit Git của production trước khi thay đổi.

### Bước 2 — Xác nhận đúng bản nền

- Nếu production là V3D: có thể dùng ZIP hoàn chỉnh V4A.
- Nếu production là V3D1/V3F/V3F2: áp dụng patch vào mã nguồn mới nhất, giải quyết conflict và chạy lại test. Không chép đè ZIP nền V3D.

### Bước 3 — Deploy indexes trước

```bash
firebase deploy --only firestore:indexes
```

Chờ các index chuyển sang trạng thái `Enabled` trước khi deploy frontend. Deploy index không yêu cầu Blaze.

### Bước 4 — Deploy frontend

Đưa toàn bộ file đã merge lên GitHub Pages/Firebase Hosting theo quy trình hiện tại.

### Bước 5 — Hard refresh

```text
Ctrl + F5
```

Cache-bust V4A đã được thêm vào `index.html` và các import liên quan.

### Bước 6 — Smoke test tài khoản Coach

1. Đăng nhập Coach đã được gán cơ sở.
2. Chỉ tab Điểm danh được hiển thị.
3. Danh sách chỉ có võ sinh đúng cơ sở.
4. Đổi ngày và ca vẫn tải đúng dữ liệu.
5. Mở console chạy:

```javascript
printRoleReadBudget()
```

Kết quả phải cho thấy các nguồn sau nằm trong `blocked`:

```text
transactions.month
inventory.stats
inventory.active-debts
students.pagination
transactions.pagination
debt.coverage
exam.settings
club.stats-cache
```

### Bước 7 — Smoke test Admin

1. Tab Học phí có giao dịch tháng hiện tại.
2. Báo nợ hiển thị đúng học phí và công nợ Kho.
3. Thu gộp lấy đủ khoản.
4. Kho đồ hiển thị đúng tồn và công nợ.
5. Inventory history vẫn tải 100 bản ghi/trang.

## 8. Rollback

Nếu Coach không tải được danh sách do index chưa sẵn:

1. Không xóa hoặc thay đổi dữ liệu Firestore.
2. Rollback frontend về commit/ZIP trước V4A.
3. Giữ quá trình build index chạy xong.
4. Deploy lại V4A sau khi index Enabled.

V4A không migration và không sửa dữ liệu hiện có, nên rollback chỉ là rollback frontend.

## 9. Firestore Rules

Phase này không tự động thay `firestore.rules` vì file Rules hiện tại là baseline chưa được xác nhận bằng Emulator cho toàn bộ nghiệp vụ legacy. V4A giảm Reads bằng query/client bootstrap boundary.

Để bảo vệ dữ liệu Coach ở tầng server, nên làm tiếp Phase V4A2:

- Rules giới hạn Coach chỉ đọc profiles/attendance đúng branch.
- Rules Emulator cho Admin/Coach/Viewer.
- Canary một CLB trước khi deploy Rules.

Không nên deploy Rules mới trực tiếp cùng V4A nếu chưa chạy Emulator vì có thể làm hỏng Học phí/Báo nợ/Kho của Admin.

## 10. Kiểm thử

- `npm run check`: PASS, exit code 0.
- `npm run check:all:critical`: PASS, exit code 0.
- V4A specialized: 30/30 PASS.
- Firestore indexes readiness: 16/16 PASS.
- Deploy package: 12/12 PASS.
- GitHub Pages paths: 18/18 PASS.
- Runtime stability: 17/17 PASS.
- Production stability: 22/22 PASS.
- Debt profile boundary: 21/21 PASS.
- Inventory history/active debt: 25/25 PASS.

## 11. File production thay đổi

- `app.js`
- `index.html`
- `firestore.indexes.json`
- `js/core/roleReadBoundary.js` — mới
- `js/core/transactionCanonicalBoundary.js`
- `js/core/debtProfileReadBoundary.js`
- `js/core/clubStatsAutoCache.js`
- `js/listeners/profiles.listeners.js`
- `js/main.js`
- `js/modules/attendance.js`
- `js/modules/students.js`
- `js/modules/finance.js`
- `js/services/attendance.service.js`
- `js/ui/tabs.js`

Các file package/checker cũng được cập nhật để bảo vệ ranh giới này trong các phase sau.
