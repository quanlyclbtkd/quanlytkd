# Phase 4K-6V5L — SuperAdmin Revenue Cache Fallback Cleanup

## Vấn đề người dùng báo

Trong tài khoản SuperAdmin, khi mở tab doanh thu xuất hiện cảnh báo:

```text
[Phase 4K-FIX] Stats doc tồn tại cho CLB suntaekwondo_tkd nhưng không đọc được income — fallback sang tx scan
[Phase 4K-FIX] Stats doc tồn tại cho CLB test_tkd nhưng không đọc được income — fallback sang tx scan
```

## Nguyên nhân

Đây không phải lỗi quyền Firestore và không phải lỗi mất dữ liệu doanh thu. Nguyên nhân là `loadSARevenue()` trong `app.js` chỉ đọc một số field doanh thu rất hẹp trong stats doc:

- `income.total`
- `income.total` dạng flat key
- `totalIncome`
- `totalRevenue`
- `revenue`

Khi `clubs/{clubId}/stats/{YYYY_MM}` tồn tại nhưng là doc cache cũ/empty hoặc không có các field trên, code cũ hiểu là “không đọc được income” rồi cảnh báo và fallback sang scan `transactions`.

Hai vấn đề phụ:

1. Doanh thu `0` có thể là giá trị hợp lệ nhưng code cũ dùng pattern `Number(...) || ...`, dễ coi `0` là thiếu dữ liệu.
2. Code chưa ưu tiên root cache trong `clubs/{clubId}` dù hệ thống đã có `cachedMonthlyRevenue`, `revenueByMonth`, `superAdminStats`, `cachedCurrentMonthRevenue`.

## Sửa đổi chính

### 1. Thêm helper đọc doanh thu SuperAdmin an toàn

Trong `app.js` và `public/app.js` đã thêm:

- `_saFirstFiniteNumber()`
- `_saReadStatsIncomeTotal()`
- `_saReadStatsTxCount()`
- `_saReadMonthlyCachedValue()`
- `_saReadClubRevenueCache()`
- `_saRevenueDebugEnabled()`

### 2. Đổi thứ tự đọc doanh thu trong `loadSARevenue()`

Thứ tự mới:

1. Đọc root cache trong `clubs/{clubId}`.
2. Đọc stats doc `clubs/{clubId}/stats/{YYYY_MM}` nếu root cache chưa có.
3. Chỉ fallback scan transactions khi cache/stats thật sự thiếu hoặc legacy/empty.

### 3. Không còn cảnh báo production sai

Đã loại bỏ cảnh báo:

```text
Stats doc tồn tại cho CLB ... nhưng không đọc được income — fallback sang tx scan
```

Nếu cần debug nội bộ, có thể bật:

```js
window.__SA_REVENUE_DEBUG = true
```

hoặc:

```js
localStorage.setItem('saRevenueDebug', '1')
```

### 4. Ghi stats/cache tương thích hơn cho các lần sau

Trong `clubStatsAutoCache.js`, khi Admin CLB đồng bộ cache, hệ thống ghi thêm các alias doanh thu:

- `income.total`
- `totalIncome`
- `totalRevenue`
- `revenue`
- `revenueTotal`
- `incomeTotal`
- `monthlyIncome`
- `monthlyRevenue`
- `monthlyTxCount`

Điều này giúp SuperAdmin đọc được nhiều format stats/cache cũ và mới.

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5l-superadmin-revenue-cache-fallback` — PASS 18/18
- `npm run check:v5k-superadmin-access-admin-provisioning-recovery` — PASS 16/16
- `npm run check:superadmin-hotfix` — PASS 27/27
- `npm run check:superadmin-monthstats` — PASS 8/8
- `npm run check:superadmin-cache-stats-island-fallback` — PASS
- `npm run check:superadmin-safe-server-refresh` — PASS
- `npm run check:v5h-login-history-large-list-guard` — PASS 12/12
- `npm run check:v5i-attendance-render-window-slow-warning-guard` — PASS 16/16
- `npm run check:v5g-given-name-priority-search-unification` — PASS 15/15
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:superadmin-audit` — PASS
- `npm run check:github-pages-paths` — PASS 18/18
- `npm run check:deploy-package` — PASS 12/12

## Deploy

Bản V5L chủ yếu sửa source/runtime. Nếu đã deploy Firestore Rules từ V5K/V5H, chỉ cần deploy Hosting/source. Nếu production vẫn đang ở Rules cũ trước V5K, vẫn nên deploy Rules để giữ SuperAdmin/login_history ổn định.

Sau deploy cần hard refresh/xóa cache site để tải build:

```text
attendance-status-quit-sync-20260704-v5m
```
