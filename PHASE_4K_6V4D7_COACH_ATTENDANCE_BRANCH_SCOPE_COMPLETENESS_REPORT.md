# Phase 4K-6V4D7 — Coach Attendance Branch Scope Completeness Repair

## Mục tiêu
Sửa lỗi tài khoản HLV đăng nhập được nhưng tab Điểm danh không load đầy đủ võ sinh trong cơ sở được giao quyền.

## Nguyên nhân gốc
Bản V4D6 đã bỏ phụ thuộc vào `status` khi query HLV, nhưng vẫn còn thiếu ở boundary cơ sở:

1. Listener chính của HLV chỉ query `branch == CSx`.
2. Dữ liệu cũ có thể lưu cơ sở ở `branchCode`, `coachBranch`, hoặc lưu `branch` bằng tên cơ sở thật như `Nguyễn Trãi`, `Cơ sở Nguyễn Trãi`, `Cơ sở 2`, `CS02`.
3. Fallback branch mirror chỉ chạy khi query chính rỗng. Nếu query chính có một vài hồ sơ `branch == CSx`, fallback không chạy nên các hồ sơ ở mirror/alias khác bị bỏ sót.
4. Settings chứa tên cơ sở đến sau listener mount, nên nếu không reconcile lại sau `settings-ready`, các profile lưu bằng tên cơ sở vẫn không được lấy.

## Sửa đổi chính

### 1. BranchIdentity dynamic aliases
- `CSx` có alias: `CS02`, `CS 2`, `Cơ sở 2`, `Co so 2`, `2`.
- Nếu `settings/main_config.branchNameX` có tên cơ sở, alias thêm:
  - `Nguyễn Trãi`
  - `Cơ sở Nguyễn Trãi`
  - `Co so Nguyễn Trãi`
  - `CS2 Nguyễn Trãi`
  - `CS2 - Nguyễn Trãi`
- `normalize()` có thể đưa tên cơ sở thật về mã `CSx`.

### 2. Coach profiles listener
- Listener HLV không chỉ dùng `branch` nữa.
- Query theo cả 3 field:
  - `branch`
  - `branchCode`
  - `coachBranch`
- Mỗi field dùng alias của cơ sở được giao.
- Kết quả được merge/deduplicate theo profile ID.
- Vẫn không full-read toàn CLB.

### 3. Settings-ready reconciliation
- Sau khi `settings/main_config` load xong, hệ thống gọi:
  `ensureCoachBranchProfilesHydrated('settings-ready-branch-aliases')`
- Mục tiêu là lấy lại các profile cũ đang lưu bằng tên cơ sở thật.
- Vẫn là branch-scoped queries, không mở quyền public và không đọc toàn bộ CLB.

### 4. Attendance filter local
- `_sameBranch()` trong `attendance.js` đã so khớp theo alias động + tên hiển thị cơ sở.
- Tránh trường hợp Firestore đã lấy được hồ sơ nhưng filter local lại loại nhầm do `branch` là tên cơ sở.

### 5. Firestore Rules
- Rules cho HLV đọc hồ sơ đúng cơ sở theo:
  - canonical `CSx`
  - alias số `CS02`, `Cơ sở 2`, `2`, ...
  - tên cơ sở trong `settings/main_config.branchNameX`
- HLV vẫn bị chặn tài chính/kho/thống kê/toàn CLB.

## Files thay đổi
- `js/core/branchIdentity.js`
- `js/listeners/profiles.listeners.js`
- `js/modules/attendance.js`
- `js/main.js`
- `app.js`
- `firestore.rules`
- `index.html`
- `tools/check-coach-attendance-branch-scope-v4d7.mjs`
- `tools/check-security-coach-branch-boundary.mjs`
- `tools/check-coach-branch-runtime-repair.mjs`
- `package.json`
- `public/*` rebuilt from root runtime assets

## Cache marker
`coach-attendance-branch-scope-20260630-v4d7`

## Checks đã chạy
- `npm run build:public`
- `npm run check:syntax`
- `npm run check:coach-attendance-branch-scope`
- `npm run check:coach-attendance-only-read-boundary`
- `npm run check:security-coach-branch-boundary`
- `npm run check:coach-branch-runtime-repair`

Tất cả các checks trên đều PASS.

## Ghi chú triển khai
Sau khi upload code, bắt buộc Publish lại `firestore.rules` bản V4D7. Nếu không publish rules mới, các query theo alias/tên cơ sở có thể vẫn bị permission-denied hoặc thiếu dữ liệu.
