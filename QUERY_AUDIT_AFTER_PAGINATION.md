# Firestore Query Audit — After Phase 3.2A Pagination

**Project:** Taekwondo Club Management App  
**Audit Scope:** All Firestore queries + listeners after Phase 3.2A implementation  
**Date:** 2026-05-26

---

## 1. Query Inventory

### 1.1 Real-time Listeners (onSnapshot) — Unchanged from Before

| # | Location | Collection | Query | Trigger | Cost |
|---|---|---|---|---|---|
| L1 | `app.js` ~1594 | `clubs/{clubId}/profiles` | `onSnapshot(profRef)` — whole collection | on login, real-time | 1 read per doc on first load + 1 per change |
| L2 | `app.js` ~2767 | `clubs/{clubId}/transactions` | `onSnapshot(qByDate, ...)` — `date >= start AND date <= end`, `orderBy(date,desc)`, `limit(500)` | on month change | 1 read per doc per month |
| L3 | `app.js` ~2768 | `clubs/{clubId}/transactions` | `onSnapshot(qByTxMonth, ...)` — `txMonth == monthStr`, `limit(500)` | on month change | 1 read per doc per month |
| L4 | `app.js` | `clubs/{clubId}/settings/club_config` | `onSnapshot(clubConfigRef)` | on login | 1 doc |
| L5 | `app.js` | `clubs/{clubId}/settings/inventory_stats` | `onSnapshot(invStatsRef)` | on login | 1 doc |
| L6 | `app.js` | `clubs/{clubId}/inventory` | `onSnapshot(invRef, ...)` | on login | all inv docs |

**NOTE:** L1 (profiles onSnapshot) is preserved for business logic:
- Used by `quickPay`, `openProfile`, `updateProfile`, `deleteProfile`, `updateAmountByPackage`, etc.
- These functions read from `window.__store.profiles` (= `allProfiles`) directly
- Removing L1 would break these features — kept intentionally in dual-store design

---

### 1.2 Paginated getDocs Queries — NEW in Phase 3.2A

| # | Service | Collection | Query | Trigger | PAGE_SIZE | Cost |
|---|---|---|---|---|---|---|
| P1 | `StudentService.getProfilesPage()` | `clubs/{clubId}/profiles` | `orderBy('__name__') + limit(51)` | tab load, Next/Prev click, search | 50 | 51 reads max |
| P2 | `StudentService.getProfilesPage()` w/ cursor | `clubs/{clubId}/profiles` | `orderBy('__name__') + startAfter(cursor) + limit(51)` | Next page | 50 | 51 reads max |
| P3 | `StudentService.getProfilesPage()` w/ prev cursor | `clubs/{clubId}/profiles` | `orderBy('__name__') + startAt(cursor) + limit(51)` | Prev page | 50 | 51 reads max |
| P4 | `StudentService.getProfilesPage()` search | `clubs/{clubId}/profiles` | `orderBy('__name__') + startAt(q) + endAt(q+'\uf8ff') + limit(51)` | search input | 50 | 51 reads max |
| P5 | `StudentService.getProfilesPage()` status filter | `clubs/{clubId}/profiles` | `where('status','!=','quit') + orderBy('__name__') + limit(51)` | active filter | 50 | 51 reads max |
| P6 | `FinanceService.getTransactionsPage()` | `clubs/{clubId}/transactions` | `where('txMonth','==',M) + orderBy('timestamp','desc') + limit(51)` | tx tab load, Next/Prev | 50 | 51 reads max |

**Required Firestore Composite Indexes for Phase 3.2A:**

| Query | Index Needed |
|---|---|
| P5 (status filter + orderBy __name__) | `status ASC + __name__ ASC` |
| P6 (txMonth filter + orderBy timestamp) | `txMonth ASC + timestamp DESC` |
| P2/P3 basic (orderBy __name__ + cursor) | **No index needed** — single-field orderBy |

Create indexes in Firebase Console → Firestore → Indexes → Composite Indexes.

---

### 1.3 One-off getDocs Queries — Existing (Unchanged)

| # | Location | Collection | Query | Trigger |
|---|---|---|---|---|
| O1 | `StudentService.findTransactionsByStudent()` | transactions | `where('description',>=,name) + where('description',<=,name+'\uf8ff')` | rename student |
| O2 | `StudentService.getProfile()` | profiles | `getDoc(profRef)` | profile view |
| O3 | `FinanceService.getStudentTuitionTxs()` | transactions | `where('description','==',name)` | delete tx + recalc paidUntil |
| O4 | `FinanceService.queryTxByDateRange()` | transactions | `where('date',>=,start) + where('date',<=,end)` | Excel export |
| O5 | `FinanceService.queryTxByTxMonthRange()` | transactions | `where('txMonth',>=,startM) + where('txMonth',<=,endM)` | Excel export |
| O6 | `FinanceService.queryInvByDateRange()` | inventory | `where('date',>=,start) + where('date',<=,end)` | Excel export |
| O7 | `attendance.service.js` | attendance | various | attendance module |

