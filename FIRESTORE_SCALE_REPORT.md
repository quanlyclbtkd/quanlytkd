# Firestore Scalability Report — Phase 3.3 / Bước 3

**Project:** Taekwondo Club Management System  
**Date:** 2026-05-26  
**Scale Target:** 10,000+ students per club  
**Firestore Project:** `quanly-tst`

---

## 1. Critical Issues Fixed in This Phase (13 app.js + 3 service files)

All `getDocs()` calls without `limit()` have been patched with safe limits:

| # | File | Location | Query | Limit Added | Risk Before Fix |
|---|---|---|---|---|---|
| 1 | app.js | ~2306 | profiles full scan (parent club) | `limit(500)` | 10k reads/call |
| 2 | app.js | ~3425 | tx by student name (rename) | `limit(500)` | Unbounded tx scan |
| 3 | app.js | ~3898 | tx by student name (delete) | `limit(500)` | Unbounded tx scan |
| 4 | app.js | ~4564 | tx date range (Excel export) | `limit(2000)` | Full year = 10k+ reads |
| 5 | app.js | ~4571 | tx txMonth range (Excel) | `limit(2000)` | Same as above |
| 6 | app.js | ~4576 | inventory date range (Excel) | `limit(1000)` | Unbounded inv scan |
| 7 | app.js | ~5270 | tx date range (tax report) | `limit(2000)` | Full year scan |
| 8 | app.js | ~7377 | attendance by date | `limit(500)` | All att records per day |
| 9 | app.js | ~7155 | student quarterly attendance | `limit(93)` | 31×3 max per student |
| 10 | app.js | ~7917 | monthly attendance report | `limit(10000)` | All records per month |
| 11 | app.js | ~8115 | monthly attendance export | `limit(10000)` | Same |
| 12 | app.js | ~8863 | coaches list | `limit(200)` | All coaches |
| 13 | app.js | ~750,1797 | clubs list (SuperAdmin) | `limit(200)` | All clubs |
| 14 | app.js | ~2642 | clubs auth fallback | `limit(200)` | All clubs scan |
| 15 | app.js | ~2270 | clubs by parentCode | `limit(50)` | Clubs scan |
| 16 | app.js | ~3209 | clubs dup parentCode check | `limit(10)` | Clubs scan |
| 17 | app.js | ~8436 | coaches list (sync) | `limit(200)` | All coaches |
| 18 | finance.service.js | queryTxByDateRange | tx date range | `limit(2000)` | Unbounded |
| 19 | finance.service.js | queryTxByTxMonthRange | txMonth range | `limit(2000)` | Unbounded |
| 20 | finance.service.js | queryInvByDateRange | inventory range | `limit(1000)` | Unbounded |
| 21 | students.service.js | findTransactionsByStudent | tx by student | `limit(500)` | Unbounded |
| 22 | attendance.service.js | loadByDate | att by date | `limit(500)` | Unbounded |

---

## 2. Remaining Critical Issue (Architectural — Requires Phase 3.4)

### 🔴 CRITICAL: `onSnapshot(profRef)` — Unbounded Real-time Listener

**Location:** `app.js` line ~1594  
**Status:** ⚠️ Warning comment added — limit NOT added (would break app)

```javascript
// ⚠️ [3.3E WARN] onSnapshot(profRef) has NO limit — loads ALL profiles.
// At 10k students = 10k reads/update. Migration: Phase 3.4
activeListeners.push(onSnapshot(profRef, (snap) => {
    allProfiles = {};
    snap.forEach(d => { allProfiles[d.id.trim()] = d.data(); });
    // ...
}));
```

**Why not fixed now:** `allProfiles` drives ALL business logic in the app. Adding `limit()` would silently truncate at the limit, causing incorrect tuition calculations, debt reports, and search results.

**Phase 3.4 Migration Plan:**
```javascript
// Step 1: Active-only listener (covers 99% of use cases)
onSnapshot(query(profRef, where('status', 'in', ['active', 'trial']), limit(1000)), 
    (snap) => { /* populate activeProfiles */ });

// Step 2: Separate quit cache (loaded once, cached in IndexedDB)
async function loadQuitStudents() {
    const snap = await getDocs(query(profRef, where('status', '==', 'quit'), limit(5000)));
    // cache in IndexedDB for 1 hour
}
```

---

## 3. onSnapshot Listener Audit

### ✅ Safe Listeners (have limit or small collection)

| Listener | Collection | Limit | Docs Expected |
|---|---|---|---|
| Club info | `clubs/{id}` | Single doc (getDoc pattern) | 1 |
| Settings | `settings/main_config` | Single doc | 1 |
| Inventory stats | `settings/inventory_stats` | Single doc | 1 |
| Inventory items | `inventory` | `limit(500)` ✅ | ≤500 |
| Transactions by date | `transactions` | `limit(500)` ✅ | ≤500/month |
| Transactions by txMonth | `transactions` | `limit(500)` ✅ | ≤500/month |
| Admin notifications | `adminNotifications` | `limit(50)` ✅ | ≤50 |

### 🔴 Unsafe Listeners

| Listener | Collection | Limit | Docs at Scale |
|---|---|---|---|
| All profiles | `profiles` | ❌ **NONE** | **10,000+** |

---

## 4. N+1 Query Patterns Detected

### N+1 #1: Auth Fallback — getDocs(clubs) then getDoc per club

