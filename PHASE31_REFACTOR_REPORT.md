# PHASE 3.1 — Service Layer Refactor Report

**Date:** 2026-05-26  
**Scope:** Taekwondo Club Management App — Vanilla JS + Firebase SDK v9 CDN  
**Rule:** NO functionality changes. NO CSS changes. NO framework introduction.

---

## Objective

Extract all Firebase Firestore SDK calls out of the 4 business modules into a dedicated service layer (`js/services/`). Introduce a matching event layer (`js/events/`) to separate event-binding concerns. Update `main.js` to reflect the new architecture.

---

## Files Created

### Service Layer — `js/services/`

| File | Exports | Firebase ops covered |
|---|---|---|
| `students.service.js` | `StudentService` | `setDoc`, `addDoc`, `updateDoc`, `writeBatch`, `getDocs`, `query`, `where`, `increment` |
| `finance.service.js` | `FinanceService` | `addDoc`, `deleteDoc`, `updateDoc`, `getDocs`, `query`, `where`, `arrayUnion`, `arrayRemove` |
| `attendance.service.js` | `AttendanceService` | `getDocs`, `setDoc`, `deleteDoc`, `updateDoc`, `writeBatch`, `increment`, `query`, `where`, `collection` |
| `inventory.service.js` | `InventoryService` | `getDoc`, `setDoc`, `addDoc`, `deleteDoc`, `updateDoc`, `getDocs`, `query`, `where` |

All services follow the same bridge pattern for Firebase access at call-time (no module-level caching):
```js
function _sdk()    { return window._fb_init || {}; }
function _db()     { return (window.__store || {}).db; }
function _clubId() { return (window.__store || {}).clubId; }
```

### Event Layer — `js/events/`

| File | Exports | Responsibility |
|---|---|---|
| `students.events.js` | `StudentsEvents` | Form submission handlers + DOM event wiring for student module |
| `finance.events.js` | `FinanceEvents` | Payment form event wiring, modal triggers |
| `attendance.events.js` | `AttendanceEvents` | Shift management, bulk check-in event wiring |
| `inventory.events.js` | `InventoryEvents` | Inventory form submission, category management events |

---

## Files Modified

### `js/modules/students.js`
- Removed all `const { ... } = _sdk()` destructures (6 call-sites)
- Removed all `_db()`, `_colRef()`, `_invRef()`, `_clubId()` local captures from Firebase functions
- **Replaced with `StudentService` calls:**
  - `skipMonth` → `StudentService.skipMonth()`
  - `removeSkip` → `StudentService.removeSkip()`
  - `handleQuitOption` → `StudentService.handleQuitOption()`
  - `deleteProfile` → `StudentService.deleteProfile()`
  - `addNewStudent` → `StudentService.createProfile()` + `addTuitionTransaction()` + `addInventoryEntry()` + `addUniformTransaction()` + `decrementInventoryStock()`
  - `updateProfile` (rename) → `StudentService.findTransactionsByStudent()` + `renameWithBatch()`
  - `updateProfile` (update only) → `StudentService.updateProfile()`
- Added `import { StudentService } from '../services/students.service.js'`

### `js/modules/finance.js`
- Removed all `const { ... } = _sdk()` destructures (6 call-sites)
- Removed local DB bridge captures from all Firebase functions
- **Replaced with `FinanceService` calls:**
  - `deleteTx` → `FinanceService.deleteTransaction()` + `deleteRelatedInventory()` + `getStudentTuitionTxs()` + `updateProfileAfterTxDelete()`
  - `quickPay` → `FinanceService.addTransaction()` + `updateStudentPayment()` + `addFeeAuditSilent()`
  - `quickCollectExam` → `FinanceService.addTransaction()`
  - `processCombo` → `FinanceService.addTransaction()` + `patchProfile()` + `addFeeAuditSilent()`
  - `saveTx` (transactionForm.onsubmit) → `FinanceService.addTransaction()` + `updateStudentPayment()` + `addFeeAuditSilent()`
  - `executeExcelExport` → `FinanceService.queryTxByDateRange()` + `queryTxByTxMonthRange()` + `queryInvByDateRange()`
- Added `import { FinanceService } from '../services/finance.service.js'`
- Removed unused `StudentService` import

