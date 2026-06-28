# Phase 4K-6V4D3 — Quit Mobile Authoritative Local Sync

## Mục tiêu
Khắc phục lỗi còn lại trên mobile: tab **Đã nghỉ** không hiện đầy đủ danh sách võ sinh đã chuyển/báo nghỉ tập.

## Nguyên nhân xác định
1. `syncStudentStatusLocal()` chỉ cập nhật `window.__store.profiles` khi chuyển võ sinh sang `status: 'quit'`, nhưng chưa đồng bộ ngay vào `studentProfileStore.quitProfiles`.
2. Sau đó active-only profiles listener có thể refresh lại cache đang tập. Vì võ sinh mới nghỉ không còn thuộc active query, bản ghi này có thể biến mất khỏi `allProfilesCompat` trên mobile trước khi lazy quit/full reconciliation hoàn tất.
3. Mobile `renderQuitIsland()` ưu tiên nguồn `studentProfileStore.quitProfiles`; nếu nguồn này chưa được bơm bản ghi mới nghỉ hoặc targeted quit query chỉ mới trả một phần, tab Đã nghỉ có thể hiển thị thiếu.
4. Mobile detection cũ chỉ dựa vào `max-width: 767px`, nên một số điện thoại/tablet hoặc landscape có CSS width lớn hơn 767px vẫn đi theo nhánh desktop/page-limit.
5. Cờ `quitCompletenessReconciled` được set trước khi full fallback thành công; nếu fallback lỗi/timeout, lần mở tab sau có thể không tự đối soát lại.

## Sửa đổi chính
- Đồng bộ `syncStudentStatusLocal()` sang `studentProfileStore.mergeProfile()` ngay khi đổi trạng thái.
- Tạo `_localQuitProfiles` journal trong `window.__store` để giữ các võ sinh vừa nghỉ, không bị active-only snapshot làm mất khỏi mobile cache.
- `renderQuitIsland()` và pagination helper của tab Đã nghỉ merge thêm `_localQuitProfiles` trước khi fallback sang compat/allProfiles.
- Nếu người dùng đang ở tab Đã nghỉ, hệ thống repaint danh sách ngay sau khi chuyển trạng thái nghỉ.
- Mở rộng nhận diện mobile/tablet: `max-width: 1024px`, `pointer: coarse`, UA mobile, hoặc `innerWidth <= 1024`.
- Thêm `ensureQuitProfilesAuthoritative()` để tab Đã nghỉ có thể kích hoạt lại full reconciliation có guard khi targeted quit cache chưa đủ.
- Chỉ set `quitCompletenessReconciled = true` sau khi `loadFullProfilesFallback()` thành công.
- Bump cache-bust: `quit-mobile-authoritative-local-sync-20260628-v4d3`.

## File đã chỉnh
- `js/modules/students.js`
- `js/ui/render/renderStudents.js`
- `js/listeners/profiles.listeners.js`
- `js/data/studentProfileStore.js`
- `js/main.js`
- `index.html`
- `public/*` mirror tương ứng
- `package.json`
- `tools/check-quit-mobile-authoritative-local-sync-v4d3.mjs`

## Kiểm tra đã chạy
- `npm run check:syntax` — PASS
- `npm run check:quit-mobile-authoritative-local-sync` — PASS 12/12
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:mobile-small-ui-recovery` — PASS 14/14
- `npm run check:v4d1a-runtime-recovery` — PASS 22/22
- `npm run check` đã chạy qua phần lớn pipeline; lần chạy tổng bị dừng do giới hạn thời gian tool ở cuối, không phải do lỗi test. Các test còn lại liên quan trực tiếp đã được chạy riêng và PASS.

## Ghi chú vận hành
Sau khi upload bản này lên hosting/GitHub Pages, mở điện thoại bằng tab ẩn danh hoặc xóa cache một lần nếu máy vẫn giữ bundle cũ.