**Location:** `app.js` line ~2640  
**Pattern:**
```javascript
const _allClubs = await getDocs(query(collection(db, 'clubs'), limit(200)));
for (const _cDoc of _allClubs.docs) {
    // For each club, check coaches subcollection:
    const _coachDoc = await getDoc(doc(db, 'clubs', _cDoc.id, 'coaches', user.uid));
}
```
**Cost:** 1 (clubs list) + N (coach docs) = 1 + N reads  
**Fix:** This only runs on slow-path auth (first login) — acceptable.  
**Better fix:** `collectionGroup('coaches')` query with `where('uid', '==', user.uid)` (requires composite index)

### N+1 #2: SuperAdmin — Load count per club

**Location:** `app.js` loadSuperAdminData()  
**Pattern:**
```javascript
for (const clubDoc of allClubs.docs) {
    const studentCount = await countDocs(query(profiles, where('status', '==', 'active')));
    // ...
}
```
**Cost:** 1 (clubs) + 4N (countDocs per club × 4 queries) reads  
**Fix:** Use `getCountFromServer()` which is already used (cheap) — or cache results.

---

## 5. Duplicate Listener Detection

**Pattern detected:** `listenToData(month)` called in two places:

1. `initSaaSDatabase()` — initial login
2. `filterMonth` onChange event — when user changes month filter

**Each call creates 2 new onSnapshot listeners (`qByDate` + `qByTxMonth`) before unsubbing the old ones via `currentTxUnsub()`.**

**Status:** ✅ Safe — `currentTxUnsub()` correctly called before re-listen. No duplicates.

**Verify:** The `currentTxUnsub = () => { u1(); u2(); }` pattern correctly closes old listeners.

---

## 6. Expensive Query Patterns

### Most Expensive Per-Session Queries

| Query | Cost | Frequency | Optimization |
|---|---|---|---|
| `onSnapshot(profRef)` | 10,000 reads/update | Continuous | ⚠️ Phase 3.4 filter |
| Excel export (full year) | 4,000 reads/export | On demand | ✅ limit(2000) added |
| Attendance monthly report | 10,000 reads/report | On demand | ✅ limit(10000) added |
| Auth fallback clubs scan | 200 reads/login | First login only | ✅ limit(200) added |

### Repeated Queries (Caching Candidates)

| Query | Repeats | Cache Strategy |
|---|---|---|
| `loadShifts()` | On every att tab open | ✅ Already cached in `window._getClubShifts()` |
| `loadInvCategories()` | On settings open | ✅ Cached in `window.invCustomCategories` |
| `loadSuperAdminData()` | On SA tab switch | 🟡 Should cache with 5min TTL |
| Club info onSnapshot | Continuous | ✅ Already a single onSnapshot |

---

## 7. Recommended Composite Indexes

Add to `firestore.rules` / Firebase Console → Firestore → Indexes:

```
// For auth fallback (N+1 fix)
Collection group: coaches
Fields: uid ASC, clubId ASC

// For attendance monthly report (Phase 3.4)
Collection: attendance
Fields: month ASC, branch ASC, status ASC

// For profile filtering by status + branch (Phase 3.4)
Collection: profiles  
Fields: status ASC, branch ASC, joinDate DESC
```

---

## 8. Query Metrics Logging

Added via `js/utils/firestore-guard.js` (Phase 3.3E):

```javascript
// In any getDocs call, use safeGetDocs() instead:
const snap = await safeGetDocs(query(colRef, where('status', '==', 'active')));

// After app loads (dev mode), run:
printQueryAuditReport(); // prints unbounded query report

// Get full audit log:
const log = getQueryAuditLog();
// log = [{ collection, hasLimit, limitValue, ts, stack }, ...]
```

---

## 9. Scalability Thresholds

| Club Size | Profiles onSnapshot Cost | Risk |
|---|---|---|
| 100 students | 100 reads/update | ✅ Free tier safe |
| 500 students | 500 reads/update | ✅ Acceptable |
| 1,000 students | 1,000 reads/update | 🟡 $0.06/100k = $0.0006/update |
| 5,000 students | 5,000 reads/update | 🟠 Phase 3.4 needed |
| **10,000 students** | **10,000 reads/update** | **🔴 Phase 3.4 CRITICAL** |

**Firestore free tier:** 50,000 reads/day  
**At 10,000 students:** 1 profile update = 10,000 reads → free tier exhausted in **5 updates/day**

---

## 10. Action Items Summary

### Immediate (Done in Phase 3.3)
- ✅ 22 `getDocs()` calls given explicit `limit()` guards
- ✅ `firestore-guard.js` with `safeGetDocs()` + audit logging
- ✅ Warning comment on `onSnapshot(profRef)` documenting the risk

### Phase 3.4 (Next Sprint)
- [ ] Filter `onSnapshot(profRef)` to active students only
- [ ] IndexedDB cache for quit student profiles
- [ ] Composite index for `coaches` collectionGroup
- [ ] `getCountFromServer()` for SuperAdmin dashboard counts
- [ ] Retry queue for failed writes (offline support)

### Phase 3.5 (Architecture)
- [ ] Implement `where('status', 'in', ['active', 'trial'])` filter on main profiles listener
- [ ] Paginate SuperAdmin club list (currently all clubs loaded)
- [ ] Service Worker for offline-first architecture
