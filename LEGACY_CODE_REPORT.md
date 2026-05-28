# Legacy Code Report — Phase 3.3 / Bước 2

**Project:** Taekwondo Club Management System  
**Date:** 2026-05-26  
**Scope:** Identifying all code that blocks full modular architecture

---

## Legend

| Symbol | Meaning |
|---|---|
| 🔴 P0 | Blocks production scale — fix ASAP |
| 🟠 P1 | High priority — blocks further modularization |
| 🟡 P2 | Medium priority — tech debt |
| 🟢 P3 | Low priority — cosmetic / minor |

---

## L001 🔴 P0 — Unbounded `onSnapshot(profRef)` — All Profiles Loaded Without Limit

**File:** `app.js` line ~1594  
**Code:**
```javascript
activeListeners.push(onSnapshot(profRef, (snap) => {
    allProfiles = {};
    snap.forEach(d => { allProfiles[d.id.trim()] = d.data(); });
    // ...
}));
```
**Problem:**  
- At 10,000 students: **10,000 Firestore reads per snapshot update**
- Every profile write (attendance toggle, tuition payment) triggers a full re-sync of ALL profiles
- Memory: 10,000 objects × ~500 bytes = ~5MB held in RAM
- Firebase cost: $0.06 per 100K reads × continuous real-time = expensive

**Root Cause:** `allProfiles` is used as an in-memory lookup everywhere in the IIFE.

**Migration Path:**
1. Filter by active: `onSnapshot(query(profRef, where('status', '==', 'active'), limit(500)))`
2. Separate quit-student cache loaded once on demand
3. Move to `window.__store.profiles` (already synced) and use `StudentService.getProfile(name)` for lookups

**Effort:** Large (2–3 days)

---

## L002 🔴 P0 — `renderApp()` Inline HTML String Building

**File:** `app.js` lines ~5500–7000 (estimated ~1,500 lines)  
**Pattern:**
```javascript
function renderApp() {
    // ...
    let html = '';
    activeProfiles.forEach(([name, p]) => {
        html += `<tr><td>${name}</td>...`;
    });
    document.getElementById('activeList').innerHTML = html;
}
```
**Problem:**
- Rebuilds ALL table HTML on every data change (`scheduleRender()` called after every Firestore update)
- `innerHTML = html` for 500+ rows triggers full DOM reparse + reflow
- Template strings contain thousands of characters of HTML — no separation of concerns

**Migration Path:**
1. Move to `js/ui/render.js` (already partially extracted)
2. Replace `innerHTML +=` loops with DocumentFragment (Phase 3.3F pattern)
3. Add shouldComponentUpdate check (`_lastRenderedVersion`) — already partially done

**Effort:** Large (3–5 days, very high risk of regression)

---

## L003 🟠 P1 — SuperAdmin Module in app.js (~865 lines)

**File:** `app.js` lines 527–1392  
**Functions:** `createNewClubSystem`, `loadSuperAdminData`, `loadLoginHistory`, `saveClubExpiry`, `lockClubAccount`, `unlockClubAccount`, `toggleExamFeature`, `forceReplaceAdmin`, `editClubName`, `loadSARevenue`, `saDownloadOriginal`, `saDownloadObfuscated`

**Problem:**  
All SuperAdmin logic (12 functions, ~865 lines) is embedded in the main IIFE alongside normal admin logic. Only `super_admin` role ever uses this code — every user loads it.

**Stub already exists:** `js/modules/superadmin.js` (55 lines — currently empty stub)

**Migration Path:**
1. Move all `window.loadSuperAdminData`, etc. functions to `superadmin.js`
2. Register them in `initSuperAdmin()` export
3. Make it a lazy-loaded module in main.js (Tab: superadmin → `import('./modules/superadmin.js')`)

**Effort:** Medium (1 day)

---

## L004 🟠 P1 — Excel Export in app.js (~1,020 lines)

**File:** `app.js` lines ~4430–5450  
**Functions:** `openExcelExportModal`, `generateExcel`, `updateExcelPeriodOptions`, `generateTaxReport`, `updateTaxPeriodOptions`

**Problem:**
- Excel generation code (1,020 lines) runs at startup for ALL users even though it's only triggered by Admin button click
- xlsx-js-style is a heavy CDN library — its logic embedded in app.js instead of lazy module

**Stub already exists:** `js/modules/finance/finance.excel.js`

**Migration Path:**
1. Move to `finance.excel.js`
2. Lazy-load when admin clicks export button:
   ```javascript
   window.openExcelExportModal = async () => {
       const { openExcelExportModal } = await import('./modules/finance/finance.excel.js');
       openExcelExportModal();
   };
   ```
**Effort:** Medium (1–2 days)

---

## L005 🟠 P1 — Local Variable Coupling (`allProfiles`, `allTransactions`, `allInventory`)

**File:** `app.js` — IIFE-scoped variables

**Problem:**
```javascript
let allProfiles     = {};  // used in 40+ places
let allTransactions = [];  // used in 20+ places
let allInventory    = [];  // used in 15+ places
```
These are IIFE-private variables. Any module that needs profile data must:
- Read from `window.__store.profiles` (synced after each snapshot) OR
- Call Firestore directly via services

The `window.__store` bridge already syncs these (`window.__store.profiles = allProfiles`) but the local variables remain the primary source within app.js.

