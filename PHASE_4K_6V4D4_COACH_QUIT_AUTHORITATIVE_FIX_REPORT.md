# Phase 4K-6V4D4 — Coach Login + Đã nghỉ Authoritative Fix

## Mục tiêu
Sửa dứt điểm 2 lỗi còn tồn tại:

1. Web/mobile tab `Đã nghỉ` không truy cập/hiển thị đầy đủ danh sách võ sinh đã nghỉ hoặc đã báo nghỉ tập.
2. Tài khoản HLV dùng để điểm danh không đăng nhập được, hoặc đăng nhập xong không tải được danh sách võ sinh của cơ sở được phân công.

## Phân tích nguyên nhân trước khi sửa

### Lỗi 1 — Tab Đã nghỉ thiếu danh sách trên web/mobile

Có 4 luồng gây thiếu danh sách:

1. `renderQuitIsland()` có thể dùng cache tính toán cũ hoặc page-limit thay vì danh sách nghỉ authoritative. Khi targeted quit query mới trả một phần, web/mobile vẫn có thể hiển thị thiếu.
2. `quitCompletenessReconciled` bị đánh dấu hoàn tất trước khi `loadFullProfilesFallback()` thật sự thành công. Nếu fallback đang lỗi/đang chạy, lần mở tab sau có thể không đối soát lại.
3. Khi chuyển võ sinh sang `status: quit`, `syncStudentStatusLocal()` chỉ cập nhật `window.__store.profiles`, chưa đồng bộ ngay vào `studentProfileStore.quitProfiles`. Sau active-only listener refresh, võ sinh mới nghỉ có thể rơi khỏi cache hiển thị.
4. Mobile detection cũ chỉ dùng `max-width: 767px`, nên điện thoại/tablet hoặc chế độ ngang có thể đi nhầm nhánh desktop/page-limit.

### Lỗi 2 — HLV không đăng nhập được / không thấy danh sách điểm danh

Có 4 luồng lỗi chính:

1. Luồng đăng nhập HLV phụ thuộc cả `users/{uid}` và `clubs/{clubId}/coaches/{uid}`. Nhiều tài khoản cũ có `users/{uid}` bị thiếu `clubId`, thiếu `branch/coachBranch`, hoặc role cũ `hlv`. Khi đó Rules từ chối đọc profiles/attendance dù hồ sơ coach assignment trong CLB đúng.
2. `safeSelfCoachMirrorUpdate()` trong Rules cũ quá chặt: chỉ cho self-repair nếu `users/{uid}` đã đúng role/club trước đó. Vì vậy tài khoản legacy không thể tự sửa mirror khi login.
3. Branch identity chỉ nhận `CS1`/`Mặc định`. Nếu dữ liệu profiles/attendance lưu theo tên cơ sở cấu hình như `branchName2`, HLV được phân công `CS2` có thể đăng nhập nhưng query/rules không match dữ liệu.
4. Module attendance đọc profile từ nguồn hẹp `__store.profiles/allProfiles`, trong khi dữ liệu đã được tối ưu sang `studentProfileStore`. Vì vậy HLV có thể login nhưng danh sách điểm danh trống.

## Sửa đổi đã thực hiện

### Đã nghỉ

- `renderQuitIsland()` luôn có đường render authoritative full list cho tab Đã nghỉ, không dựa vào cache/page-limit khi dữ liệu full hơn đã có.
- `studentProfileStore.getAllProfilesCompat()` và `_localQuitProfiles` được merge vào nguồn render Đã nghỉ.
- `syncStudentStatusLocal()` đồng bộ ngay status mới vào `studentProfileStore.mergeProfile()`.
- Thêm `_localQuitProfiles` để giữ các võ sinh vừa nghỉ, tránh active-only listener làm mất khỏi cache.
- Chỉ set `quitCompletenessReconciled = true` sau khi full fallback thành công.
- Thêm `ensureQuitProfilesAuthoritative()` để Admin/web/mobile có thể kích hoạt lại đối soát full khi targeted quit cache chưa đủ.
- Mobile/tablet detection mở rộng tới `1024px`, `pointer: coarse`, và user agent mobile.

### HLV đăng nhập và điểm danh

- `CoachBranchRuntimeRepair.resolveAuthContext()` tự sửa `users/{uid}` mirror từ assignment chính xác trong `clubs/{clubId}/coaches/{uid}` khi HLV login.
- Nếu self-repair bị Rules chặn, hệ thống báo lỗi rõ `auth/coach-branch-mirror-sync-failed` thay vì đăng nhập nửa vời rồi mất quyền đọc.
- Rules cho phép HLV tự sửa đúng mirror của chính mình **chỉ khi** dữ liệu request khớp chính xác assignment do Admin tạo trong `clubs/{clubId}/coaches/{uid}`.
- Rules vẫn chặn tự chọn tùy ý role/club/branch vì bắt buộc qua `selfCoachMirrorMatches()`.
- `BranchIdentity.aliases()` bổ sung tên cơ sở cấu hình `branchName1..branchName10`.
- Coach active listener đọc thêm các branch aliases bằng query equality riêng, tránh dùng `where in` chồng lên status query.
- Rules bổ sung `branchNameMatchesAssigned()` để HLV đọc được dữ liệu branch đang lưu bằng tên cơ sở cấu hình.
- `attendance.js` merge profile từ `studentProfileStore.getAllProfilesCompat()` để danh sách điểm danh có dữ liệu đúng cơ sở.
- Admin create/migrate HLV ghi đủ `branch` và `coachBranch` vào cả coach doc và user mirror.

## File chính đã sửa

- `index.html`
- `app.js`
- `firestore.rules`
- `package.json`
- `js/main.js`
- `js/core/branchIdentity.js`
- `js/core/coachBranchRuntimeRepair.js`
- `js/listeners/profiles.listeners.js`
- `js/data/studentProfileStore.js`
- `js/ui/render/renderStudents.js`
- `js/modules/students.js`
- `js/modules/attendance.js`
- `tools/check-v4d4-coach-quit-authoritative-fix.mjs`
- Cập nhật các regression checks cũ để chấp nhận runtime cache-bust mới.
- Đồng bộ `public/*` mirror tương ứng.

## Cache-bust runtime

`coach-quit-attendance-full-recovery-20260630-v4d5`

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:v4d4-coach-quit-authoritative-fix` — PASS 17/17
- `npm run check` — PASS toàn bộ pipeline hiện có.

## Ghi chú triển khai rất quan trọng

Bản này có sửa `firestore.rules`. Để lỗi HLV đăng nhập được xử lý đúng, cần deploy cả Hosting/source **và Firestore Rules**. Nếu chỉ upload file web mà không deploy rules, HLV legacy vẫn có thể bị chặn self-repair `users/{uid}`.

Sau deploy, nên xóa cache/truy cập tab ẩn danh trên mobile một lần để chắc chắn trình duyệt không giữ bundle cũ.
