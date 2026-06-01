# PHASE_4B4F_RUNTIME_RECOVERY_REPORT.md

**Phase:** 4.0B-4F — Automatic Runtime Recovery + Legacy Closure Sync + Browser Pilot Verification  
**Ngày:** 2026-05-31  
**Trạng thái:** Sẵn sàng áp dụng (xem hướng dẫn trong `phase-4f/APPLY_INSTRUCTIONS.md`)

---

## Tóm tắt những gì thay đổi

### 1. Runtime Recovery tự chạy lúc nào

Sau khi người dùng login thành công, `app.js` dispatch event `app:context-ready`.  
`main.js` lắng nghe event này và schedule sau **500ms**:

```
window.addEventListener('app:context-ready', () => {
  setTimeout(() => window.runRuntimeDataRecovery?.('app-context-ready'), 500);
});
```

`runRuntimeDataRecovery()` sẽ:
1. Gọi `resolveActiveDataSource()` để xác định data source.
2. Nếu source = `legacy-root` → tự gọi `activateLegacyRootFallback('auto-runtime-recovery')`.
3. Nếu source = `primary` → không làm gì thêm.
4. Guard: chạy **tối đa 1 lần mỗi login session** (dùng `__runtimeRecoveryState.completed`).
5. Reset hoàn toàn khi logout.

---

### 2. Nếu data source là legacy-root thì xử lý ra sao

`activateLegacyRootFallback()` (đã nâng cấp) sẽ:

1. Đọc **read-only** 3 collections: `tst_profiles`, `tst_transactions`, `tst_inventory` (limit 500 mỗi collection).
2. Sync dữ liệu vào **tất cả các lớp**:
   - `window.__store.profiles / .transactions / .inventory`
   - Closures `allProfiles`, `allTransactions`, `allInventory` trong IIFE của app.js
   - `studentProfileStore` (qua `syncProfilesToStudentStore()`) nếu có
   - `inventoryStore` (qua `__inventoryStore.setAllInventory()`) nếu có
3. Gọi `bumpRuntimeDataVersion('legacy-root-fallback')` để đánh dấu data đã thay đổi.
4. Invalidate tất cả tabs: `invalidateStudents`, `invalidateFinance`, `invalidateInventory`, `invalidateDashboard`, `invalidateCurrentTab`.
5. Gọi `scheduleRender()` (hoặc `renderApp()` fallback) để re-render UI.
6. Không ghi bất cứ gì vào Firestore.

---

### 3. Có sync vào allProfiles / allTransactions / allInventory không

**Có.** Phase 4.0B-4E cũ chỉ sync vào `window.__store.*`. Phase 4F mới thêm:

```js
// Profiles:
allProfiles = profileMap;                    // closure sync

// Transactions:
allTransactions = Array.isArray(legTx) ? legTx : [];  // closure sync

// Inventory:
allInventory = Array.isArray(legInv) ? legInv : [];   // closure sync
```

Điều này đảm bảo render cũ (còn đọc closure thay vì `window.__store`) cũng thấy data đúng.

---

### 4. Sau recovery các tab có render lại không

**Có.** Sau recovery, hệ thống gọi theo thứ tự:

1. `bumpRuntimeDataVersion()` → `_dataVersion++`, `_lastDataVersionReason = 'legacy-root-fallback'`
2. `invalidateStudents / invalidateFinance / invalidateInventory / invalidateDashboard / invalidateCurrentTab`
3. `scheduleRender()` → đặt timeout 250ms để gọi `renderApp()`

Kết quả: **tất cả tabs hiển thị dữ liệu thật** ngay sau khi recovery hoàn tất, không cần reload trang.

---

### 5. Có ghi Firestore không

**Không.** Không có `setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `batch.set`, `batch.update` nào trong toàn bộ code fallback và recovery.  
`check-pilot-readiness.mjs` tự kiểm tra điều này ở check #9.

---

### 6. Có thể cho 1 CLB pilot chưa

**Có thể**, nếu `window.printPilotLaunchStatus()` sau login trả về:
- `readyForOneClubPilot: true`
- `tuitionReady: true` và `debtReady: true`
- `profilesCount > 0` hoặc `transactionsCount > 0`

Điều kiện: CLB đó phải có data trong `tst_profiles` / `tst_transactions` (legacy-root), **hoặc** đã có data trong path primary `clubs/{clubId}/*`.

---

### 7. Có thể cho 10 CLB pilot chưa

**Chưa.** `readyForTenClubPilot: false` được set cứng — cần thêm:
- Kiểm tra multi-tenant isolation (mỗi CLB chỉ thấy data của mình).
- Kiểm tra Firestore Rules áp dụng đúng cho tất cả clubs.
- QA end-to-end với ≥2 CLB có dữ liệu thật.
- Manual sign-off từ team kỹ thuật.

---

### 8. Blocker còn lại

| # | Blocker | Mức độ |
|---|---------|--------|
| 1 | Chưa có data trong path primary `clubs/{clubId}/*` — cần migration thủ công (ngoài phạm vi Phase 4F) | Trung bình |
| 2 | `readyForTenClubPilot` vẫn `false` — cần QA multi-tenant | Cao (cho 10 CLB) |
| 3 | Firestore Rules chưa được audit đầy đủ cho tất cả subcollections mới | Trung bình |
| 4 | `check:all` cần pass sạch trên môi trường CI | Thấp |

---

## Danh sách files thay đổi

| File | Loại thay đổi |
|------|---------------|
| `app.js` | Thêm `__runtimeRecoveryState` init (Phase 1) |
| `app.js` | Thêm `bumpRuntimeDataVersion` helper (Phase 4) |
| `app.js` | Thay thế `activateLegacyRootFallback` (Phase 3+4) |
| `app.js` | Thêm `runRuntimeDataRecovery` (Phase 2) |
| `app.js` | Thêm `printPilotLaunchStatus` (Phase 6) |
| `app.js` | Thêm logout reset `__runtimeRecoveryState` (Phase 7) |
| `js/main.js` | Thêm `app:context-ready` listener + auto-recovery (Phase 2) |
| `tools/check-pilot-readiness.mjs` | Thêm 10 checks mới Phase 4F (Phase 8) |

---

## Kiểm tra sau khi áp dụng

```bash
node tools/check-syntax.mjs
node tools/check-assets.mjs
node tools/check-deploy-contract.mjs
node tools/check-functions.mjs
node tools/check-runtime-bootstrap.mjs
node tools/check-data-hydration.mjs
node tools/check-pilot-readiness.mjs
npm run check:all
npm run local
```

Sau khi login, chạy trong console trình duyệt:

```js
await window.resolveActiveDataSource()
window.printDataHydrationStatus()
window.printPilotTabReadiness()
window.printPilotLaunchStatus()
window.__runtimeRecoveryState
```

Kỳ vọng nếu data nằm ở `tst_*`:
- `__runtimeRecoveryState.recoveryUsed === true`
- `__runtimeRecoveryState.activeDataSource === 'legacy-root'`
- `profilesCount > 0` (nếu `tst_profiles` có data)
- `tuitionReady: true`, `debtReady: true`
