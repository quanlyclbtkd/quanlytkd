# Phase 4K-6V4D12 — SuperAdmin Access Recovery

## Mục tiêu
Khắc phục lỗi khi đăng nhập tài khoản SuperAdmin nhưng các tab/dữ liệu SuperAdmin bị Firestore chặn:

- `superadmin.js:684 FirebaseError: Missing or insufficient permissions`
- `window.loadSuperAdminData` không list được `clubs`
- `loadLoginHistory` không đọc được `login_history`

## Nguyên nhân gốc
Runtime client đã nhận diện tài khoản là SuperAdmin nhưng `firestore.rules` chưa nhận diện cùng một tập alias.

Các bản trước có các nguồn nhận diện SuperAdmin khác nhau:

1. Runtime app có fast-path email `admin@tstquynhon.com`.
2. `app.js` normalize role legacy `superadmin` thành `super_admin`.
3. Một số dữ liệu/user/custom claim có thể dùng alias `root`, `root_admin`, `admin_root`.
4. Rules cũ chỉ cho phép `role == 'super_admin'` hoặc có marker `super_admins/{uid}`.

Vì vậy UI có thể vào ROOT mode nhưng Rules vẫn từ chối `list clubs` và đọc `login_history`.

## Phương án đã chọn
Không mở public Rules. Chỉ mở rộng boundary nhận diện SuperAdmin trong Firestore Rules để đồng bộ với runtime client:

- Trusted root email fast-path: `admin@tstquynhon.com`.
- Custom claim aliases: `role`, `userRole`, `adminRole`.
- User doc aliases: `super_admin`, `superadmin`, `root`, `root_admin`, `admin_root`.
- Marker document: `super_admins/{uid}`.

## Thay đổi chính

### `firestore.rules`
- Thêm `isSuperAdminRoleValue()`.
- Thêm `isTrustedSuperAdminEmail()`.
- Sửa `isSuperAdmin()` để nhận diện đồng bộ với runtime.
- Mở `login_history` read/update/delete cho `isSuperAdmin()`.
- Cho phép `login_history` create với role aliases hợp lệ.
- Cho phép user đọc marker `super_admins/{uid}` của chính mình phục vụ diagnostics; list/write marker vẫn chỉ SuperAdmin.

### `app.js` và `public/app.js`
- `_normalizeAuthRole()` map thêm `root`, `root_admin`, `admin_root` về `super_admin`.
- Cập nhật hướng dẫn lỗi `login_history` theo boundary V4D12.

### Cache bust
- Cập nhật entrypoint sang `superadmin-access-recovery-20260630-v4d12`.

## Kiểm tra đã chạy
- `npm run check:syntax` — PASS
- `npm run check:superadmin-audit` — PASS
- `npm run check:superadmin-cache-stats-island-fallback` — PASS
- `npm run check:superadmin-render-scope-fix` — PASS
- `npm run check:superadmin-quota-guard` — PASS
- `npm run check:superadmin-safe-server-refresh` — PASS
- `npm run check:v4d11-attendance-excel-tx-delete-reconcile` — PASS
- `npm run check:v4d12-superadmin-access-recovery` — PASS 14/14
- `npm run check` — PASS toàn bộ pipeline

## Lưu ý deploy
Bản này bắt buộc deploy `firestore.rules`. Nếu chỉ upload Hosting/source mà chưa deploy Rules, SuperAdmin vẫn có thể vào giao diện ROOT nhưng tiếp tục bị `Missing or insufficient permissions` khi list `clubs` hoặc đọc `login_history`.
