# APP.JS Dependency Report — Phase 3.3 / Bước 2

**Project:** Taekwondo Club Management System  
**File:** `app.js` (8,959 lines, 603KB)  
**Date:** 2026-05-26  
**Goal:** Reduce app.js to bootstrap + compatibility layer only (<50KB)

---

## Executive Summary

`app.js` is a monolithic IIFE containing ~8,959 lines of mixed concerns:
- Firebase initialization & auth
- Business logic (all domains)
- UI rendering (all tabs)
- Modal management
- Event wiring
- Helper utilities

**195 unique `window.X` assignments** make the global namespace the app's de-facto API surface.

---

## Module Extraction Status

### ✅ Already Extracted (Phases 2–3.3)

| Domain | Module | Lines | window.X functions |
|---|---|---|---|
| Students CRUD | `js/modules/students.js` | 1,114 | openAddModal, addNewStudent, editProfile, deleteStudent, openProfile, filterStudents, ... |
| Finance/Transactions | `js/modules/finance.js` | 1,387 | quickPay, deleteTx, skipMonth, removeSkip, onTxTypeChange, ... |
| Attendance | `js/modules/attendance.js` | 882 | renderAttendanceList, toggleAttendance, renderAttMonthly, ... |
| Inventory | `js/modules/inventory.js` | 663 | getInvCategories, loadInvCategories, calcInv, ... |
| Dashboard/Charts | `js/modules/dashboard.js` | 387 | getFinanceChart, getMemberChart, _destroyDashboardCharts |
| UI: Toast | `js/ui/toast.js` | 34 | showToast |
| UI: Modal | `js/ui/modal.js` | 46 | openModal, closeModal |
| UI: Tabs | `js/ui/tabs.js` | 206 | switchTab |
| UI: Render | `js/ui/render.js` | 579 | _moduleRenderApp |
| UI: Loading | `js/ui/loading.js` | 189 | showLoading, hideLoading, withLoading |
| Services | `js/services/*.js` | 1,023 | (internal — called by modules) |
| Events | `js/events/*.js` | 573 | (internal — called from main.js) |
| Utilities | `js/utils/*.js` | 921 | _fmt, safeGetDocs, guardOnce, ... |
| Store/Bridge | `js/store.js` | 175 | __store bridge |

**Total extracted: ~8,179 lines → moved to 28 module files**

---

## What Still Lives in app.js

### Category A: Bootstrap (KEEP — Cannot Remove)
```
Lines 1–130    Firebase init: initializeApp, getFirestore, getAuth, secondaryApp
Lines 111–113  Firebase SDK destructuring from window._fb_init
Lines 115–129  firebaseConfig, app, db, auth, secondaryApp
Lines ~400+    onAuthStateChanged() handler — auth state machine
Lines ~1540+   initSaaSDatabase() — Firestore refs setup + onSnapshot bindings
Lines ~2500+   Login history + auth cache (_saveAuthCache, _loadAuthCache)
```

### Category B: SuperAdmin (EXTRACTABLE → `js/modules/superadmin.js`)
```
Lines 527–1392  All window.* SuperAdmin functions (~865 lines):
  window.createNewClubSystem()      — Create new club SaaS account
  window.switchSATab()              — SuperAdmin tab navigation
  window.loadSuperAdminData()       — Load all clubs data for SA dashboard
  window.loadLoginHistory()         — Load login audit log
  window.saveClubExpiry()           — Update club subscription expiry
  window.lockClubAccount()          — Lock a club account
  window.unlockClubAccount()        — Unlock a club account
  window.toggleExamFeature()        — Enable/disable exam feature per club
  window.saOpenDeleteTxModal()      — Delete transactions modal
  window.saDeleteTransactions()     — Bulk delete transactions
  window.filterSAClubs()            — Filter clubs list
  window._renderSAClubRows()        — Render SA club table rows
  window.forceReplaceAdmin()        — Replace club admin account
  window.editClubName()             — Edit club name
  window.loadSARevenue()            — Load SA revenue statistics
  window.saDownloadOriginal()       — Download app.js original
  window.saDownloadObfuscated()     — Download obfuscated app.js
  TOTAL: ~865 lines → 9.7% of app.js
```

### Category C: Rendering (PARTIALLY EXTRACTED → `js/ui/render.js`)
```
Lines ~5500–7000  renderApp() — main render dispatcher
  renderStudentList()           — Active students tab
  renderDebtList()              — Debt students tab
  renderQuitList()              — Quit students tab
  renderTxList()                — Transactions tab
  renderInventory()             — Inventory tab
  renderExpenseList()           — Expense tab
  renderReportList()            — Dashboard/Reports tab
  All inline HTML string builders (~1,500 lines)
  
  STATUS: render.js module exists but renderApp() itself remains in app.js
  BLOCKER: renderApp() reads allProfiles, allTransactions, allInventory (local vars)
```

### Category D: Excel Export (EXTRACTABLE → `js/modules/finance/finance.excel.js`)
```
Lines ~4430–5450  Excel export functions (~1,020 lines):
  window.openExcelExportModal()     — Open export modal
  window.generateExcel()            — Generate XLSX file
  window.updateExcelPeriodOptions() — Update period dropdown
  window.generateTaxReport()        — Generate tax TNCN Excel
  window.updateTaxPeriodOptions()   — Tax period dropdown
  TOTAL: ~1,020 lines → 11.4% of app.js
  NOTE: Rare-use feature — prime lazy-load candidate
```

### Category E: Attendance Report Excel (EXTRACTABLE → `js/modules/attendance/attendance.excel.js`)
```
Lines ~8050–8450  Attendance Excel export (~400 lines):
  window.renderAttMonthlyExcel()    — Generate attendance monthly report XLSX
  TOTAL: ~400 lines → 4.5% of app.js
```

