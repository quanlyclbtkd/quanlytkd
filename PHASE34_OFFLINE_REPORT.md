# Phase 3.4 — IndexedDB Cache + Offline Mode Report

**Project:** Taekwondo Club Management System  
**Date:** 2026-05-26  
**Status:** Utilities ready — integration guide below

---

## New Files Created

### `js/utils/idb-cache.js`
**Purpose:** Lightweight IndexedDB cache with TTL support  
**API:**
```javascript
// Cache-first fetch (most common pattern)
const quitStudents = await cacheGetOrFetch(
    makeCacheKey('quit_profiles', clubId),
    () => getDocs(query(profRef, where('status', '==', 'quit'), limit(5000))),
    CACHE_TTL.QUIT_PROFILES  // 1 hour
);

// Manual cache control
await cacheSet('club_config_abc123', configData, CACHE_TTL.CLUB_CONFIG); // 5 min
const config = await cacheGet('club_config_abc123');
await cacheDelete('club_config_abc123');
await cacheClearAll(); // on logout
await cacheInvalidatePrefix('quit_profiles_'); // when club data changes
```
**Exported constants:** `CACHE_TTL` (QUIT_PROFILES, CLUB_CONFIG, EXCEL_DATA, SHIFTS, COACH_LIST)  
**Graceful degradation:** Catches Safari private-mode IDB errors, falls back to network

### `js/utils/offline-queue.js`
**Purpose:** Queue Firestore writes when offline, auto-retry on reconnect  
**API:**
```javascript
// Replace direct Firestore writes:
// BEFORE: await addDoc(collection(db, 'transactions'), data);
// AFTER:
const { success, queued, docId } = await queueWrite({
    type: 'addDoc',
    collection: `clubs/${clubId}/transactions`,
    data: transactionData,
    optimisticId: `temp_${Date.now()}` // for optimistic UI
});

// Start processor (call once in main.js init)
startQueueProcessor();

// Check queue status
const pending = await getQueueLength();

// React to connectivity changes
onConnectivityChange((event, isNowOnline) => {
    if (isNowOnline) window.showToast('🌐 Đã kết nối lại!');
    else window.showToast('📴 Mất kết nối!', 5000);
});
```
**Features:**
- Auto-detects online/offline via `navigator.onLine` + window events
- Offline banner appears at bottom of screen automatically
- Retry resumes in order (FIFO) on reconnect
- Graceful failure: keeps in queue, logs to console

---

## Integration Steps for Phase 3.4

### Step 1: Import in `main.js`
```javascript
import { startQueueProcessor, onConnectivityChange } from './utils/offline-queue.js';
import { cacheClearAll } from './utils/idb-cache.js';

// In init():
startQueueProcessor();

// In logout():
await cacheClearAll();
```

### Step 2: Cache Quit Students (Most Impactful)
**File:** `js/modules/students.js` — add near top:
```javascript
import { cacheGetOrFetch, makeCacheKey, CACHE_TTL } from '../utils/idb-cache.js';

// In renderQuitList() or wherever quit students are needed:
async function getQuitProfiles() {
    const clubId = (window.__store || {}).clubId;
    return cacheGetOrFetch(
        makeCacheKey('quit_profiles', clubId),
        async () => {
            const { getDocs, query, where, limit } = window._fb_init;
            const profRef = (window.__store || {}).profRef;
            const snap = await getDocs(query(profRef, where('status', '==', 'quit'), limit(5000)));
            const result = {};
            snap.forEach(d => { result[d.id] = d.data(); });
            return result;
        },
        CACHE_TTL.QUIT_PROFILES
    );
}
```

### Step 3: Fix `onSnapshot(profRef)` — Active Students Only (P0)
**File:** `app.js` — `initSaaSDatabase()` — change the profiles listener:
```javascript
// PHASE 3.4 FIX — replaces the UNBOUNDED onSnapshot(profRef):
const activeProfilesQuery = query(
    profRef,
    where('status', 'in', ['active', 'trial']),
    limit(1000)
);
activeListeners.push(onSnapshot(activeProfilesQuery, (snap) => {
    // Keep allProfiles but only for active/trial — quit students served from IndexedDB cache
    allProfiles = {};
    snap.forEach(d => { allProfiles[d.id.trim()] = d.data(); });
    if (window.__store) window.__store.profiles = allProfiles;
    scheduleRender();
}));
// Quit students: loaded on-demand via getQuitProfiles() with 1-hour IDB cache
```
⚠️ **WARNING:** This change will break any code that reads `allProfiles` for quit students.  
Audit required before applying:
```bash
grep -n "allProfiles\|window.__store.profiles" app.js | grep -v "//\|status.*quit"
```

### Step 4: Cache Shifts + Coaches
```javascript
// In attendance.service.js loadShifts():
import { cacheGetOrFetch, makeCacheKey, CACHE_TTL } from '../utils/idb-cache.js';

async loadShifts() {
    const clubId = _clubId();
    return cacheGetOrFetch(
        makeCacheKey('shifts', clubId),
        async () => { /* existing Firestore getDoc */ },
        CACHE_TTL.SHIFTS
    );
},
```

---

## Offline UX Plan

| User Action | Online | Offline |
|---|---|---|
| Mark attendance | ✅ Saves to Firestore | ⏸ Queued in IndexedDB |
| Add transaction | ✅ Saves to Firestore | ⏸ Queued in IndexedDB |
| Add student | ✅ Saves to Firestore | ⏸ Queued in IndexedDB |
| View student list | ✅ Live from onSnapshot | ✅ Shows stale data from last sync |
| View transactions | ✅ Live from onSnapshot | ✅ Shows stale data from last sync |
| Print receipt | ✅ Normal | ✅ Uses cached profile data |
| Export Excel | ✅ Queries Firestore | ❌ Shows error (needs network) |

---

## Expected Read Reduction After Phase 3.4

| Query | Before | After |
|---|---|---|
| `onSnapshot(profRef)` | N reads/update | 2,000 reads max (active only) |
| Quit student lookups | Included in above | 0 (IndexedDB cache, 1hr TTL) |
| `loadShifts()` | 1 read/att-tab-open | 0 (cached 30min) |
| `getCoaches()` | N reads/open | 0 (cached 15min) |

**Estimated monthly read reduction (1,000 student club):**  
`Current: ~3,900,000 reads/month`  
`After 3.4: ~800,000 reads/month (-80%)`
