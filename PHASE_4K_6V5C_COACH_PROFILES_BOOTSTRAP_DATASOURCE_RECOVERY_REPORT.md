# Phase 4K-6V5C — Coach Profiles Bootstrap + DataSource Recovery

## Mục tiêu

Khắc phục lỗi tài khoản HLV thỉnh thoảng load được danh sách võ sinh, thỉnh thoảng không load được, với console:

- `[RoleReadBoundary] Coach profiles module unavailable — blocked full-club fallback`
- `[resolveActiveDataSource] Permission denied — không mở Firestore Rules public`

## Nguyên nhân gốc

Console đang chạy bundle `profile-canonical-store-runtime-recovery-20260628-v4d1a`, tức runtime cũ hơn các bản V4D6/V4D8/V5A. Trong runtime này có hai lỗi liên quan HLV:

1. **Race bootstrap giữa app.js và profiles.listeners.js**
   - `app.js` có thể chạy `initSaaSDatabase()` trước khi `main.js/profiles.listeners.js` expose `window.mountActiveProfilesListener`.
   - Khi đó Coach bị fail-closed bằng cách set `allProfiles = {}` và log lỗi module unavailable.
   - Lần nào module kịp expose thì HLV load được; lần nào app init trước module thì danh sách bị trống. Vì vậy lỗi có tính “lúc được lúc không”.

2. **runtime recovery vẫn probe full-club data source cho Coach**
   - `resolveActiveDataSource()` kiểm tra `clubs/{clubId}/profiles`, `transactions`, `inventory` bằng query full-club limit(1).
   - Coach không có quyền đọc transactions/inventory/full-club, nên Firestore Rules trả `permission-denied`.
   - Đây không phải do nên mở Rules public; đúng hơn là Coach không được phép chạy probe full-club.

3. **Coach active query dùng status + branch**
   - Nhiều hồ sơ legacy có branch đúng nhưng thiếu/khác `status`.
   - Query `status + branch` làm danh sách bị thiếu hoặc trống.
   - Cần query theo branch trước, sau đó lọc quit local.

## Sửa đổi chính

### app.js

- Không còn clear `allProfiles` khi Coach profile module chưa sẵn.
- Thêm `_loadCoachProfilesBranchScopedBootstrap()`:
  - Chỉ query branch-scoped theo `branch` và `branchCode`.
  - Giới hạn 300 docs mỗi query bootstrap.
  - Không đọc full-club.
  - Không đọc transactions/inventory.
  - Nếu có dữ liệu thì hydrate `allProfiles`, `window.__store.profiles`, attendance render.
- `resolveActiveDataSource()` bỏ qua full-club probes cho Coach và trả `source: 'coach-scoped'`.
- Nếu module expose muộn, app tự retry `mountActiveProfilesListener` sau 350ms.

### js/main.js

- Import và expose `loadCoachBranchProfilesFallback`.
- Sau khi profile listener API sẵn, Coach tự retry roster hydration ở các mốc 0ms, 700ms, 1800ms.

### js/listeners/profiles.listeners.js

- Coach active query chuyển từ `status + branch` sang `branch-only` rồi lọc `quit` local.
- `loadCoachBranchProfilesFallback()` thử cả `branch` và `branchCode`.
- Một query field bị `permission-denied` không làm hỏng toàn bộ fallback.
- Vẫn không chạy full-club fallback cho Coach.

### firestore.rules

- Coach profile read hỗ trợ cả `branch` và `branchCode`.
- Coach vẫn không có quyền đọc transactions/inventory/stats.
- Unknown tenant subcollections vẫn deny-by-default.

### Attendance status cycle

- Giữ fix V5B: thứ tự click điểm danh là `0 → 1 → 3 → 2 → 0`, tránh double-tap Nghỉ có phép/Nghỉ không phép nhảy về Có mặt.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:coach-attendance-status-cycle-v5b` — PASS 7/7
- `npm run check:v5c-coach-profiles-bootstrap-datasource-recovery` — PASS 11/11
- `npm run check` — PASS toàn bộ pipeline

## Ghi chú deploy

Bản này có sửa `firestore.rules`, nên nên deploy cả Hosting/source và Firestore Rules.

Sau deploy cần kiểm tra cache: console phải thấy cache-bust `coach-profiles-bootstrap-datasource-recovery-20260702-v5c`, không còn `profile-canonical-store-runtime-recovery-20260628-v4d1a`.
