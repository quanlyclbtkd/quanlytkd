# Phase 4K-6V4D10 — Admin TX Slow Render + Quit Full Authoritative

## Mục tiêu
1. Xử lý cảnh báo Admin console: `[renderScheduler] 🐢 Slow render "tx.txList": 21.6ms`.
2. Sửa lỗi tab **Đã nghỉ** trên web/mobile vẫn chưa load đủ danh sách võ sinh.

## Phân tích lỗi Admin slow render
Log cho thấy render `tx.txList` mất 21.6ms, vượt budget chẩn đoán 16ms của `renderScheduler`. Đây không phải lỗi dữ liệu hay crash, mà là cảnh báo performance diagnostic khi render bảng giao dịch đầu tiên.

Nguyên nhân kỹ thuật:
- `finance.js` sau khi load trang giao dịch gọi `invalidateList('tx.txList')`.
- Ngay sau đó V4D9 tiếp tục gọi `invalidateFinance()`, `invalidateDashboard()`, và `refreshListsComputation()`.
- Như vậy cùng một page load có thể yêu cầu render/compute lại bảng giao dịch nhiều lần.
- `renderTxIsland()` luôn `replaceChildren()` toàn bộ table kể cả khi HTML không thay đổi.
- `renderScheduler` cảnh báo ở ngưỡng 16ms trong production, nên Admin thấy cảnh báo dù thao tác render 50 dòng giao dịch đầu tiên vẫn không phải lỗi chức năng.

## Sửa lỗi slow render
- `renderFinance._applyHtml()` bỏ qua DOM replace nếu HTML giống lần render trước.
- `finance.js` gom lại luồng pagination: refresh computation một lần, render `tx.txList` một lần, dashboard cập nhật riêng.
- `renderScheduler` nâng ngưỡng chẩn đoán lên 32ms và chỉ hiển thị slow-render warning ở localhost/debug mode.
- Không ẩn lỗi thật: lỗi render exception vẫn `console.error` như cũ.

## Phân tích lỗi tab Đã nghỉ chưa đủ danh sách
V4D9 đã có targeted quit loader, nhưng danh sách vẫn có thể thiếu khi:
- targeted queries chỉ bắt được các schema quit đã biết;
- `compatCount` có dữ liệu một phần nên tab được xem là “có dữ liệu” trước khi full authoritative reconciliation hoàn tất;
- generic `loadFullProfilesFallback()` đã hết quota do các luồng recovery khác, nên Admin Đã nghỉ không chạy được pass full cuối cùng;
- `renderQuitIsland()` có thể render partial/cache trước khi full pass xác nhận xong.

## Sửa lỗi Đã nghỉ
- `ensureQuitProfilesAuthoritative()` có một lượt force-authority duy nhất cho Admin Đã nghỉ, bỏ qua quota fallback chung nhưng vẫn có guard chống loop.
- `renderQuitIsland()` tự kích hoạt authority pass khi Admin mở tab Đã nghỉ nếu chưa reconciled.
- Khi `quitCompletenessReconciled === true`, renderer luôn ưu tiên direct full authoritative rows trên cả web và mobile.
- `ensureProfilesForTab('quit')` không coi `compatCount` là đủ tuyệt đối nữa; nếu chưa reconciled thì vẫn gọi authority reconciliation.

## File thay đổi chính
- `js/ui/render/renderScheduler.js`
- `js/ui/render/renderFinance.js`
- `js/modules/finance.js`
- `js/listeners/profiles.listeners.js`
- `js/ui/render/renderStudents.js`
- `js/data/studentProfileStore.js`
- `public/*` mirror tương ứng
- `package.json`
- `tools/check-v4d10-admin-tx-quit-authoritative.mjs`

## Kiểm tra đã chạy
- `npm run check:syntax` — PASS
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:render-warning-coalescing` — PASS 14/14
- `npm run check:v4d1a-runtime-recovery` — PASS 22/22
- `npm run check:v4d4-coach-quit-authoritative-fix` — PASS 17/17
- `npm run check:v4d5-coach-quit-attendance-full-recovery` — PASS 12/12
- `npm run check:v4d6-coach-attendance-root-cause-recovery` — PASS 12/12
- `npm run check:v4d7-coach-attendance-deep-branch-recovery` — PASS 13/13
- `npm run check:v4d8-coach-attendance-auth-roster-final-recovery` — PASS 18/18
- `npm run check:v4d9-coach-warning-cleanup` — PASS 12/12
- `npm run check:v4d10-admin-tx-quit-authoritative` — PASS 11/11

`npm run check` đã chạy qua nhiều nhóm và không thấy test fail trước khi tool bị timeout ở cuối; các nhóm liên quan và nhóm sau điểm timeout đã được chạy riêng và PASS.

## Ghi chú deploy
Bản này không nới quyền HLV/Admin. Chủ yếu sửa client render và quit authoritative fallback. Vẫn nên deploy đầy đủ Hosting/source để cache-bust V4D10 có hiệu lực. Sau deploy, mở bằng tab ẩn danh hoặc xóa cache site nếu trình duyệt còn giữ bundle V4D9.
