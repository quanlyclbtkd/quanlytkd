# Phase 4K-6V5P — Quit Authoritative Data Boundary

## Mục tiêu

Sửa lỗi tab **🛑 Đã Nghỉ** load thiếu võ sinh, khiến Admin không tìm thấy võ sinh để khôi phục khi đăng ký tập lại và có thể gây sai lệch học phí khi đưa học viên quay lại trạng thái đang tập.

## Nguyên nhân gốc đã phát hiện

1. **`quitLoaded` bị dùng sai ý nghĩa**
   - Trước đây `quitLoaded === true` có thể chỉ có nghĩa là đã load một phần danh sách nghỉ từ targeted query/local cache.
   - Khi flag này bật, hệ thống có thể bỏ qua bước full authoritative reconciliation, dẫn đến tab Đã Nghỉ nghĩ rằng đã đủ dữ liệu nhưng thực tế vẫn thiếu.

2. **Tab Đã Nghỉ có quá nhiều lớp nguồn dữ liệu**
   - `active profiles listener`
   - `quit lazy loader`
   - `full profiles fallback`
   - `studentProfileStore`
   - `window.allProfiles`
   - `window.__store.profiles`
   - `SearchRuntime`
   - `studentsRenderer` PASS 1/PASS 2
   - `renderStudents` authoritative mobile/direct renderer

   Các lớp này không dùng cùng một source và filter boundary, nên khi một lớp dùng active-only map, võ sinh nghỉ có thể biến mất khỏi kết quả tìm kiếm/khôi phục.

3. **Search của tab Đã Nghỉ có thể dùng nguồn active-only**
   - `StudentSearchIndex` và `SearchRuntime` có thể ưu tiên `window.__store.profiles`, trong một số thời điểm chỉ chứa võ sinh đang tập.
   - Vì vậy võ sinh đã nghỉ không có trong index search, dẫn đến tìm không ra để khôi phục.

4. **Renderer Đã Nghỉ không thống nhất search/branch filter**
   - `studentsRenderer` và direct authoritative renderer có thể tính số dòng khác nhau.
   - Direct render có thể override cache lọc tìm kiếm, làm danh sách bị thiếu hoặc sai khi tìm/đổi cơ sở.

5. **Khi mở tab Đã Nghỉ chưa ép chạy authoritative load/reconcile**
   - `ensureStudentTabRendered('quit')` trước đây chủ yếu refresh cache/render, chưa đảm bảo bắt đầu `loadQuitProfilesIfNeeded()` để hoàn tất danh sách nghỉ.

## Cách sửa

1. **Tách rõ partial quit load và authoritative reconciliation**
   - `loadQuitProfilesIfNeeded()` không còn return sớm chỉ vì `_state.quitLoaded`.
   - Nếu đã load một phần nhưng chưa `quitCompletenessReconciled`, hệ thống sẽ chạy full fallback/reconcile cho Admin.
   - `quitCompletenessReconciled` chỉ được set true khi full fallback thật sự thành công.

2. **Tạo quit-aware profile union source**
   - Khi tab hiện tại là `quit`, source dữ liệu sẽ merge theo thứ tự an toàn:
     - `studentProfileStore.getAllProfilesCompat()`
     - `window.allProfiles`
     - `window.__store.profiles`
     - `studentProfileStore.getQuitProfiles()` overlay cuối cùng để quit record thắng.

3. **SearchRuntime và StudentSearchIndex dùng union source cho Đã Nghỉ**
   - Search không còn phụ thuộc active-only map.
   - Võ sinh đã nghỉ vẫn có thể tìm được để khôi phục.

4. **Đồng bộ filter boundary cho tab Đã Nghỉ**
   - `studentsRenderer` PASS 1 và PASS 2 đều áp dụng cùng branch/search filter.
   - `renderStudents` direct authoritative rows cũng áp dụng cùng search/branch filter.
   - Tránh việc một lớp lọc khác một lớp render.

5. **Mở tab Đã Nghỉ sẽ kích hoạt authoritative loader**
   - `ensureStudentTabRendered('quit')` sẽ gọi `loadQuitProfilesIfNeeded('ensure-student-tab-rendered:...')` và refresh `students.quitList` sau khi load xong.

## Phạm vi không thay đổi

V5P không đổi công thức học phí, không đổi logic thu tiền, không đổi quyền HLV, không đổi SuperAdmin Rules, không bật lại Zalo, và không thêm Firestore listener mới.

## Files chỉnh chính

- `js/listeners/profiles.listeners.js`
- `public/js/listeners/profiles.listeners.js`
- `js/ui/render/listComputationRefresh.js`
- `public/js/ui/render/listComputationRefresh.js`
- `js/ui/render.js`
- `public/js/ui/render.js`
- `js/ui/render/computation/studentsRenderer.js`
- `public/js/ui/render/computation/studentsRenderer.js`
- `js/ui/render/renderStudents.js`
- `public/js/ui/render/renderStudents.js`
- `js/core/studentSearchIndex.js`
- `public/js/core/studentSearchIndex.js`
- `js/modules/searchRuntime.js`
- `public/js/modules/searchRuntime.js`
- `js/modules/students.js`
- `public/js/modules/students.js`
- `tools/check-v5p-quit-authoritative-data-boundary.mjs`
- `package.json`
- `public/package.json`

## Kiểm tra đã chạy

- `npm run check:v5p-quit-authoritative-data-boundary` — PASS 12/12
- `npm run check:syntax` — PASS
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:active-skipped-month-section` — PASS 11/11
- `npm run check:profile-canonical-store` — PASS 27/27
- `npm run check:search-runtime-v2` — PASS
- `npm run check:student-search-index` — PASS
- `npm run check:role-admin` — PASS
- `npm run check:role-coach` — PASS
- `npm run check:role-superadmin` — PASS
- `npm run check:deploy-safe` — PASS
- `npm run check:v5m-attendance-status-quit-sync` — PASS 19/19
- `npm run check:v5n-debt-zalo-feature-off` — PASS 16/16
- `npm run check:v5g-given-name-priority-search-unification` — PASS 15/15
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:tuition-debt-source-of-truth` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:superadmin-monthstats` — PASS 8/8
- `npm run check:v5k-superadmin-access-admin-provisioning-recovery` — PASS 16/16
- `npm run check:v5l-superadmin-revenue-cache-fallback` — PASS

## Lỗi phát hiện trong quá trình test và đã sửa

Một số test gate cũ chỉ nhận cache-bust V5O/V5N/V5M nên báo fail giả khi build đã lên V5P. Đã cập nhật gate để nhận V5P là build kế thừa hợp lệ. Đây là lỗi test assertion cũ, không phải lỗi nghiệp vụ.

## Deploy note

V5P chủ yếu sửa Hosting/source. Nếu production đã deploy Firestore Rules từ V5K/V5H/V5C thì không cần thay Rules riêng cho V5P.

Sau deploy cần hard refresh hoặc xóa cache site. Bundle mới phải hiện:

```text
quit-authoritative-data-boundary-20260704-v5p
```
