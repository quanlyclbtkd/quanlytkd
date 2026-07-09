# Phase 4K-6V5I — Attendance Render Window + Slow Warning Guard

## Lý do nâng cấp

Console production còn 2 cảnh báo:

1. `LargeListWarning list="attendance.list" renderedRows=581 > threshold=500`
2. `[renderScheduler] Slow render "students.quitList": 19.9ms`

Hai dòng này là cảnh báo hiệu năng, không phải lỗi dữ liệu. Tuy nhiên nếu xuất hiện thường xuyên sẽ làm người vận hành hiểu nhầm hệ thống lỗi và cho thấy DOM đang render hơi nặng.

## Phân tích nguyên nhân

### 1. attendance.list render 581 dòng thật

Trong `js/modules/attendance.js`, `renderAttendanceList()` lọc ra toàn bộ võ sinh phù hợp rồi `_renderAttCards()` render toàn bộ thẻ điểm danh trong một lần. Với Admin chọn tất cả cơ sở, số dòng có thể vượt 500.

Điều này không ảnh hưởng dữ liệu điểm danh, nhưng gây:

- DOM lớn;
- mobile/web yếu có thể chậm;
- console cảnh báo LargeListWarning.

### 2. students.quitList slow render 19.9ms

`renderScheduler` cảnh báo khi một render vượt 16ms. 19.9ms chỉ là vượt nhẹ một frame 60fps. Đây không phải lỗi dữ liệu, nhưng không nên spam console production.

## Đã sửa

### 1. Attendance render window

Thêm cơ chế render theo cửa sổ:

- Mặc định render 150 võ sinh đầu.
- Có nút `⬇️ Tải thêm võ sinh` để mở thêm 150 dòng/lần.
- Summary điểm danh vẫn tính theo toàn bộ danh sách đã lọc, không chỉ 150 dòng đang hiển thị.
- Toggle điểm danh vẫn dùng index gốc trong `_attCurrentProfiles`, không phá logic lưu Firestore.
- Khi đổi ngày/cơ sở/đai/ca/show all, render window reset về 150 để tránh DOM phình lại.

Files chính:

- `js/modules/attendance.js`
- `public/js/modules/attendance.js`

### 2. Attendance LargeListWarning không spam console

`trackLargeListRender('attendance.list')` giờ truyền:

- `renderedRows`: số dòng đang render thực tế;
- `totalRows`: tổng võ sinh phù hợp filter;
- `suppressWarning: true` cho attendance list vì đây là danh sách có window/load-more chủ động.

Metrics vẫn còn để debug, nhưng không còn console warning gây hiểu nhầm.

Files chính:

- `js/ui/render/renderInvalidation.js`
- `public/js/ui/render/renderInvalidation.js`

### 3. Slow render production guard

`renderScheduler` vẫn ghi metrics chậm để debug, nhưng không `console.warn` ở production trừ khi bật debug:

- localhost/replit dev;
- `window.__RENDER_DEBUG = true`;
- `localStorage.setItem('renderDebug','1')`.

Cảnh báo cùng key cũng được coalesce 2 phút/lần.

Files chính:

- `js/ui/render/renderScheduler.js`
- `public/js/ui/render/renderScheduler.js`

### 4. Cache bust V5I

Build marker mới:

`debt-zalo-feature-off-20260704-v5n`

APP patch version:

`4K-6V5K-superadmin-access-admin-provisioning-recovery-20260704`

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5i-attendance-render-window-slow-warning-guard` — PASS 16/16
- `npm run check:v5h-login-history-large-list-guard` — PASS 12/12
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:attendance-shift-filter` — PASS 10/10
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:render-warning-coalescing` — PASS 14/14
- `npm run check:v5g-given-name-priority-search-unification` — PASS 15/15
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:superadmin-monthstats` — PASS 8/8
- `npm run check:global-ownership-adoption-cleanup` — PASS 105 assertions

`npm run check` đầy đủ đã được thử nhưng pipeline rất dài và bị timeout trong môi trường tool sau khi đã chạy qua nhiều nhóm PASS. Các nhóm liên quan trực tiếp đến cảnh báo console, Điểm danh, HLV, Báo nợ, Search, SuperAdmin và ownership đã chạy riêng và đều PASS.

## Ghi chú deploy

V5I chủ yếu sửa source/runtime. Firestore Rules không thay đổi so với V5H/V5C. Nếu production đã deploy Rules V5H/V5C, chỉ cần deploy Hosting/source. Sau deploy cần hard refresh hoặc xóa cache site để tải build mới.
