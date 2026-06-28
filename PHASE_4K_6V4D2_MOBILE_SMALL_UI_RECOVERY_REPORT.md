# Phase 4K-6V4D2 — Mobile Small UI Recovery

## Mục tiêu
Khắc phục 3 lỗi chỉ còn xuất hiện trên mobile sau các lần cập nhật trước:

1. `🎂 SINH NHẬT HÔM NAY` không hiện trên mobile.
2. Tab `Đang tập` không hiện khối `⏸ Báo nghỉ tháng` trên mobile.
3. Tab `Đã nghỉ` không hiện đủ danh sách võ sinh đã báo nghỉ/nghỉ tập trên mobile.

## Nguyên nhân chính

### 1. Mobile dùng luồng render island/list, không luôn đi qua `renderApp()`
Các khối nhỏ như banner sinh nhật và `skippedSection` nằm ngoài bảng danh sách. Trên desktop, full render thường gọi lại các khối này; trên mobile, khi đổi tab hoặc refresh danh sách, hệ thống thường chỉ render `students.activeList` / `students.quitList`. Vì vậy bảng có thể cập nhật nhưng các khối nhỏ bên ngoài bảng vẫn không được gọi lại.

### 2. Nguồn profile trên mobile có thể là snapshot cục bộ/thiếu
Một số helper vẫn ưu tiên `(window.__store || {}).profiles`, trong khi trên mobile hoặc sau tối ưu reads, nguồn này có thể chưa chứa đầy đủ profile cần thiết. Banner sinh nhật, `Báo nghỉ tháng`, và danh sách `Đã nghỉ` cần hợp nhất dữ liệu đang có trong `studentProfileStore`, `window.allProfiles`, và `window.__store.profiles`.

### 3. Cache-bust chưa bao phủ đủ module mobile liên quan
Một số import vẫn dùng version cũ, đặc biệt module attendance. Điện thoại dễ giữ bundle cũ hơn desktop, dẫn tới web desktop đã hiện đúng nhưng mobile vẫn chạy mã cũ.

## Hướng xử lý

- Thêm helper `window.refreshSmallStudentUi()` trong `js/ui/render.js` để các island renderer có thể refresh banner sinh nhật, khối báo nghỉ tháng, và danh sách đã nghỉ khi cần.
- Bổ sung `skipQuitList` để tránh vòng lặp đệ quy khi `renderQuitIsland()` tự gọi refresh small UI.
- Sau khi render `activeList`, `debtList`, `quitList`, gọi refresh small UI an toàn.
- Đổi các bridge đọc profile sang merge bộ nhớ: `studentProfileStore.getAllProfilesCompat()` + `window.allProfiles` + `window.__store.profiles`.
- `renderQuitIsland()` tiếp tục ưu tiên full authoritative quit profiles trên mobile và bổ sung nguồn compat store.
- Đồng bộ các file public mirror.
- Bump cache-bust sang `mobile-small-ui-recovery-20260628-v4d2` cho entrypoint và các module liên quan để mobile tải đúng mã mới.
- Thêm regression gate `check:mobile-small-ui-recovery` và đưa vào `npm run check`.

## File chính đã sửa

- `index.html`
- `app.js`
- `package.json`
- `js/main.js`
- `public/js/main.js`
- `js/ui/render.js`
- `public/js/ui/render.js`
- `js/ui/render/renderStudents.js`
- `public/js/ui/render/renderStudents.js`
- `js/ui/render/listComputationRefresh.js`
- `public/js/ui/render/listComputationRefresh.js`
- `js/ui/render/renderInvalidation.js`
- `public/js/ui/render/renderInvalidation.js`
- `js/modules/attendance.js`
- `public/js/modules/attendance.js`
- `tools/check-mobile-small-ui-recovery-v4d2.mjs`
- Cập nhật một số regression gates cũ để chấp nhận cache-bust runtime mới V4D2.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:mobile-small-ui-recovery` — PASS 14/14
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check` — PASS toàn bộ pipeline hiện có, bao gồm mobile recovery gate mới.

## Ghi chú triển khai

Sau khi upload bản này lên GitHub/hosting, nên mở mobile bằng tab ẩn danh hoặc xóa cache/PWA cache một lần nếu thiết bị vẫn giữ mã cũ. Bản này đã đổi query string của `app.js`, `main.js` và các module liên quan nên trình duyệt sẽ tự tải lại trong đa số trường hợp.
