# Phase 4K-6V4D8 — Coach Profiles Bootstrap Repair

## Mục tiêu

Sửa lỗi còn lại trong tài khoản HLV sau V4D7:

- Console báo: `[RoleReadBoundary] Coach profiles module unavailable — blocked full-club fallback`.
- HLV đăng nhập được nhưng không load được danh sách võ sinh để điểm danh.
- Runtime recovery vẫn probe full datasource và sinh cảnh báo permission-denied trong phiên Coach.

## Nguyên nhân gốc

### 1. Module profile listener của Coach bị expose quá muộn

`main.js` đã import `mountActiveProfilesListener`, nhưng chỉ gán `window.mountActiveProfilesListener` ở cuối async bootstrap. Trong một số phiên Coach, `initSaaSDatabase()` của `app.js` chạy trước khi bootstrap của `main.js` đi tới đoạn expose này.

Vì Coach bị fail-closed để tránh full-club read, app ghi log:

`Coach profiles module unavailable — blocked full-club fallback`

và không mount branch-scoped profiles listener, dẫn tới danh sách điểm danh rỗng.

### 2. Runtime recovery full-club vẫn chạy trong phiên Coach

`runRuntimeDataRecovery()` là probe full/public datasource cho Admin. Với Coach attendance-only, probe này không cần thiết và dễ tạo warning permission-denied. V4D8 skip probe này trong Coach session.

### 3. AttendanceService nhận diện Coach chưa đủ chắc

`attendance.service.js` kiểm tra Coach bằng `window.userRole === 'coach'`. Nếu runtime context đang có role từ `RoleReadBoundary` hoặc role legacy như `HLV`, service có thể đi nhánh không-Coach, query sai scope và bị permission-denied.

## Sửa đổi chính

### main.js

- Import thêm `loadCoachBranchProfilesFallback`.
- Expose ngay các API profile listener sau khi module import, trước async bootstrap:
  - `window.mountActiveProfilesListener`
  - `window.loadCoachBranchProfilesFallback`
  - `window.loadFullProfilesFallback`
  - `window.ensureQuitProfilesAuthoritative`
- Điều này chặn lỗi `Coach profiles module unavailable` do race timing.

### app.js

- Khi Coach profile module chưa sẵn, không dừng luôn.
- Thêm `_retryMountCoachProfiles()` retry branch-aware listener tối đa 40 lần.
- Nếu module fallback branch đã sẵn, gọi `loadCoachBranchProfilesFallback()`.
- Vẫn tuyệt đối không mở full-club fallback cho Coach.
- `runRuntimeDataRecovery()` tự skip trong phiên Coach để không log permission denied từ probe full datasource.

### attendance.service.js

- Thêm `_normalizeRole()` nhận diện `coach`, `hlv`, `trainer`.
- Đọc Coach context từ `RoleReadBoundary.readContext()` thay vì chỉ dựa vào `window.userRole`.
- Lấy cơ sở HLV từ context đã normalize.
- Khi tất cả branch specs bị denied, trả danh sách rỗng an toàn và ghi debug, không làm vỡ render.

### attendance.js

- Thêm helper `_isCoachRole()`, `_coachBranchValue()`.
- Daily/monthly attendance luôn nhận đúng cơ sở HLV được phân công.
- Danh sách võ sinh điểm danh lọc bằng canonical branch identity.

### firestore.rules

- Sửa lỗi syntax trong `isBranch10Alias()` do dòng `||` thừa sau dấu `;`.
- Giữ rule `login_history` và branch alias boundary từ V4D7.

## Cache bust

`coach-profiles-bootstrap-repair-20260630-v4d8`

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:coach-profiles-bootstrap-repair` — PASS 12/12
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:quit-mobile-coach-attendance-repair` — PASS 21/21
- `npm run check:quit-tab-mobile-parity` — PASS 17/17

## Triển khai bắt buộc

1. Upload toàn bộ bản V4D8 lên hosting/GitHub.
2. Deploy `firestore.rules` đi kèm bản này.
3. Xóa cache/tab ẩn danh trên thiết bị HLV.
4. Đăng nhập HLV và mở tab Điểm danh.

Nếu vẫn dùng Rules cũ, HLV vẫn có thể bị permission-denied dù code web đã đúng.
