# Phase 4.0B-4E Pilot Readiness Report

## Objective
- Xác định nguồn dữ liệu thực sự (primary SaaS path vs legacy root vs empty)
- Bật read-only legacy fallback nếu primary rỗng nhưng legacy có dữ liệu
- Chống primary empty overwrite khi legacy-root đang active
- Không ghi Firestore, không migration tự động, không deploy

---

## Pre-flight Config Patches (Phase 0)

| File | Thay đổi |
|------|---------|
| `firestore.indexes.json` | Tạo mới — `firebase.json` trỏ tới file này nhưng chưa tồn tại |
| `functions/package.json` | Thêm script `lint` — `firebase.json` predeploy gọi `npm run lint` |

---

## Data Source

| Nguồn | Path | Khi nào dùng |
|-------|------|-------------|
| **primary** | `clubs/{clubId}/profiles|transactions|inventory` | Khi SaaS path có dữ liệu — đây là path chính |
| **legacy-root** | `tst_profiles`, `tst_transactions`, `tst_inventory` | Khi primary rỗng nhưng legacy có data — read-only |
| **empty** | — | Cả hai đều rỗng |
| **permission-error** | — | Firestore Rules chặn read |

---

## Functions Added

### Phase 1 — `printFirestorePathStatus()` mở rộng
Kiểm tra cả 6 paths (primary + legacy), trả về structured result với `recommendation`.

```js
await window.printFirestorePathStatus()
// → { clubId, primary: { profilesHasDocs, ... }, legacy: { ... }, recommendation }
```

### Phase 2 — `resolveActiveDataSource()`
```js
await window.resolveActiveDataSource()
// → { clubId, source, primary, legacy, reason, safeToRender }
// source: 'primary' | 'legacy-root' | 'empty' | 'permission-error' | 'unknown'
```

### Phase 3+4 — `activateLegacyRootFallback()`
Read-only. Không ghi Firestore. Đọc `tst_profiles`, `tst_transactions`, `tst_inventory` (limit 500 mỗi collection), sync vào store, bump `_dataVersion`, invalidate tabs.

```js
await window.activateLegacyRootFallback()
// → { activeDataSource: 'legacy-root', profilesCount, transactionsCount, inventoryCount, ... }
```

**Warning hiển thị:** `"Đây là chế độ tạm trước khi migration chính thức. Không ghi Firestore."`

### Phase 5 — Primary empty overwrite guard

Khi `activeDataSource === 'legacy-root'` và primary listener bắn snapshot rỗng, store **không bị ghi đè**:

| Listener | Guard |
|---------|-------|
| `_syncAllProfilesLegacy` (active profiles path) | Skip overwrite nếu compat empty + store có data |
| Fallback `onSnapshot` profiles | Return early nếu snap.size === 0 + store có data |
| `_invCb` (inventory) | Return early nếu inv empty + store có data |
| `_mergeAndRender` (transactions) | Return early nếu tx empty + store có data |

### Phase 6 — `printPilotTabReadiness()`
```js
window.printPilotTabReadiness()
// → { activeDataSource, profilesCount, transactionsCount, inventoryCount,
//     tuitionReady, debtReady, activeStudentsReady, quitStudentsReady,
//     inventoryReady, dashboardReady, warnings }
```

---

## Tab Readiness (sau khi data hydrated)

| Tab | Điều kiện ready |
|-----|----------------|
| Học phí (Tuition) | `profiles > 0 && transactions array` |
| Báo nợ (Debt) | `profiles > 0` |
| Đang tập (Active) | `active profiles > 0` |
| Đã nghỉ (Quit) | `profiles > 0 (tất cả)` |
| Kho đồ (Inventory) | `inventory > 0` |
| Tổng quan (Dashboard) | `profiles > 0 || transactions > 0` |

---

## Check Tool

### `tools/check-pilot-readiness.mjs` — 30+ patterns

| Nhóm | Checks |
|------|--------|
| resolveActiveDataSource | 6 checks (source branches, safeToRender) |
| activateLegacyRootFallback | 5 checks (legacy paths, fallbackReason) |
| __firestoreDataSourceMetrics | 4 checks (fields) |
| Primary empty overwrite guard | 5 checks (profiles/active, profiles/fallback, inventory, transactions) |
| printPilotTabReadiness | 7 checks (tab readiness fields) |
| _dataVersion bump | 1 check |
| invalidate tabs | 4 checks |
| printFirestorePathStatus extended | 4 checks |
| No Firestore write in fallback | 1 check |
| No auto migration | 1 check |
| firestore.rules not public | 1 check |
| Pre-flight: firestore.indexes.json | 1 check |
| Pre-flight: functions lint script | 1 check |

### Script mới
```bash
npm run check:pilot
```

### check:all cập nhật
```bash
npm run check:all
# = check-syntax + check-assets + check-deploy + check-functions
#   + check-runtime-bootstrap + check-data-hydration + check-pilot-readiness
```

---

## Cách dùng sau khi login (DevTools Console)

```js
// Bước 1: Xác định nguồn dữ liệu
const src = await window.resolveActiveDataSource()
// src.source: 'primary' | 'legacy-root' | 'empty' | 'permission-error'

// Bước 2a: Nếu primary — UI tự hiển thị
// Bước 2b: Nếu legacy-root — bật fallback
await window.activateLegacyRootFallback()

// Bước 3: Kiểm tra trạng thái tab
window.printPilotTabReadiness()

// Bước 4: Debug chi tiết
await window.printFirestorePathStatus()
window.printDataHydrationStatus()
window.printTabDataStatus()
```

---

## Safety

| Hạng mục | Trạng thái |
|----------|-----------|
| Business logic changed | **NO** |
| Firestore schema changed | **NO** |
| Firestore write in recovery | **NO** |
| Firestore Rules opened public | **NO** |
| Auto migration performed | **NO** |
| Deploy executed | **NO** |
| PII logged | **NO** |
| Parent Portal flags changed | **NO** |

---

## Recommendation

| Milestone | Điều kiện |
|-----------|-----------|
| **Sẵn sàng internal test** | `check:all` pass + login được + `resolveActiveDataSource()` trả về source rõ ràng |
| **Sẵn sàng 1-CLB pilot** | Primary có data + tất cả tabs ready + không có critical health check fail |
| **Sẵn sàng 10-CLB pilot** | Như trên + đã test legacy fallback + migration plan xác nhận |

**Blockers hiện tại:** Cần chạy thực tế sau login để xác nhận `activeDataSource` và tab readiness count. Code đã sẵn sàng, chỉ cần verify với dữ liệu thật.

---

## Files thay đổi

| File | Loại |
|------|------|
| `app.js` | Mở rộng printFirestorePathStatus + thêm 4 globals mới + 4 DataSourceLock guards |
| `firestore.indexes.json` | Tạo mới |
| `functions/package.json` | Thêm script lint |
| `tools/check-pilot-readiness.mjs` | Tạo mới |
| `package.json` | Thêm check:pilot + cập nhật check:all |
| `PHASE_4B4E_PILOT_READINESS_REPORT.md` | Tạo mới |
| `MIGRATION_NOTES.md` | Thêm entry Phase 4.0B-4E |
