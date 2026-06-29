# Phase 4K-6V4D4 — Quit Authoritative Full Sync

## Mục tiêu
Sửa dứt điểm lỗi tab **Đã nghỉ** không hiển thị đầy đủ danh sách võ sinh đã nghỉ/báo nghỉ trên cả web và mobile.

## Nguyên nhân gốc
1. `loadQuitProfilesIfNeeded()` đang coi kết quả query nhanh theo trạng thái là dữ liệu đã đủ bằng cách đặt `quitLoaded = true` quá sớm.
2. Khi `quitLoaded = true`, các lần mở tab sau có thể bỏ qua bước đối soát đầy đủ `ensureQuitProfilesAuthoritative()` dù `quitCompletenessReconciled` chưa hoàn tất.
3. Fallback full profiles dùng chung giới hạn `maxFallbackPerSession`, nên nếu hệ thống đã fallback vì lý do khác thì tab Đã nghỉ có thể không được chạy full reconciliation nữa.
4. Renderer của tab Đã nghỉ vẫn còn đường page-limit/load-more cũ, khiến desktop hoặc tablet có thể chỉ thấy một phần danh sách.
5. Bộ nhận diện trạng thái nghỉ chưa bao phủ đủ các giá trị legacy tiếng Việt như `bao_nghi`, `tam_nghi`, `tam_dung`, `dung_tap`.

## Cách sửa
- Tách rõ `quitTargetedLoaded` và `quitCompletenessReconciled`.
- Chỉ bỏ qua load khi `quitLoaded === true` **và** `quitCompletenessReconciled === true`.
- Thêm forced authoritative fallback riêng cho tab Đã nghỉ: `forceQuitAuthoritative`.
- Forced fallback có guard riêng `maxQuitAuthoritativeFallbackPerSession`, không bị chặn bởi fallback guard chung.
- Sau khi full fallback thành công mới đặt `quitCompletenessReconciled = true`.
- Render tab Đã nghỉ trực tiếp từ authoritative quit union sau khi loaded, không dùng cached/paginated rows.
- Bỏ giới hạn `_quitPage * 50` và load-more row cho tab Đã nghỉ trên cả web/mobile.
- Mở rộng alias trạng thái nghỉ/tạm nghỉ/dừng tập trong `profileStatusConfig.js`.
- Bump cache-bust sang `quit-authoritative-full-sync-20260629-v4d4`.
- Đồng bộ lại thư mục `public/` bằng `npm run build:public`.

## File chính đã chỉnh
- `js/listeners/profiles.listeners.js`
- `js/data/profileStatusConfig.js`
- `js/ui/render/renderStudents.js`
- `js/ui/render/computation/studentsRenderer.js`
- `js/modules/students.js`
- `app.js`
- `js/main.js`
- `index.html`
- `package.json`
- `tools/check-quit-authoritative-full-sync-v4d4.mjs`

## Kiểm tra đã chạy
- `npm run check` — PASS toàn bộ pipeline.
- Sau khi build public, chạy lại:
  - `npm run check:syntax` — PASS.
  - `npm run check:quit-authoritative-full-sync` — PASS 13/13.
  - `npm run check:quit-mobile-authoritative-local-sync` — PASS 12/12.
  - `npm run check:mobile-small-ui-recovery` — PASS 14/14.

## Ghi chú vận hành
Bản này có thể tăng số reads một lần khi Admin mở tab Đã nghỉ để chạy full authoritative reconciliation, nhưng chỉ khi cần xác minh đầy đủ. Sau khi `quitCompletenessReconciled` hoàn tất, hệ thống không chạy lại full fallback trong cùng phiên nếu không cần thiết.