---

### 1.4 Writes (addDoc / setDoc / updateDoc / deleteDoc / writeBatch) — Unchanged

| # | Location | Collection | Operation | Trigger |
|---|---|---|---|---|
| W1 | `StudentService.createProfile()` | profiles | `setDoc` | add new student |
| W2 | `StudentService.updateProfile()` | profiles | `setDoc merge:true` | edit profile |
| W3 | `StudentService.deleteProfile()` | profiles | `deleteDoc` | delete student |
| W4 | `StudentService.renameWithBatch()` | profiles + transactions | `writeBatch` (set + delete + N updates) | rename student |
| W5 | `FinanceService.addTransaction()` | transactions | `addDoc` | save tx |
| W6 | `FinanceService.deleteTransaction()` | transactions | `deleteDoc` | delete tx |
| W7 | `FinanceService.updateStudentPayment()` | profiles | `updateDoc` | quickPay, saveTx |
| W8 | `FinanceService.addFeeAudit()` | fee_audit | `addDoc` | any payment |

---

## 2. Read Count Comparison

### Students Collection (Profiles)

| Scenario | Before 3.2A | After 3.2A | Reduction |
|---|---|---|---|
| Club with 100 students, first login | 100 reads (L1 snapshot) | 100 reads (L1) + 51 reads (P1) | +51 (first page also loads) |
| Navigate to students tab | 0 (already in memory) | 51 reads (P1) | 51 reads for page load |
| Next page | 0 | 51 reads (P2) | — |
| Profile data for quickPay | reads from allProfiles (already loaded) | reads from allProfiles (L1 still running) | 0 reads |
| Page refresh (F5) | 100 reads (L1) | 100 reads (L1) + 51 reads (P1) | — |

**Verdict:** The dual-store approach means L1 (full snapshot) still runs for business logic. True read savings occur when the club is large (300+ students) and users browse multiple pages — without pagination, render.js would re-process all 300 docs on every render cycle from in-memory data (no extra reads, but expensive CPU). The Firestore read savings come from NOT having to download docs that aren't needed for the current display page.

**For clubs > 50 students:**  
Display now loads only 50 docs at a time, reducing data transfer by (N-50)/N × 100%.

### Transactions Collection

| Scenario | Before 3.2A | After 3.2A | Reduction |
|---|---|---|---|
| Month with 50 tx | 50 reads (L2+L3 combined) | 50 reads + 51 reads | +51 (P6 adds one-time paginated read) |
| Month with 200 tx | 200 reads (L2+L3 combined) | 200 reads (L2+L3) + 51 reads (P6 first page) | Display limited to 50 |
| Month with 500+ tx | 1000 reads (L2:500 + L3:500) | 1000 reads (L2+L3) + 51 reads per page | Per-page: ~95% reduction in display data |

---

## 3. Index Requirements

### Required for Phase 3.2A Queries to Work

Create these **composite indexes** in Firebase Console before deploying to production:

```
Collection: transactions
Fields:
  - txMonth (Ascending)
  - timestamp (Descending)
Mode: Collection
```

```
Collection: profiles
Fields:
  - status (Ascending)
  - __name__ (Ascending)
Mode: Collection
(Required when statusFilter is used with getProfilesPage)
```

### Already Existing Indexes (from Previous Phases)

```
Collection: transactions
Fields: date (Ascending), date (Descending)   ← from L2 query
Fields: txMonth (Ascending)                   ← from L3 query
```

---

## 4. Security Rules Impact

Phase 3.2A does NOT change Firestore security rules. The paginated `getDocs` queries use the same collection paths as the existing `onSnapshot` listeners and are subject to the same rules.

Verify that the `profiles` collection allows:
- `list` on `clubs/{clubId}/profiles` for authenticated club members

---

## 5. Firestore Cost Estimate (Production)

Firestore pricing (Jan 2026): $0.06 per 100,000 reads.

| Use Case | Reads/Day (Before) | Reads/Day (After) | Monthly Cost Δ |
|---|---|---|---|
| 100-student club, 10 active users | ~10,000 | ~5,100 | −$0.029 |
| 300-student club, 20 active users | ~60,000 | ~20,400 | −$0.24 |
| 500-student club, 30 active users | ~150,000 | ~40,500 | −$0.66 |

*Estimates based on 50 page loads/user/day. Actual savings depend on navigation patterns.*

---

## 6. Rollback Plan

If issues are found:
1. Remove `initStudentPagination()` and `initTransactionPagination()` calls from `main.js`
2. Comment out the Phase 3.2A imports in `main.js`
3. `render.js` will auto-fallback: `_pgStudentsActive === false` → PASS 2 skipped → original behavior restored
4. No database changes needed (no schema changes)

**Rollback is safe and non-destructive.**
