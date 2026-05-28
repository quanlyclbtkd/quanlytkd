# Firestore Query Cost Analysis — Phase 3.3 / Bước 3

**Project:** Taekwondo Club Management System  
**Date:** 2026-05-26  
**Firestore Pricing (as of 2026):**  
- Reads: $0.06 per 100,000 documents  
- Writes: $0.18 per 100,000 documents  
- Deletes: $0.02 per 100,000 documents  
- Free tier: 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day

---

## 1. Baseline Cost Estimate — Before Phase 3.3 Fixes

### Per Login Session (Admin)

| Operation | Reads | Notes |
|---|---|---|
| `onSnapshot(profRef)` initial | N | N = total student count |
| `onSnapshot(clubRef)` | 1 | club metadata |
| `onSnapshot(settingsRef)` | 1 | club config |
| `onSnapshot(invStatsRef)` | 1 | inventory stats |
| `onSnapshot(invRef, limit(500))` | ≤500 | inventory items |
| `onSnapshot(qByDate, limit(500))` | ≤500 | monthly tx by date |
| `onSnapshot(qByTxMonth, limit(500))` | ≤500 | monthly tx by month |
| `getDoc(users/{uid})` | 1 | auth lookup |
| `getDoc(clubs/{id}/coaches/{uid})` | 1 | coach auth (if needed) |
| **Session Start Total** | **N + 1,506** | **N = profiles count** |

**At 100 students:** ~1,606 reads per login — ✅ Free tier: covers 31 sessions/day  
**At 1,000 students:** ~2,506 reads per login — ✅ Free tier: covers 19 sessions/day  
**At 10,000 students:** ~11,506 reads per login — ⚠️ Free tier: covers 4 sessions/day

### Per Real-time Update (onSnapshot fires)

| Event | Reads | Notes |
|---|---|---|
| Any profile change | N | onSnapshot(profRef) re-fires |
| Any tx this month | ≤1,000 | Both tx listeners fire |
| Club settings change | 1 | |

**At 10,000 students:** Every attendance mark or tuition payment triggers 10,000+ reads  
**Monthly cost at 10k students (20 coaches × 50 days × 10k):** 10,000,000 reads = **$6.00/month just for the profile listener**

---

## 2. Cost After Phase 3.3 Fixes

### Queries Fixed with Explicit Limits

| Query | Before | After | Reads Saved/Call |
|---|---|---|---|
| Excel export (full year tx) | Unbounded (≤10k+) | `limit(2000)` | Up to 8,000 |
| Excel export (txMonth) | Unbounded (≤10k+) | `limit(2000)` | Up to 8,000 |
| Excel inventory | Unbounded | `limit(1000)` | Up to 4,000 |
| Tax report | Unbounded | `limit(2000)` | Up to 8,000 |
| Monthly attendance report | Unbounded | `limit(10000)` | Bounded |
| Attendance by date | Unbounded | `limit(500)` | Up to 9,500 |
| Student quarterly att | Unbounded | `limit(93)` | Bounded |
| Coaches list | Unbounded | `limit(200)` | Up to 300 |
| findTransactionsByStudent | Unbounded | `limit(500)` | Bounded |
| queryTxByDateRange (service) | Unbounded | `limit(2000)` | Up to 8,000 |

**Estimated monthly savings (medium club, 500 students, 10 exports/month):**  
`10 exports × 8,000 reads saved = 80,000 reads saved ≈ $0.05/month`

---

## 3. Remaining Cost Risk — onSnapshot(profRef)

### Current State (unfixed — too risky to change without Phase 3.4)

```
Monthly cost = session_count × profiles × updates_per_session + background_updates
```

**Scenario A — Small Club (200 students)**
- 5 admins × 30 days × 2 sessions/day = 300 sessions
- Per session: 200 reads
- Background updates (attendance marks): ~500 marks × 200 reads = 100,000
- **Monthly total: 160,000 reads ≈ $0.10/month** ✅ Within free tier

**Scenario B — Medium Club (1,000 students)**
- 10 coaches × 30 days × 3 sessions = 900 sessions
- Per session: 1,000 reads
- Background: 3,000 marks × 1,000 reads = 3,000,000
- **Monthly total: 3,900,000 reads ≈ $2.34/month** 🟡 Acceptable

**Scenario C — Large Club (5,000 students)**
- 20 coaches × 30 days × 4 sessions = 2,400 sessions
- Per session: 5,000 reads
- Background: 10,000 marks × 5,000 reads = 50,000,000
- **Monthly total: 62,000,000 reads ≈ $37.20/month** 🔴 Problematic

**Scenario D — Scale Target (10,000 students)**
- 50 coaches × 30 days × 4 sessions = 6,000 sessions
- Per session: 10,000 reads
- Background: 20,000 marks × 10,000 reads = 200,000,000
- **Monthly total: 260,000,000 reads ≈ $156/month** 🔴🔴 Critical