### Category F: Utility Functions (PARTIALLY EXTRACTED)
```
Already in utils/format.js:
  getLocalToday(), formatDate(), formatMonth(), addMonthsToYYYYMM(), etc.

Still in app.js:
  Lines 2776–2782  docTienVND() — VND amount in Vietnamese words → format.js
  Lines 2785–2793  formatCurrencyInput() — DOM input formatter
  Lines ~300+      applyClubConfigUI() — apply club settings to DOM
  Lines ~360+      getBranchNameDisplay() — branch code → display name → utils/helpers.js
  Lines ~220+      showToast() fallback (guarded by if(!window.showToast))
```

### Category G: Settings Management (EXTRACTABLE → `js/modules/settings.js`)
```
Lines ~5450–6000  Settings/config functions (~550 lines):
  window.saveClubSettings()        — Save club configuration
  window.loadLogoForReceipt()      — Load logo image for receipts
  window.changePW()                — Change admin password
  window.syncOldCoaches()          — Sync legacy coach accounts
  window.addShift()                — Add training time slot
  window.deleteShift()             — Delete training time slot
  window.saveShifts()              — Save all shifts
```

### Category H: Receipt/QR Generation (EXTRACTABLE → `js/modules/finance/finance.receipt.js`)
```
Lines ~6000–6500  Receipt generation (~500 lines):
  window.generateQR()              — QR code payment generation
  window.printReceipt()            — Print/save receipt
  window.copyAndOpenZalo()         — Copy Zalo message
```

---

## app.js Size Reduction Roadmap

| Phase | Extract What | Lines Saved | app.js Target |
|---|---|---|---|
| **Current** | *(nothing new extracted)* | 0 | ~8,959 lines (603KB) |
| **3.4A** | SuperAdmin module complete | ~865 | ~8,094 lines |
| **3.4B** | Excel export lazy module | ~1,020 | ~7,074 lines |
| **3.4C** | Settings + Receipt modules | ~1,050 | ~6,024 lines |
| **3.4D** | Attendance Excel | ~400 | ~5,624 lines |
| **3.4E** | renderApp() + inline HTML | ~1,500 | ~4,124 lines |
| **3.4F** | Utility functions cleanup | ~300 | ~3,824 lines |
| **3.5** | Auth + onSnapshot extracted | ~800 | ~3,024 lines |
| **Target** | Bootstrap + compatibility only | — | **~500 lines** |

---

## What Prevents Deleting app.js Today

1. **`renderApp()` function** — 1,500+ lines of inline HTML generation. Reads `allProfiles`, `allTransactions`, `allInventory` local variables. Requires full refactor of data binding.

2. **`onAuthStateChanged()` handler** — Complex state machine for auth: fast-path cache, slow-path Firestore lookup, 4 fallback paths, role detection, expiry check, initSaaSDatabase call.

3. **`initSaaSDatabase()`** — Sets up `profRef`, `colRef`, `invRef`, 5 `onSnapshot` listeners, `window.__store` bridge. All modules depend on this running first.

4. **`allProfiles / allTransactions / allInventory`** — Local IIFE variables shared across renderApp() and 80+ window.X functions. Need to be migrated to `window.__store` before app.js can be split.

5. **`onSnapshot(profRef, ...)` (line 1594)** — Unbounded listener loading ALL profiles. Architectural change needed (status filter + quit cache) before this can be safely modified.

6. **195 `window.X` assignments** — Every window function in app.js must be replicated/wrapped before removal. 23 are not yet extracted.

---

## Dependency Graph

```
index.html
  └── app.js (defer)
        ├── Firebase CDN (window._fb_init)
        ├── Reads: allProfiles, allTransactions, allInventory [LOCAL vars]
        ├── Writes: window.__store.* [bridge for modules]
        ├── Writes: window.userRole, window.coachBranch [global state]
        └── Calls: window.renderAttendanceList, window.renderExamList
                  (these are MODULE functions — cross-dependency!)

  └── js/main.js (module — HTTP only)
        ├── imports: store.js, firebase/config.js
        ├── imports: ui/* (loading, toast, modal, tabs, render)
        ├── imports: modules/* (students, finance, inventory, attendance, dashboard)
        ├── imports: events/* (students.events, finance.events)
        └── imports: utils/* (format, helpers, constants, listeners, pagination,
                              event-guard, firestore-guard)
```

**Critical circular dependency:**
- `app.js` calls `window.renderAttendanceList` (defined in `modules/attendance.js`)
- `modules/attendance.js` reads from `window.__store` (written by `app.js`)
- Resolution: `window.__store` bridge is already in place — this is fine

---

## Recommendations

### Immediate (this sprint)
1. ✅ Complete SuperAdmin extraction to `js/modules/superadmin.js`
2. ✅ Move `docTienVND()` to `js/utils/format.js`
3. ✅ Move `getBranchNameDisplay()` to `js/utils/helpers.js`

### Next sprint (Phase 3.4)
4. Extract Excel export to lazy-loaded `js/modules/finance/finance.excel.js`
5. Extract Settings to `js/modules/settings.js`
6. Extract Receipt/QR to `js/modules/finance/finance.receipt.js`

### Medium term (Phase 3.5)
7. Migrate `allProfiles/allTransactions/allInventory` → `window.__store`
8. Move `renderApp()` to `js/ui/render.js` (already partially done)
9. Split `onAuthStateChanged()` to `js/firebase/auth.js`
10. Move `initSaaSDatabase()` to `js/firebase/database.js`
