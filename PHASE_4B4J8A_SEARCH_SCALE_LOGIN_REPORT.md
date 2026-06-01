# Phase 4.0B-4J-8A Search Scale Login Report

## Tổng quan

Phase nâng cấp tìm kiếm server-side, dọn unsafe limit(500), và tối ưu login performance.

---

## Added

* **normalizeSearchText**: Chuẩn hoá text bỏ dấu + lowercase cho search index — `js/utils/helpers.js`
* **normalizePhone**: Chỉ giữ chữ số để so sánh SĐT — `js/utils/helpers.js`
* **buildStudentSearchIndex**: Xây dựng `{ searchName, searchPhone, searchCode, searchKeywords }` từ profile data — `js/utils/helpers.js`
* **searchName/searchPhone/searchCode** tự động ghi khi add/edit student — `js/modules/students.js`
* **searchProfilesServerSide()**: Server-side search theo searchName / searchPhone / searchCode — `js/services/students.service.js`
* **backfill search index (dry-run mặc định)**: `tools/backfill-student-search-index.mjs`
* **fetchAllQueryPages()**: Generic paginated fetch helper cho export/recalc — `js/firebase/paginatedQuery.js`
* **Login performance metrics**: `window.__loginPerfMetrics`, `markLoginPerf()`, `measureLoginPerf()`, `window.printLoginPerformance()` — `app.js`
* **Loading progress message**: "Đang tải dữ liệu CLB…" hiện ngay sau login overlay ẩn — `app.js`
* **check-login-performance.mjs**: Kiểm tra source tĩnh login perf infrastructure — `tools/check-login-performance.mjs`

---

## Search Behavior

| Feature | Trước | Sau Phase 4J-8A |
|---|---|---|
| Search current page only | ✅ (bị giới hạn trang) | ❌ không còn — server-side toàn CLB |
| Server-side search | ❌ chỉ doc ID prefix | ✅ searchName / searchPhone / searchCode |
| Accent-insensitive search | ❌ gõ "nguyen" không ra "Nguyễn" | ✅ sau khi có search index |
| Phone search | ❌ không có | ✅ query theo searchPhone prefix |
| Code search | ❌ không có | ✅ query theo searchCode |
| Search without loading all profiles | ❌ có thể đọc toàn bộ | ✅ không bao giờ load toàn bộ |

### Điều kiện để tìm kiếm nâng cao hoạt động

1. **Profile mới/sửa** → tự động có searchName/searchPhone/searchCode.
2. **Profile cũ** → cần chạy backfill tool (dry-run mặc định, không auto-migrate).
3. **Firestore Indexes** → cần tạo composite index cho `searchName`, `searchPhone`, `searchCode` (ASC).
   - Nếu chưa có index, hệ thống fallback về document ID prefix search + hiển thị warning.

---

## Unsafe limit(500) Cleanup

| Luồng | Trước | Sau |
|---|---|---|
| Batch delete transactions cũ (`saDeleteTransactions`) | `limit(500)` — bỏ sót nếu >500 tx | ✅ Cursor pagination, xóa tất cả |
| Parent-club profile scan (`_lookupStudentInParentClub`) | `limit(500)` — bỏ sót nếu CLB >500 | ✅ Server-side searchName query + paginated fallback 3000 |
| Rename tx scan (`app.js` legacy) | `limit(500)` — bỏ sót nếu võ sinh >500 tx | ✅ Cursor pagination |
| Rename tx scan (`StudentService.findTransactionsByStudent`) | `limit(500)` | ✅ Cursor pagination |
| paidUntil recalc sau deleteTx | `limit(500)` — tính sai nếu võ sinh >500 tx | ✅ Cursor pagination |
| Attendance by date | `limit(500)` — CLB 1000+ võ sinh | ✅ Dùng `attendanceDailyLimit` (1200) |
| login_history display | `limit(500)` — chỉ hiển thị | ✅ Giữ nguyên (OK_UI_DISPLAY_LIMIT) |
| Inventory listener | `limit(500)` — chỉ hiển thị recent | ✅ Giữ nguyên (OK_UI_DISPLAY_LIMIT, debt calc độc lập) |

---

## Login Performance

* **UI shell xuất hiện sớm**: `loginOverlay` ẩn + `mainApp` hiện → mark `first-ui-shell-visible` ngay lập tức.
* **Loading message**: "Đang tải dữ liệu CLB…" hiện ngay sau UI shell visible — tránh cảm giác app đơ.
* **Login marks đo được**:
  - `login-submit` → thời điểm bấm đăng nhập
  - `firebase-auth-success` → Firebase xác thực xong
  - `auth-state-received` → `onAuthStateChanged` callback fired
  - `initSaaSDatabase-start` → bắt đầu init data
  - `first-ui-shell-visible` → UI shell hiện (loginOverlay ẩn)
  - `context-ready` → db + clubId + refs sẵn sàng
  - `first-current-tab-rendered` → tab đầu tiên render xong
  - `active-profiles-snapshot` → profiles snapshot đầu tiên arrive
* **Durations tự tính**:
  - `login-to-first-tab-render` = tổng perceived load time
  - `auth-to-ui-shell` = thời gian từ auth state đến UI xuất hiện
  - `ui-shell-to-tab-render` = thời gian render tab sau khi UI hiện
* **Diagnostics đã deferred**: `_checkMonthlyReminder` wrapped trong `setTimeout(..., 300)`.

---

## Safety

* Business logic changed: **no**
* Firestore destructive schema change: **no**
* Migration automatic: **no** (backfill chỉ dry-run trừ khi `--execute --confirm`)
* Deploy executed: **no**
* Firestore Rules changed: **no**
* PII logged: **no** (SĐT không log đầy đủ, tên không log trong backfill)

---

## Hướng dẫn sử dụng sau Phase này

### 1. Tạo Firestore Indexes

Vào Firebase Console → Firestore → Indexes → Thêm composite indexes:

```
Collection: clubs/{clubId}/profiles
Fields:
  - searchName   ASC
  - searchPhone  ASC
  - searchCode   ASC
```

### 2. Backfill search index cho dữ liệu cũ

```bash
# Dry-run (xem sẽ update gì):
node tools/backfill-student-search-index.mjs --project <projectId> --clubId <clubId>

# Ghi thật:
node tools/backfill-student-search-index.mjs \
  --project <projectId> \
  --clubId <clubId> \
  --execute \
  --confirm "BACKFILL SEARCH INDEX <clubId>"
```

### 3. Đo login performance

Sau khi đăng nhập, mở console và chạy:
```js
window.printLoginPerformance()
window.printReadScaleMetrics()
window.printScaleReadiness()
```

### 4. Check all

```bash
npm run check:all
```

---

## Khuyến nghị cho CLB 1000 võ sinh

1. **Tạo Firestore index ngay** cho `searchName`, `searchPhone` để tìm kiếm không cần backfill xong.
2. **Chạy backfill** cho dữ liệu cũ trong giờ thấp điểm (dry-run trước, execute sau khi xác nhận).
3. **Monitor login perf** với `window.printLoginPerformance()` sau mỗi update lớn.
4. **Tab điểm danh** nên load sau login — không nên render tất cả 1000 võ sinh đồng thời lần đầu.
5. **searchName index** chỉ hữu dụng sau khi profile có `searchName` field — ưu tiên backfill CLB lớn trước.
