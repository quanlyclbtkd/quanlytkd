# Phase 4K-6V4D6 — Quit Mobile Full Sync + Coach Login/Attendance Repair

## Mục tiêu

Sửa chính xác hai lỗi còn lặp lại sau nhiều bản vá:

1. Tab **Đã nghỉ** trên mobile không truy cập/hiển thị đầy đủ danh sách võ sinh đã nghỉ/báo nghỉ/tạm nghỉ.
2. Tài khoản **HLV điểm danh** không đăng nhập được; nếu đăng nhập được thì phải truy cập đúng danh sách điểm danh võ sinh tại cơ sở được phân công.

## Nguyên nhân xác định

### 1. Tab Đã nghỉ vẫn thiếu dữ liệu

Các bản trước vẫn còn race-condition giữa hai nguồn dữ liệu:

- **Targeted quit query**: query nhanh theo vài trạng thái, có thể chỉ trả một phần danh sách.
- **Authoritative full sync**: đối soát toàn bộ hồ sơ để xác định đầy đủ học viên đã nghỉ.

Khi mobile/web đổi tab nhanh hoặc render chậm, targeted query có thể hoàn thành trước và ghi vào cache `quitProfiles`. UI thấy `quitLoaded` nên hiển thị danh sách tạm như danh sách cuối. Đây là lý do nhiều lần sửa render mobile vẫn chưa hết lỗi.

### 2. HLV không đăng nhập / không thấy điểm danh

Luồng đăng nhập HLV phụ thuộc vào mirror phân quyền `users/{uid}`. Một số tài khoản HLV cũ có hồ sơ trong `clubs/{clubId}/coaches/{uid}` nhưng thiếu hoặc sai:

- `users/{uid}`
- `branch`
- `coachBranch`

Khi thiếu mirror, hệ thống fail-closed đúng về bảo mật nhưng làm HLV không đăng nhập được hoặc đăng nhập xong không hydrate danh sách điểm danh theo cơ sở.

## Sửa đổi chính

### A. Tab Đã nghỉ

- Thêm single-flight authoritative sync: `quitAuthoritativePromise`.
- `loadQuitProfilesIfNeeded()` của Admin ưu tiên chạy `ensureQuitProfilesAuthoritative()` trước.
- Targeted query chỉ còn là preview, không được ghi đè khi full sync đã xong hoặc đang chạy.
- `renderQuitIsland()` không hiển thị danh sách tạm như dữ liệu cuối; nếu chưa đủ sẽ hiện trạng thái đang tải đầy đủ.
- Chỉ coi danh sách Đã nghỉ hoàn tất khi `quitCompletenessReconciled === true`.
- Bỏ page-limit/load-more cho tab Đã nghỉ trên web và mobile.
- Mở rộng nhận diện trạng thái nghỉ: `Đã nghỉ`, `Nghỉ tập`, `Báo nghỉ`, `Tạm nghỉ`, `Tạm dừng`, `Dừng tập`, `bao_nghi`, `tam_nghi`, `tam_dung`, `dung_tap`.
- Khi chuyển võ sinh sang nghỉ, local store và `_localQuitProfiles` được đồng bộ ngay để không bị active listener làm mất khỏi cache.

### B. HLV đăng nhập và điểm danh

- Thêm `coach_login_index/{uid}` làm chỉ mục khôi phục đăng nhập Coach an toàn.
- Auth context fallback đọc `coach_login_index/{uid}` nếu `users/{uid}` thiếu/stale.
- Tạo HLV mới ghi đồng thời:
  - `clubs/{clubId}/coaches/{uid}`
  - `users/{uid}`
  - `coach_login_index/{uid}`
- Đồng bộ/sửa tài khoản HLV cũ refresh cả `users/{uid}` và `coach_login_index/{uid}`.
- Runtime branch repair luôn refresh hai mirror phân quyền từ assignment chuẩn của Admin.
- `firestore.rules` cho phép HLV tự đọc index của chính mình và tự sửa mirror an toàn khi khớp assignment Coach do Admin quản lý.
- Attendance list dùng profile union đầy đủ từ `studentProfileStore`, `window.allProfiles`, và `window.__store.profiles` trước khi lọc theo branch HLV.
- Nếu HLV vào điểm danh mà danh sách rỗng, hệ thống ghi debug trạng thái branch/source count để truy nguyên cấu hình cơ sở.

## File chính đã chỉnh

- `index.html`
- `app.js`
- `firestore.rules`
- `package.json`
- `js/main.js`
- `js/listeners/profiles.listeners.js`
- `js/data/studentProfileStore.js`
- `js/data/profileStatusConfig.js`
- `js/ui/render/renderStudents.js`
- `js/ui/render/computation/studentsRenderer.js`
- `js/modules/students.js`
- `js/modules/attendance.js`
- `js/core/coachBranchRuntimeRepair.js`
- `tools/check-v4d6-quit-coach-attendance.mjs`

## Cache bust

Build marker mới:

`coach-attendance-fallback-stability-20260630-v4d7`

Đã build lại thư mục `public/` bằng `npm run build:public`.

## Kiểm tra đã chạy

- `npm run build:public` — PASS
- `npm run check:syntax` — PASS
- `npm run check:v4d6-quit-coach-attendance` — PASS 16/16
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:render-warning-coalescing` — PASS 14/14
- `npm run check:tuition-debt-source-of-truth` — PASS
- `npm run check:active-skipped-month-section` — PASS 11/11
- `npm run check:profile-canonical-store` — PASS 27/27
- `npm run check:v4d1a-runtime-recovery` — PASS 22/22
- Full `npm run check` — PASS, STATUS: 0

## Lưu ý triển khai bắt buộc

Để sửa lỗi HLV đăng nhập trên Firebase thật, cần deploy cả code web và `firestore.rules`:

1. Upload bản V4D6 lên hosting/GitHub.
2. Deploy `firestore.rules` đi kèm.
3. Đăng nhập Admin/SuperAdmin và chạy đồng bộ/sửa tài khoản HLV cũ một lần.
4. Cho HLV đăng xuất, mở bằng tab ẩn danh hoặc xóa cache rồi đăng nhập lại.

Nếu chỉ upload web mà chưa deploy Rules, HLV vẫn có thể bị `permission-denied` khi tự khôi phục mirror đăng nhập.
