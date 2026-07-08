# Phase 4K-6V5K — SuperAdmin Access + Admin Account Provisioning Recovery

## Vấn đề người dùng báo

Production console đang chạy bundle cũ:

```text
superadmin.js?v=login-history-large-list-guard-20260703-v5h
app.js?v=login-history-large-list-guard-20260703-v5h
```

và báo:

```text
FirebaseError: Missing or insufficient permissions
window.loadSuperAdminData @ superadmin.js:684
[login_history] Lỗi đọc: FirebaseError: Missing or insufficient permissions
```

Đồng thời tài khoản SuperAdmin không tạo được tài khoản Admin cho CLB.

## Nguyên nhân gốc

Runtime/UI có thể đã nhận diện tài khoản là ROOT/SuperAdmin, nhưng Firestore Rules chỉ nhận diện SuperAdmin quá hẹp:

- chỉ chấp nhận custom claim `role == super_admin`, hoặc
- users/{uid}.role đúng tuyệt đối `super_admin`, hoặc
- tồn tại marker `super_admins/{uid}`.

Trong thực tế các bản runtime trước có thể dùng nhiều alias khác nhau như:

- `superadmin`
- `root`
- `root_admin`
- `admin_root`
- claim `userRole`
- claim `adminRole`

Vì vậy xảy ra tình trạng: giao diện SuperAdmin mở được nhưng Firestore Rules không cho list `/clubs`, list `/login_history`, create `/users/{newUid}` khi cấp Admin CLB.

## Đã sửa

### 1. Firestore Rules nhận diện SuperAdmin thống nhất với runtime

Thêm helper:

```rules
function isSuperAdminRoleValue(roleValue) {
  return roleValue in [
    'super_admin', 'superadmin', 'root', 'root_admin', 'admin_root'
  ];
}
```

`isSuperAdmin()` hiện nhận:

- trusted email `admin@tstquynhon.com`
- custom claim `role`
- custom claim `userRole`
- custom claim `adminRole`
- users/{uid}.role với alias SuperAdmin
- marker document `super_admins/{uid}`

### 2. Sửa `super_admins/{uid}` marker diagnostics

Cho phép chính tài khoản tự get marker của mình để runtime diagnostic hoạt động:

```rules
allow get: if (signedIn() && request.auth.uid == uid) || isSuperAdmin();
allow list, create, update, delete: if isSuperAdmin();
```

### 3. Sửa tạo/cấp lại Admin CLB

Trong `forceReplaceAdmin()`:

- Trước khi gọi `createUserWithEmailAndPassword`, hệ thống sẽ preflight Firestore bằng cách thử đọc `/clubs` với quyền SuperAdmin.
- Nếu Rules chưa deploy hoặc chưa nhận diện SuperAdmin, thao tác dừng **trước khi tạo Auth user**, tránh sinh tài khoản Auth mồ côi.
- Khi tạo Admin thành công, users/{newUid} được ghi thêm:
  - `email`
  - `role: admin`
  - `clubId`
  - `status: active`
  - `createdAt`
  - `updatedAt`

### 4. Cải thiện log lỗi SuperAdmin

- `loadSuperAdminData` permission-denied không còn raw `console.error(e)` làm người vận hành hiểu nhầm là crash JS.
- Hệ thống hiển thị cảnh báo rõ: Firestore Rules chưa cấp quyền SuperAdmin.
- `loadLoginHistory` permission-denied chuyển sang `console.warn` và hiển thị hướng dẫn Rules thay vì lỗi đỏ không rõ nguyên nhân.

### 5. Cache-bust mới

Đổi build marker sang:

```text
attendance-status-quit-sync-20260704-v5m
```

## Kiểm tra đã chạy

Đã PASS:

- `npm run check:syntax`
- `npm run check:v5k-superadmin-access-admin-provisioning-recovery` — PASS 16/16
- `npm run check:superadmin-hotfix` — PASS 27/27
- `npm run check:superadmin-audit`
- `npm run check:superadmin-gate`
- `npm run check:mobile-superadmin-gate`
- `npm run check:superadmin-monthstats` — PASS 8/8
- `npm run check:v5e-audit-gate-superadmin-hardening` — PASS 10/10
- `npm run check:v5h-login-history-large-list-guard` — PASS 12/12
- `npm run check:superadmin-cache-stats-island-fallback`
- `npm run check:superadmin-quota-guard`
- `npm run check:superadmin-render-scope-fix`
- `npm run check:superadmin-safe-server-refresh`
- `npm run check:superadmin-server-summary-cache`
- `npm run check:db-ready-guards` — PASS 14/14
- `npm run check:github-pages-paths` — PASS 18/18
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:v5g-given-name-priority-search-unification` — PASS 15/15
- `npm run check:v5i-attendance-render-window-slow-warning-guard` — PASS 16/16
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions

Tôi cũng chạy `npm run check` tổng. Pipeline chạy qua nhiều nhóm PASS nhưng timeout do thời lượng tool; không có FAIL chức năng trước timeout sau khi đã sửa line-count guard. Các nhóm trọng yếu theo vai trò SuperAdmin/Admin/HLV đều đã chạy riêng và PASS.

## Lưu ý deploy bắt buộc

Bản này bắt buộc deploy cả:

1. Hosting/source
2. Firestore Rules

Nếu chỉ upload source mà không deploy `firestore.rules`, SuperAdmin vẫn có thể bị:

```text
Missing or insufficient permissions
```

Sau deploy cần hard refresh/xóa cache site. Nếu console vẫn hiện `login-history-large-list-guard-20260703-v5h`, nghĩa là trình duyệt/hosting vẫn đang chạy bản cũ, chưa phải V5K.
