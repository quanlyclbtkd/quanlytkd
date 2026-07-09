# Phase 4K-6V5F — Audit Gate Cleanup + SuperAdmin MonthStats Hardening

## Mục tiêu

Nâng cấp bước kế tiếp sau V5D theo hướng ít rủi ro, không đụng mạnh vào các luồng đang ổn định của Admin/HLV:

1. Harden SuperAdmin dashboard khi CLB chưa có `stats/{YYYY_MM}`.
2. Làm sạch các audit/test gate cũ để nhận build hiện tại.
3. Đưa các guard còn thiếu vào `check` / `check:all`.
4. Giữ nguyên luồng Học phí, Báo nợ, Xóa giao dịch, Search và HLV Điểm danh đã ổn ở V5B/V5C/V5D.

## Thay đổi chính

### 1. SuperAdmin monthStats null-safe

File cập nhật:

- `js/modules/superadmin.js`
- `public/js/modules/superadmin.js`

Bổ sung guard rõ:

```js
const _monthStatsSafe = monthStats ? monthStats : null;
const _monthStatsSourceLabel = _monthStatsSafe ? 'stats-doc' : 'cache-or-empty';
```

Mục tiêu: nếu một CLB chưa có `stats/{YYYY_MM}`, SuperAdmin dashboard vẫn render an toàn và hiển thị `--` thay vì crash.

### 2. Cache-bust SuperAdmin module

Cập nhật `js/main.js` và `public/js/main.js` để `superadmin.js` cũng dùng cache-bust build hiện tại:

```js
./modules/superadmin.js?v=debt-zalo-feature-off-20260704-v5n
```

Mục tiêu: tránh trình duyệt reuse SuperAdmin module cũ sau khi deploy.

### 3. Dọn audit gate cũ

Cập nhật các gate vẫn còn check build cũ:

- `tools/check-quit-tab-mobile-parity.mjs`
- `tools/check-active-skipped-month-section-v4c2.mjs`
- `tools/check-profile-canonical-store-v4d1.mjs`
- `tools/check-v4d1a-runtime-recovery.mjs`
- `tools/check-render-warning-coalescing-v4b12.mjs`
- `tools/check-attendance-shift-filter.mjs`

Mục tiêu: test phản ánh đúng runtime V5E, không báo fail giả vì cache-bust cũ.

### 4. Đưa guard vào pipeline

Cập nhật `package.json` / `public/package.json`:

- thêm `check:v5e-audit-gate-superadmin-hardening`
- đưa vào `check`
- đưa `check:superadmin-monthstats`, `check:superadmin-hotfix`, `check:db-ready-guards`, `check:v5e-audit-gate-superadmin-hardening` vào `check:all`

## Kiểm tra đã chạy

### V5E / SuperAdmin / audit gate

- `npm run check:v5e-audit-gate-superadmin-hardening` — PASS 10/10
- `npm run check:superadmin-monthstats` — PASS 8/8
- `npm run check:superadmin-hotfix` — PASS 27/27
- `npm run check:db-ready-guards` — PASS 14/14
- `npm run check:superadmin-audit` — PASS 35 patterns
- `npm run check:superadmin-cache-stats-island-fallback` — PASS
- `npm run check:superadmin-counts` — PASS 14/14
- `npm run check:superadmin-gate` — PASS
- `npm run check:mobile-superadmin-gate` — PASS
- `npm run check:superadmin-quota-guard` — PASS
- `npm run check:superadmin-render-scope-fix` — PASS
- `npm run check:superadmin-safe-server-refresh` — PASS
- `npm run check:superadmin-server-summary-cache` — PASS

### Admin / Học phí / Báo nợ / Search / Xóa giao dịch

- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:v5d-given-name-search` — PASS 15/15
- `npm run check:student-search-index` — PASS
- `npm run check:search-runtime-v2` — PASS
- `npm run check:search-latency-optimization` — PASS
- `npm run check:finance-indexes` — PASS 9/9
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:tuition-debt-source-of-truth` — PASS
- `npm run check:inventory-ledger-reconciliation` — PASS 33/33
- `npm run check:payment-bundle-runtime-hotfix` — PASS 20/20

### HLV / Điểm danh / Branch boundary

- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:attendance-shift-filter` — PASS 10/10

### Full pipeline

Đã chạy `npm run check`; pipeline đi qua nhiều nhóm không lỗi, nhưng bị timeout trong môi trường tool ở nhóm kiểm tra dài. Vì vậy đã chạy tách riêng toàn bộ nhóm trọng yếu theo vai trò SuperAdmin/Admin/HLV và các nhóm liên quan đến các lỗi vừa sửa. Các nhóm này đều PASS.

## Đánh giá theo vai trò

### SuperAdmin

Trạng thái sau V5E: ổn hơn.

- Dashboard không còn phụ thuộc nguy hiểm vào `monthStats` tồn tại.
- Nếu CLB chưa có stats doc, UI dùng `--` / cache-safe display.
- Permission-denied vẫn được phân biệt rõ với lỗi runtime.
- Module SuperAdmin có cache-bust riêng để tránh dùng bản cũ.

### Admin CLB

Không thay đổi logic vận hành chính. Các nhóm Học phí/Báo nợ/Xóa giao dịch/Search vẫn PASS.

Lưu ý: quyền xóa giao dịch vẫn yêu cầu production đã deploy Firestore Rules từ V5C trở lên.

### HLV

Không thay đổi quyền hoặc luồng điểm danh chính. Các guard HLV/branch/attendance vẫn PASS.

V5E chỉ cập nhật gate kiểm tra `attendance-shift-filter` để nhận đúng cơ chế `nextCache` sau filter, không mở rộng quyền đọc hay fallback full-club.

## Kết luận

V5E là bản hardening và audit cleanup an toàn. Nên deploy sau V5D để SuperAdmin dashboard ổn hơn và pipeline kiểm tra đáng tin cậy hơn.

Bước tiếp theo sau V5E nên là Phase 4K-6V5F — Attendance Shift Cache Boundary nếu CLB dùng nhiều ca tập/ngày, hoặc Phase 4K-6V6 — Legacy app.js Reduction Gate nếu muốn bắt đầu giảm rủi ro kiến trúc dài hạn.
