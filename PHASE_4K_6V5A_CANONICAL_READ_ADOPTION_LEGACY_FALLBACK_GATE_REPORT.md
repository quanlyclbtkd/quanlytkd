# Phase 4K-6V5A — Canonical Read Adoption + Legacy Fallback Gate

## Mục tiêu

Chuyển các luồng đọc hồ sơ võ sinh sang một boundary chuẩn dùng chung, sau Phase 4K-6V5 đã bắt đầu ghi các field chuẩn:

- `statusKind`
- `branchCode`
- `isQuit`
- `updatedAt`

Nguyên tắc an toàn:

- Không migration hàng loạt.
- Không Cloud Functions.
- Không Blaze.
- Không full scan nền.
- Không bỏ legacy fallback ngay.
- Field chuẩn thắng; legacy chỉ fallback khi thiếu field chuẩn.

## Vấn đề cần tránh

Không được tự ép `branchCode = CS1` hoặc suy luận branch khi payload không có tín hiệu cơ sở, vì các thao tác tài chính/học phí có thể chỉ cập nhật `paidUntil`, `paidMonths`, `tuitionFee`. Gán nhầm branch ở các thao tác này có thể làm HLV đọc nhầm cơ sở.

V5A chỉ chuyển tầng đọc sang boundary chuẩn; write boundary an toàn của V5 vẫn được giữ.

## Thay đổi chính

### 1. Canonical read helpers dùng chung

Cập nhật `js/core/profileCanonicalBoundary.js`:

- `getCanonicalProfileReadStatus(profile)`
- `getCanonicalProfileReadBranch(profile)`
- `getCanonicalProfileReadInfo(profile)`
- `isProfileActiveForDisplay(profile)`
- `isProfileQuitForDisplay(profile)`
- `isProfileActiveForAttendance(profile)`
- `isProfileActiveForDebt(profile)`
- `profileBranchMatchesFilter(profile, selectedBranch)`
- `computeCanonicalProfileHealth(profiles)`
- `printCanonicalProfileHealth(profiles)`

### 2. Fallback gate

Quy tắc đọc trạng thái:

1. Nếu có `statusKind` hợp lệ hoặc `isQuit` boolean: dùng canonical.
2. Nếu canonical conflict, `quit` thắng để tránh võ sinh đã nghỉ xuất hiện trong Điểm danh/Báo nợ.
3. Nếu thiếu canonical: mới dùng legacy fallback (`status`, `active`, `quitDate`, `ngayNghi`, ...).

Quy tắc đọc cơ sở:

1. Nếu có `branchCode = CS1..CS10`: dùng canonical.
2. Nếu thiếu `branchCode`: fallback qua các field cũ như `branch`, `branchName`, `trainingBase`, `coSoTap`, ...
3. Không để legacy override `branchCode` đã hợp lệ.

### 3. Chuyển các luồng sang helper chung

- `js/data/profileStatusConfig.js`: classifier delegate sang canonical read gate.
- `js/modules/attendance.js`: Điểm danh dùng `isProfileActiveForAttendance()` và `getCanonicalProfileReadBranch()`.
- `js/modules/students.js`: Báo nợ/Zalo debt dùng `isProfileActiveForDebt()` và `profileBranchMatchesFilter()`.
- `js/core/tuitionDebtCanonical.js`: tuition debt state dùng canonical status/branch read gate.
- `js/core/profileCanonicalStore.js`: store branch source ưu tiên canonical branch gate.
- `js/ui/render/renderStudents.js`: Đã nghỉ hiển thị cơ sở theo canonical branch info.
- `app.js`: legacy fallback debt/classifier cũng gọi boundary chuẩn khi có.

### 4. Metric đo tỷ lệ chuẩn hóa

Có thể chạy trong console:

```js
printCanonicalProfileHealth()
```

Kết quả đo local cache hiện có, không đọc thêm Firestore:

- tổng hồ sơ đã load
- số hồ sơ có status canonical
- số hồ sơ còn fallback status
- số hồ sơ có branchCode canonical
- số hồ sơ còn fallback branch
- số hồ sơ thiếu branch
- tỷ lệ canonical

### 5. Test khóa lỗi

Thêm:

- `tools/check-v5a-canonical-read-adoption-legacy-fallback-gate.mjs`
- script `check:v5a-canonical-read-adoption-legacy-fallback-gate`
- đưa vào `npm run check`

## Files chính đã sửa

- `js/core/profileCanonicalBoundary.js`
- `js/data/profileStatusConfig.js`
- `js/modules/attendance.js`
- `js/modules/students.js`
- `js/core/tuitionDebtCanonical.js`
- `js/core/profileCanonicalStore.js`
- `js/ui/render/renderStudents.js`
- `app.js`
- `index.html`
- `package.json`
- `tools/check-v5-canonical-profile-status-branch-boundary.mjs`
- `tools/check-v5a-canonical-read-adoption-legacy-fallback-gate.mjs`
- `public/` mirrors

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5a-canonical-read-adoption-legacy-fallback-gate` — PASS 14/14
- `npm run check:v5-canonical-profile-status-branch-boundary` — PASS 18/18
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:v4d10-admin-tx-quit-authoritative` — PASS 11/11
- `npm run check:v4d11-attendance-excel-tx-delete-reconcile` — PASS 12/12
- `npm run check:v4d12-superadmin-access-recovery` — PASS 14/14
- `npm run check` — PASS toàn bộ pipeline

## Ghi chú deploy

V5A chủ yếu là source/runtime read boundary. Firestore Rules không thay đổi so với V5. Nếu production đang ở Rules từ V4D7/V4D8/V4D11/V4D12/V5 thì chỉ cần deploy Hosting/source. Nếu production rules còn cũ hơn, vẫn nên deploy rules mới nhất đi kèm package.