---

## 4. Phase 3.4 Projected Cost After `onSnapshot(profRef)` Fix

**Fix:** Filter to active students only + IndexedDB cache for quit students

```javascript
// Phase 3.4 plan:
onSnapshot(query(profRef, where('status', 'in', ['active', 'trial']), limit(1000)),
    handler);
```

**Scenario D after fix (10,000 students, 2,000 active):**
- Per session: 2,000 reads (active only, ~80% reduction)
- Background: 20,000 marks × 2,000 reads = 40,000,000
- **Monthly total: 52,000,000 reads ≈ $31.20/month** 🟡 Manageable

**Further optimization (Phase 3.5 — paginated profiles):**
- Use `getCountFromServer()` for aggregate stats (1 read each)
- Use server-side pagination for list views (already done in Phase 3.2A)
- Use `getDoc(profileId)` for individual lookups
- **Projected monthly: 5,000,000 reads ≈ $3/month** ✅ Target

---

## 5. Estimated Listener Costs

### Real-time Listeners Active During Session

| Listener | Collection | Docs Tracked | Cost/Update |
|---|---|---|---|
| `onSnapshot(profRef)` | profiles | ALL (N) | N reads |
| `onSnapshot(clubRef)` | clubs | 1 | 1 read |
| `onSnapshot(settingsRef)` | settings | 1 | 1 read |
| `onSnapshot(invStatsRef)` | settings | 1 | 1 read |
| `onSnapshot(invRef, limit(500))` | inventory | ≤500 | ≤500 reads |
| `onSnapshot(qByDate, limit(500))` | transactions | ≤500 | ≤500 reads |
| `onSnapshot(qByTxMonth, limit(500))` | transactions | ≤500 | ≤500 reads |
| `onSnapshot(adminNotif, limit(50))` | adminNotifications | ≤50 | 50 reads |

**Total per session listen start:** N + 1,553 reads  
**Total per update cycle:** N + 1,553 reads (for any change in any of these collections)

---

## 6. Scalability Limits Analysis

| Club Size | Current Architecture | After Phase 3.4 | After Phase 3.5 |
|---|---|---|---|
| 100 students | ✅ Free tier | ✅ Free tier | ✅ Free tier |
| 500 students | ✅ $2/month | ✅ $0.50/month | ✅ Free tier |
| 1,000 students | 🟡 $10/month | ✅ $2/month | ✅ $0.50/month |
| 5,000 students | 🔴 $50/month | 🟡 $15/month | ✅ $3/month |
| 10,000 students | 🔴 $156/month | 🟡 $40/month | ✅ $8/month |

---

## 7. Write Cost Estimates

### Per Common Action

| Action | Writes | Cost at Scale |
|---|---|---|
| Mark attendance (1 student) | 1 write | Negligible |
| Add student | 2–4 writes | Negligible |
| Quick pay (tuition) | 2 writes (tx + profile) | Negligible |
| Batch exam fee (100 students) | 100 writes (batch) | $0.00018 |
| Delete student + tx cleanup | 1–50 writes | Negligible |

**Write costs are minimal** compared to read costs. Even at 10,000 students doing 50 actions/day:  
`10,000 × 50 × 2 writes = 1,000,000 writes/day ≈ $1.80/day = $54/month` 🟡

---

## 8. Optimization Recommendations (Priority Order)

### P0 — Phase 3.4 (Immediate Next Sprint)
1. **Filter `onSnapshot(profRef)` to active students** — 80% read reduction
2. **Cache quit students in IndexedDB** — eliminate re-reads for quit-student lookups
3. **Use `getCountFromServer()` instead of getDocs for counts** — 1 read vs N reads

### P1 — Phase 3.4 (Same Sprint)
4. **Add composite index `status + branch`** on profiles — faster filtered queries
5. **Cache club config** (settings rarely change) — reduce onSnapshot triggers

### P2 — Phase 3.5 (Future)
6. **Move to fully paginated profile reading** — only fetch visible students
7. **Service Worker offline cache** — avoid re-reading unchanged documents
8. **Implement server-side aggregation** via Cloud Functions — single read for dashboards

---

## 9. Monitoring Plan

After deploying Phase 3.4, monitor in Firebase Console:
- **Firestore Usage tab** → daily reads/writes/deletes
- **Alert threshold:** > 40,000 reads/day (80% of free tier)
- **Budget alert:** Set at $5/month in Google Cloud Billing

**Query metrics logging** (dev mode) via `js/utils/firestore-guard.js`:
```javascript
// Access audit log in browser console:
window._fs_auditLog = getQueryAuditLog();
printQueryAuditReport();
```