**Migration Path:**
1. Add `window.__store.allProfiles = allProfiles` sync (already done)
2. Replace all `allProfiles[name]` in extracted modules with `(window.__store.profiles || {})[name]`
3. When renderApp() is fully extracted, the local vars can be removed

**Effort:** Medium per module (ongoing with extraction)

---

## L006 🟡 P2 — Utility Functions Duplicated Between app.js and utils/

**File:** `app.js` vs `js/utils/format.js`, `js/utils/helpers.js`

**Duplications found:**

| Function | In app.js | In utils/ | Status |
|---|---|---|---|
| `getLocalToday()` | ✅ Line ~196 | ✅ format.js | DUPLICATED |
| `formatDate()` | ✅ Line ~197 | ✅ format.js | DUPLICATED |
| `formatMonth()` | ✅ Line ~198 | ✅ format.js | DUPLICATED |
| `addMonthsToYYYYMM()` | ✅ Line ~200 | ✅ format.js | DUPLICATED |
| `normalizeYYYYMM()` | ✅ Line ~212 | ✅ format.js | DUPLICATED |
| `getBranchNameDisplay()` | ✅ Line ~359 | ❌ missing | NEEDS EXTRACT |
| `docTienVND()` | ✅ Line ~2776 | ❌ missing | NEEDS EXTRACT |
| `formatCurrencyInput()` | ✅ Line ~2785 | ❌ missing | DOM-coupled |

**Migration Path:**
- The app.js copies stay for backward compat (guarded by `if (!window.showToast)` pattern)
- Module versions in utils/ take priority
- After Phase 3.5 when app.js bootstrap, duplicates can be deleted

---

## L007 🟡 P2 — `window.showToast` Fallback in app.js

**File:** `app.js` lines ~220–228

**Code:**
```javascript
if (!window.showToast) {
    window.showToast = (msg, duration = 3000, isLoading = false) => {
        // 8 lines of toast implementation
    };
}
```

**Problem:** This fallback exists because app.js loads before `main.js` (the module). When main.js registers the toast module, this gets overridden. But the fallback means there are TWO toast implementations — risk of divergence.

**Migration Path:**
1. Move toast fallback implementation to match exactly what `ui/toast.js` provides
2. After Phase 3.4 confirms module system is stable, remove the fallback

---

## L008 🟡 P2 — Multiple `activeListeners.push()` Pattern vs `listeners.js`

**File:** `app.js` — initSaaSDatabase()

**Problem:**
```javascript
let activeListeners = []; // IIFE-private array
// ...
activeListeners.push(onSnapshot(clubRef, ...));
activeListeners.push(onSnapshot(settingsRef, ...));
activeListeners.push(onSnapshot(invStatsRef, ...));
activeListeners.push(onSnapshot(profRef, ...));   // UNBOUNDED!
activeListeners.push(onSnapshot(invRef, ...));
```

The module system has `js/utils/listeners.js` (key-based Map) but app.js still uses a plain array. No named lookup, no individual unsubscribe.

**Migration Path:**
Replace with:
```javascript
import { addListener, removeListener } from './utils/listeners.js';
addListener('club', onSnapshot(clubRef, ...));
addListener('settings', onSnapshot(settingsRef, ...));
// etc.
```

---

## L009 🟢 P3 — Inline Firestore Rules Comment in app.js

**File:** `app.js` lines 1–109

**Problem:** The first 109 lines of app.js are a block comment containing the FULL Firestore security rules (duplicated from `firestore.rules`). This adds ~6KB to the downloaded JS file with no functional value.

**Fix:** Remove the comment — rules are already in `firestore.rules` and `FIRESTORE_INDEXES.md`

**Effort:** Minutes

---

## L010 🟢 P3 — `_tabHtmlCache` Object (Stale Cache Pattern)

**File:** `app.js` line ~158: `let _tabHtmlCache = {};`

**Problem:** This cache object exists but the caching strategy is not clearly documented. If used incorrectly it can serve stale HTML after data updates.

---

## Migration Roadmap (Full Modular Architecture)

```
Phase 3.3 (Current)
  ✅ Loading.js, event-guard.js, firestore-guard.js
  ✅ Module entry via main.js + conditional file:// handling
  ✅ 13 Firestore unbounded query fixes (app.js)
  ✅ 3 service file query limit fixes

Phase 3.4 (Next Sprint)
  [ ] IndexedDB cache (idb-cache.js)
  [ ] Offline retry queue (offline-queue.js)
  [ ] Extract SuperAdmin (superadmin.js complete)
  [ ] Extract Excel export (finance.excel.js complete)
  [ ] Extract Settings module (settings.js)

Phase 3.5 (Future)
  [ ] Extract Receipt/QR (finance.receipt.js)
  [ ] Extract all renderApp() to render.js
  [ ] Move allProfiles/allTransactions to window.__store only
  [ ] Split onAuthStateChanged → firebase/auth.js
  [ ] Split initSaaSDatabase → firebase/database.js

Phase 3.6 (Target)
  [ ] app.js ≤ 500 lines (bootstrap + compatibility shim only)
  [ ] All 195 window.X functions accounted for in modules
  [ ] Full offline support via Service Worker
  [ ] app.js marked deprecated, main.js is sole entry
```
