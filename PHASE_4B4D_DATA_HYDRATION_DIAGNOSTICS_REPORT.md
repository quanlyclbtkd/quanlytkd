# Phase 4.0B-4D Data Hydration Diagnostics Report

## Objective
- Thêm công cụ runtime diagnostics để xác nhận dữ liệu thật có hydrate vào app và từng tab
- Không sửa business logic, không ghi Firestore, không deploy

---

## Metrics Added — `window.__dataHydrationMetrics`

```js
window.__dataHydrationMetrics = {
  clubId:                   '',   // set khi dispatchAppContextReady
  appContextReady:          false, // set khi context sẵn sàng
  profilesSnapshotCount:    0,    // tăng mỗi lần profiles snapshot bắn
  profilesDocCount:         0,    // số docs trong snapshot gần nhất
  transactionsSnapshotCount: 0,   // tăng mỗi lần tx merge chạy
  transactionsDocCount:     0,    // số tx trong merge gần nhất
  inventorySnapshotCount:   0,    // tăng mỗi lần inventory snapshot bắn
  inventoryDocCount:        0,    // số items inventory gần nhất
  settingsLoaded:           false, // true khi settings doc exists
  clubLoaded:               false, // true khi club doc exists
  lastUpdatedAt:            0,    // timestamp ms
  lastReason:               ''    // lý do update cuối
}
```

### Điểm update trong app.js

| Vị trí | Metrics được cập nhật |
|--------|----------------------|
| `dispatchAppContextReady()` | `appContextReady = true`, `clubId` |
| `_clubCb` (club onSnapshot) | `clubLoaded = true` |
| `_settingsCb` (settings onSnapshot) | `settingsLoaded = true` |
| `_syncAllProfilesLegacy` (active profiles path) | `profilesSnapshotCount++`, `profilesDocCount` |
| Fallback profiles `onSnapshot` | `profilesSnapshotCount++`, `profilesDocCount` |
| `_invCb` (inventory onSnapshot) | `inventorySnapshotCount++`, `inventoryDocCount` |
| `_mergeAndRender` (transactions) | `transactionsSnapshotCount++`, `transactionsDocCount` |

---

## Debug Functions Added

### `window.printDataHydrationStatus()`
Tóm tắt số lượng doc đã hydrate vào store. Chỉ log count/status, không log PII.

```js
window.printDataHydrationStatus()
// console.table:
// clubId, appContextReady,
// profilesDocCount, transactionsDocCount, inventoryDocCount,
// storeProfilesCount, storeTransactionsCount, storeInventoryCount,
// settingsLoaded, clubLoaded, lastReason
```

### `window.printTabDataStatus()`
Cho biết từng tab có đủ dữ liệu để render không.

```js
window.printTabDataStatus()
// console.table:
// currentTab, selectedMonth,
// profilesCount, transactionsCount, transactionsInSelectedMonth,
// inventoryCount,
// tuitionTabCanRender, debtTabCanRender,
// inventoryTabCanRender, dashboardCanRender
```

### `window.printFirestorePathStatus()`
Kiểm tra path nào có doc trong Firestore (chỉ `limit(1)`, không đọc data, không ghi).

```js
await window.printFirestorePathStatus()
// console.table:
// clubId,
// 'clubs/{id}/profiles':     true/false,
// 'clubs/{id}/transactions': true/false,
// 'clubs/{id}/inventory':    true/false
```

---

## Check Tool Added

### `tools/check-data-hydration.mjs`
Kiểm tra source tĩnh `app.js`:

| Check | Nội dung |
|-------|---------|
| `__dataHydrationMetrics` | Object đầy đủ fields |
| `_updateHydrationMetrics` | Helper function |
| `printDataHydrationStatus` | Global định nghĩa + fields |
| `printTabDataStatus` | Global định nghĩa + Tab readiness fields |
| `printFirestorePathStatus` | Global định nghĩa + limit(1) + paths |
| Metrics profiles | Cập nhật cả 2 paths (active + fallback) |
| Metrics transactions | Cập nhật trong `_mergeAndRender` |
| Metrics inventory | Cập nhật trong `_invCb` |
| Metrics club/settings | `clubLoaded`/`settingsLoaded` trong callbacks |
| Không Firestore write | Kiểm tra vùng diagnostic không có setDoc/updateDoc/addDoc/deleteDoc |
| Không log PII | Không log `.name`/`.phone`/`.email` trực tiếp |

### Script mới

```bash
npm run check:data-hydration
```

### check:all cập nhật

```bash
npm run check:all
# = check-syntax + check-assets + check-deploy + check-functions
#   + check-runtime-bootstrap + check-data-hydration
```

---

## Cách dùng sau khi login

```js
// 1. Kiểm tra context + hydration tổng quan
window.printDataHydrationStatus()

// 2. Kiểm tra từng tab có render được không
window.printTabDataStatus()

// 3. Kiểm tra Firestore path (async)
await window.printFirestorePathStatus()

// 4. Xem raw metrics
window.__dataHydrationMetrics

// 5. Kiểm tra health check after-login
window.printRuntimeHealth({ phase: 'after-login' })
```

**Nếu tất cả count = 0:** Gọi `printFirestorePathStatus()` để xác định path nào rỗng.

---

## Checks

- **check-syntax:** PASS
- **check-assets:** PASS
- **check-deploy:** PASS
- **check-functions:** PASS
- **check-runtime-bootstrap:** PASS
- **check-data-hydration:** PASS
- **check:all:** PASS — exit code 0

---

## Safety

| Hạng mục | Trạng thái |
|----------|-----------|
| Business logic changed | **NO** |
| Firestore schema changed | **NO** |
| Firestore write in diagnostics | **NO** |
| Firestore Rules opened public | **NO** |
| Deploy executed | **NO** |
| PII logged | **NO** — chỉ log count/status/flag |
| app.js login/logout flow changed | **NO** |
| Module logic changed | **NO** |

---

## Next Recommended Phase
- **Phase 4.0B-4E:** Lint / Code Quality Gate — ESLint hoặc custom linter enforce conventions