### `js/modules/attendance.js`
- Removed all SDK alias functions (`_collection`, `_query`, `_where`, `_getDocs`, `_getDoc`, `_doc`, `_setDoc`, `_deleteDoc`, `_writeBatch`, `_updateDoc`, `_increment`) — all replaced by `AttendanceService`
- **Replaced with `AttendanceService` calls:**
  - `_loadClubShifts` → `AttendanceService.loadShifts()`
  - `_loadCoachForBranchSummary` → `AttendanceService.loadByDate()`
  - `showAttMemberHistory` → `AttendanceService.loadMemberHistory()`
  - `renderAttendanceList` → `AttendanceService.loadByDate()` + `loadCoachNotes()`
  - `addShift` → `AttendanceService.saveShifts()`
  - `deleteShift` → `AttendanceService.saveShifts()`
  - `toggleAttendance` → `AttendanceService.saveRecord()` + `deleteRecord()` + `updateMemberStats()` + `_increment()`
  - `bulkCheckIn` → `AttendanceService.bulkSaveRecords()`
  - `syncOfflineAttendance` → `AttendanceService.bulkSyncOffline()`
  - `renderAttMonthly` → `AttendanceService.loadByMonth()`
- Added `import { AttendanceService } from '../services/attendance.service.js'`

### `js/modules/inventory.js`
- Removed all `const { ... } = _sdk()` destructures (4 call-sites)
- **Replaced with `InventoryService` calls:**
  - `openEditInv` → `InventoryService.loadItem()`
  - `markInvPaid` → `InventoryService.markPaid()`
  - `saveEditInv` → `InventoryService.updateItem()`
  - `loadInvCategories` → `InventoryService.loadCategories()`
  - `addInvCategory` → `InventoryService.saveCategories()`
  - `deleteInvCategory` → `InventoryService.saveCategories()`
  - `inventoryForm.onsubmit` → `InventoryService.addItem()` + `addTransaction()`
- Added `import { InventoryService } from '../services/inventory.service.js'`

### `js/main.js`
- Updated JSDoc header: `Phase 2c` → `Phase 3.1 — Service Layer Refactor`
- Added Phase 3.1 section in header documenting the new service/event layers
- Updated debug console.group label: `Phase 2c` → `Phase 3.1 (Service Layer)`
- Added log lines for service layer and event layer confirmation

---

## New Service Methods Added (not in original T001 plan)

These methods were discovered as needed during module refactoring:

### `students.service.js`
| Method | Purpose |
|---|---|
| `decrementInventoryStock(uniformSize)` | Uses Firebase `increment` FieldValue to update `settings/inventory_stats` when issuing a uniform — avoids leaking `increment` into the module |

### `finance.service.js`
| Method | Purpose |
|---|---|
| `updateProfileAfterTxDelete(name, newPaidUntil, deletedMonths)` | Atomic `updateDoc` with `arrayRemove` — keeps `arrayRemove` FieldValue contained inside the service |
| `_arrayUnion(...items)` | Exposes Firebase `arrayUnion` FieldValue so modules can pass it to `updateStudentPayment` without importing SDK |

### `attendance.service.js`
| Method | Purpose |
|---|---|
| `_increment(n)` | Exposes Firebase `increment` FieldValue so `toggleAttendance` can build `_pu` objects without importing SDK |

---

## Architecture Decision: FieldValue Helpers

Three Firebase FieldValue sentinels (`increment`, `arrayUnion`, `arrayRemove`) must be constructed before passing to `updateDoc`/`setDoc`. Rather than re-importing the SDK in modules, these are exposed as thin helpers on the service objects (`AttendanceService._increment`, `FinanceService._arrayUnion`, `StudentService.decrementInventoryStock`). This keeps all Firebase surface area inside the `js/services/` layer.

---

## What Did NOT Change

- All business logic and conditional branches
- All UI rendering logic
- All CSS / HTML
- All `window.*` global function signatures (public API unchanged)
- Firebase bridge pattern (`window._fb_init`, `window.__store`) — unchanged
- No new npm packages or frameworks introduced

---

## File Count Summary

| Category | Files |
|---|---|
| New service files | 4 |
| New event files | 4 |
| Modified modules | 4 |
| Modified main.js | 1 |
| **Total files touched** | **13** |

---

## Verification Checklist

- [x] Zero `const { ... } = _sdk()` calls remain in any of the 4 modules
- [x] Zero direct `addDoc / deleteDoc / setDoc / updateDoc / getDocs / writeBatch` calls in modules
- [x] All 4 modules import their respective service
- [x] All service files follow the `_sdk()` / `_db()` / `_clubId()` bridge pattern
- [x] `main.js` header and debug log reflect Phase 3.1
- [x] No CSS files modified
- [x] No HTML files modified
- [x] No functionality changes
