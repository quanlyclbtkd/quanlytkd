# PHASE 4K-6V5U6C1 — Dashboard Mutation-Aware Cache Freshness + Current-Month Authority Guard

**Date:** 2026-08-12  
**Input:** Phase 4K-6V5U6C — Dashboard Stats Single Read Authority + Stale Result Guard  
**Classification:** LOW-RISK DASHBOARD FRESHNESS CORRECTNESS HOTFIX

## 1. Result

**STATUS: PASS**

V5U6C's one Dashboard network authority is preserved. The hotfix separates cache age (TTL) from data freshness, adds per-month mutation dirtiness, revalidates only dirty months through the existing canonical loader, and prevents stale current-month stats from overwriting newer RAM transaction/member evidence.

No Firestore Rules or Cloud Functions source was changed. No new Firestore listener, polling loop, timer loop, transaction production reader, or Dashboard network owner was introduced.

## 2. Baseline before modification

The V5U6C package was extracted and backed up before edits.

Baseline results:

| Command | Result |
|---|---|
| `npm run check:dashboard-single-read-authority` | **36/36 PASS** |
| `npm run check:parallel-read-authority` | **20/20 PASS** |
| `npm run check` | **EXIT 0** |
| `npm run check:all:critical` | **EXIT 0** |

The baseline confirmed the V5U6C single Dashboard network authority was clean before C1.

## 3. Root cause — stale cache after a current-month mutation

### BEFORE

```text
V5U6C canonical localStorage cache
income = 20,000,000
stats txCount = 100
        ↓
new payment / realtime transaction snapshot
        ↓
RAM summary = 20,500,000
local tx count = 101
        ↓
Dashboard invalidation/render
        ↓
TTL cache is still younger than 6 hours
        ↓
_applyCurrentMonthStatsFromPayload(cached payload)
        ↓
old canonical current-month total is reapplied
        ↓
UI can regress to 20,000,000
```

TTL only proves that a cache is young; it does not prove that no relevant data has changed since the cache was produced.

### AFTER

```text
DATA MUTATION
    ↓
markStatsDirty(month, reason, domain)
    ↓
per-month freshness revision / dirtyAt
    ↓
Dashboard hidden?
    ├─ yes → 0 Dashboard reads
    └─ no  → canonical scheduler
                 ↓
        existing TTL + single-flight
                 ↓
        clean months reused from cache
        dirty month revalidated only
                 ↓
        freshness + local evidence guard
                 ↓
   stale stats → preserve newer RAM
   caught-up stats → accept + clear dirty
```

## 4. Implementation

### 4.1 Single mutation-aware freshness state

`js/modules/dashboard.js` now owns one module-local state:

```js
const _dashboardStatsFreshness = {
    revision: 0,
    dirtyMonths: new Map(),
    lastReason: '',
    lastDirtyAt: 0
};
```

The canonical API is exported as `markDashboardStatsDirty(...)` and exposed through the **existing** `window._moduleDashboard.markStatsDirty` namespace. No new standalone `window.X` global was added.

The dirty API performs **no Firestore read and no render**.

### 4.2 Finance mutation integration

In the shared canonical/legacy transaction merge path, immediately after:

```js
window.__store.transactions = allTransactions;
```

V5U6C1 marks the selected transaction month dirty through:

```js
window._moduleDashboard.markStatsDirty(monthStr, 'transactions-snapshot', 'finance');
```

It does not force a stats read from the transaction callback. The existing Dashboard invalidation/scheduler remains the only network trigger path.

### 4.3 Profile/member mutation integration

The active profile listener marks the Vietnam current month dirty for the `members` domain after the canonical active-profile store update.

Coach is explicitly excluded, preserving the Attendance-Only boundary and preventing Dashboard reads for Coach.

### 4.4 Cache schema v3 and per-month reuse

The Dashboard cache version was bumped:

```text
v2 → v3
```

The bundle remains one localStorage payload, but freshness/TTL is evaluated per `monthStats[month]`.

For a six-month bundle:

```js
monthsToFetch = months where:
- month cache is missing; or
- month TTL expired; or
- month is marked dirty; or
- prior payload recorded it unresolved.
```

Thus a current-month payment no longer invalidates five completed historical months.

### 4.5 Current-month authority guard

A pure RAM decision helper checks current-month stats before they can override the current summary.

Important conditions:

- `0` income/expense remains valid when coverage exists.
- If `stats.txCount < localMonthTxCount`, stats are certainly behind local evidence and are rejected.
- `updatedAt` supports number, `Date`, Firestore `Timestamp.toMillis()`, and `{seconds,nanoseconds}` forms.
- If `stats.updatedAt < dirtyAt` and newer RAM evidence exists, stats are rejected.
- If `stats.updatedAt >= dirtyAt`, stats may be accepted and the corresponding dirty revision can clear.
- `stats.txCount > local count` is still allowed as broader finance coverage when appropriate; this preserves the >1200/local-coverage protection.
- A `members` dirty mark is **not** falsely cleared merely because transaction count is higher. Member freshness requires post-mutation timestamp evidence, or the dirty state stays unresolved.

When stale current-month stats are rejected, the canonical payload uses fresh RAM current-month totals/chart/report values while keeping clean historical months from cache.

### 4.6 Immutable in-flight freshness token

The V5U6C in-flight request token now captures `freshnessRevision` and is frozen at flight start.

The old hazardous pattern:

```text
old flight + newer mutation token
→ relabel old flight as new revision
```

is not allowed.

If a newer revision arrives while the same club/month flight is running:

```text
running old revision
    ↓
new dirty revision
    ↓
reuse current flight (no parallel request)
    ↓
old result fails freshness stale guard
    ↓
exactly one bounded canonical follow-up may be scheduled
```

A stale response cannot clear a newer dirty revision.

### 4.7 Vietnam month boundary

Business current month no longer relies on UTC:

```js
new Date().toISOString().slice(0, 7)
```

The Dashboard current-month helper prefers `window.getLocalToday()` and otherwise resolves with timezone `Asia/Ho_Chi_Minh`, with a local-time-safe fallback.

Dynamic boundary evidence:

| Vietnam local instant | Expected month | Result |
|---|---:|---:|
| 2026-09-01 00:30 | `2026-09` | PASS |
| 2027-01-01 00:15 | `2027-01` | PASS |

## 5. Read behavior BEFORE → AFTER

### Cold Dashboard

```text
V5U6C: <= 6 stats point reads
V5U6C1: <= 6 stats point reads
```

No regression.

### Warm Dashboard, clean TTL cache

```text
stats reads = 0
transaction fallback = 0 when stats coverage is complete
```

Dynamic test: **PASS**.

### Warm Dashboard, current month dirty

```text
Mar–Jul clean cache = 0 reads
Aug dirty          = 1 targeted stats read
```

Dynamic test: **PASS**.

### Dashboard hidden + mutation

```text
mark dirty
Dashboard hidden
→ immediate Dashboard stats reads = 0
```

When the Dashboard becomes active, the canonical scheduler performs one targeted current-month revalidation. Dynamic test: **PASS**.

### Five mutation invalidations inside debounce window

```text
5 dirty marks / scheduler intents
→ one latest canonical targeted read
```

Dynamic test: **PASS**.

## 6. Stale current-month evidence

Regression simulation:

```text
cached/server stats:
  income  = 20,000,000
  txCount = 100

new local transaction evidence:
  RAM income = 20,500,000
  local count = 101
```

Result before server stats catch up:

```text
stats rejected: stats-behind-local-count
Dashboard current income = 20,500,000
RAM preserved
Dirty month remains unresolved
```

When server stats later return:

```text
income = 20,500,000
txCount = 101
updatedAt >= dirtyAt
```

Result:

```text
canonical stats accepted
dirty revision cleared
Dashboard income = 20,500,000
next clean TTL read = 0 network reads
```

All cases: **PASS**.

## 7. Mutation-during-flight evidence

Dynamic deferred-Promise test:

```text
revision N targeted read starts
        ↓
revision N+1 mutation arrives
        ↓
new request reuses same running flight
        ↓
N response resolves
        ↓
N is stale-dropped
N cannot clear N+1 dirty state
        ↓
one bounded follow-up runs
        ↓
server catches up to N+1
        ↓
N+1 accepted; dirty clears
```

Final current total in the test remains the newest **20,700,000 ₫**, proving the old 20,500,000 result cannot overwrite newer RAM.

Result: **PASS**.

## 8. Dashboard single-authority preservation

After C1:

- `js/ui/render.js` Dashboard section contains **0 `getDoc/getDocs` calls**.
- `fetchAndRenderHistoricalCharts()` remains RAM-only compatibility API.
- `tryApplyCurrentMonthStats()` remains RAM-only compatibility API.
- `fetchMonthStats()` is not reintroduced into normal Dashboard render flow.
- `fetchHistoricalDashboardFallback()` remains the only normal Dashboard stats/history Firestore network owner.
- Dirty targeted reads use the **same canonical `getDoc()` call site** inside that loader.
- Existing TTL, hidden-tab gate, compact transaction fallback, and single-flight map are reused.

## 9. Static Firestore read budget

V5U6C baseline and C1 result:

| Runtime primitive | V5U6C | V5U6C1 |
|---|---:|---:|
| `getDoc` family | 31 | **31** |
| `getDocs` family | 56 | **56** |
| `onSnapshot` family | 16 | **16** |

`check:startup-read-budget-freeze`: **8/8 PASS**.

No new Dashboard listener, query family, polling, `setInterval`, or recursive retry was added.

## 10. Existing architecture boundaries preserved

Verified PASS after implementation:

- Club Bootstrap Single Read Authority.
- Initial Snapshot Access Gate.
- Auth Context Single Writer.
- Notification Single Read Authority.
- Dashboard Single Read Authority.
- Transaction canonical/legacy mutually exclusive.
- Tuition command behavior.
- Inventory ledger reconciliation.
- Attendance canonical ownership.
- Coach Attendance-Only Read Boundary.
- Coach branch security / CS1 + `Mặc định` compatibility.
- Production stability gate.

No Tuition/Debt/Inventory/Attendance/Exam business logic was changed by C1.

## 11. Regression results — final source after `build:public`

Mandatory targeted commands:

| Command | Final result |
|---|---|
| `check:syntax` | PASS — 244 items |
| `check:club-bootstrap-single-read-authority` | PASS |
| `check:club-initial-snapshot-access-gate` | PASS |
| `check:auth-context-single-writer` | PASS |
| `check:notification-single-read-authority` | PASS |
| `check:parallel-read-authority` | **24/24 PASS** |
| `check:startup-read-budget-freeze` | **8/8 PASS** |
| `check:dashboard-single-read-authority` | **38/38 PASS** |
| `check:dashboard-cache-freshness-guard` | **45/45 PASS** |
| `check:dashboard-stats` | PASS |
| `check:dashboard-history-fallback` | PASS |
| `check:dashboard-historical-authority` | PASS |
| `check:dashboard-chart-lifecycle` | PASS |
| `check:dashboard-recompute-before-island` | PASS |
| `check:spark-read-cost-hardening` | PASS |
| `check:canonical-transaction-safe-cutover` | PASS |
| `check:firestore-read-attribution-canonical-tx-boundary` | PASS |
| `check:v5u2-tuition-command-behavior` | PASS |
| `check:inventory-ledger-reconciliation` | PASS |
| `check:attendance-canonical-ownership` | PASS — 141 assertions |
| `check:coach-attendance-only-read-boundary` | PASS |
| `check:security-coach-branch-boundary` | PASS |
| `check:production-stability-gate` | PASS |

Aggregate suites after final runtime build:

```text
npm run check              → EXIT 0
npm run check:all:critical → EXIT 0
npm run check:all          → EXIT 0
```

During implementation, a few older static compatibility gates initially rejected the **new C1 cache-bust/build marker** even though runtime behavior was unchanged; those gates were updated only to recognize the later compatible build marker. Their behavioral assertions were retained. A pre-build public-mirror assertion also correctly failed until `npm run build:public` synchronized root → public. All final gates are clean.

## 12. New/extended regression coverage

### New

`tools/check-dashboard-cache-freshness-guard.mjs`

Covers:

- stale cache after payment;
- server catch-up;
- historical cache reuse;
- repeated invalidations;
- mutation during in-flight request;
- hidden Dashboard zero-read behavior;
- Vietnam month/year boundary;
- freshness metrics;
- immutable request revision.

### Extended

`tools/check-dashboard-single-read-authority.mjs`

Now freezes targeted per-month acquisition and immutable freshness-flight ownership while retaining all V5U6C single-authority guarantees.

`tools/check-parallel-read-authority.mjs`

Now detects any future attempt to add a second Dashboard mutation/current-month network reader.

## 13. Root/public synchronization

`npm run build:public` completed successfully.

Full runtime same-path comparison:

```text
runtime files checked = 122
public missing root files = 0
root/public differing files = 0
```

Key runtime SHA-256 values:

| File | SHA-256 |
|---|---|
| `index.html` | `c95f0b00dd0782be51afcf3a0b0e32fcdfaa7a91e81fab6176a1ffe04cfc1456` |
| `app.js` | `6aadac665dcacec5868272dc0bd3950ca9b77776bdf3734d4b3b5943fc583910` |
| `js/main.js` | `ed6df754cf3824cca7c8cf75e0ee1f960d653578b908522ffec91dd09a5711c3` |
| `js/modules/dashboard.js` | `d0f5efa76f3be40e6bcb612ecc5a789480cd6e8e02ff491b8368b3547df7e13c` |
| `js/ui/render.js` | `49672e235a664b357ecb65d0a57b75bc7e51addd1a241a2c21a01005db01804b` |
| `js/listeners/profiles.listeners.js` | `1caaca214256c53e37c2e7b107ec8d91a670ce68b0f5ac904c77f460124518e5` |

## 14. Rules / Cloud Functions freeze

Byte identity versus V5U6C backup:

| File | SHA-256 | Result |
|---|---|---|
| `firestore.rules` | `56522af42761702329e1fb0d730f321d18b22e81de6a8b8a6e74b2cf270c271a` | unchanged |
| `functions/index.js` | `77aeef0c77e84394201e39b3cc273631fb96e534ccb5f2c2fb48ef8a61d8c7dc` | unchanged |
| `functions/src/superAdminSummary.js` | `a16415f195bb6f2fc666ca5006fd8cee41a3ee5ef30b2004fb8514c25347926b` | unchanged |

No Rules or Functions deployment is required specifically for C1.

## 15. Files changed

### Runtime source

- `app.js`
- `index.html`
- `js/main.js`
- `js/modules/dashboard.js`
- `js/ui/render.js`
- `js/listeners/profiles.listeners.js`

### Test/package metadata

- `package.json`
- `tools/check-dashboard-cache-freshness-guard.mjs` — new
- `tools/check-dashboard-single-read-authority.mjs`
- `tools/check-parallel-read-authority.mjs`
- compatibility checker marker updates for the new C1 runtime cache-bust/build marker.

`public/` was generated from root source via `npm run build:public`; it was not edited independently.

## 16. Live/manual smoke-test note

The source package does not contain production credentials and this verification deliberately did **not** write test transactions into a live production Firebase project.

Instead, the regression gate executes deterministic runtime simulations for:

- payment mutation after stale cache;
- cross-snapshot transaction evidence;
- delayed server stats catch-up;
- hidden Dashboard mutation;
- in-flight race / latest revision;
- current total preservation.

These simulations pass. A production canary payment remains appropriate after deployment using a non-critical test account/CLB.

## 17. Known remaining issues deliberately NOT fixed

These remain outside V5U6C1 scope:

1. **Attendance Daily Single Read/Refresh Authority + Latest-Wins Guard** — planned V5U6D.
2. **Cloud Functions/client stats writer deployment overlap** — source overlap exists, but production deployment status remains **UNKNOWN**; reader convergence in C1 does not alter writers.
3. **Rule-level `accountStatus` / expiry enforcement** — remains for a later security phase; Firestore Rules are intentionally unchanged here.
4. Legacy global ownership debt remains; C1 did not perform global refactoring.

The system is therefore **not claimed to be globally single-flow**. V5U6C1 only closes the Dashboard freshness correctness gap while preserving the V5U6C reader boundary.

## 18. Definition of Done

All V5U6C1 acceptance points are satisfied:

- ONE normal Dashboard network authority: PASS.
- Cached current-month stats cannot overwrite newer transaction RAM: PASS.
- Dirty current month revalidates only through canonical owner: PASS.
- Clean historical months are reused: PASS.
- Current mutation normally costs <= 1 targeted stats read: PASS.
- Clean TTL hit costs 0 reads: PASS.
- Hidden mutation costs 0 immediate Dashboard reads: PASS.
- Stale revision cannot clear newer dirty state: PASS.
- Old flight cannot masquerade as newer freshness revision: PASS.
- Vietnam month boundary: PASS.
- Club Bootstrap / Auth / Notification / Transaction / Tuition / Inventory / Attendance / Coach boundaries: PASS.
- `npm run check`: EXIT 0.
- `npm run check:all:critical`: EXIT 0.
- `npm run check:all`: EXIT 0.
- root/public synchronization: PASS.

**Phase 4K-6V5U6C1 is ready for final clean package verification.**

## 19. Final ZIP extraction verification

A clean ZIP was created, extracted into a brand-new temporary directory, and the tests were executed from **the extracted package itself**, not from the working directory.

Final extracted-package targeted gates all PASS, including:

```text
check:syntax
check:dashboard-cache-freshness-guard
check:dashboard-single-read-authority
check:parallel-read-authority
check:startup-read-budget-freeze
check:club-bootstrap-single-read-authority
check:club-initial-snapshot-access-gate
check:auth-context-single-writer
check:notification-single-read-authority
check:canonical-transaction-safe-cutover
check:v5u2-tuition-command-behavior
check:inventory-ledger-reconciliation
check:attendance-canonical-ownership
check:coach-attendance-only-read-boundary
check:security-coach-branch-boundary
check:production-stability-gate
```

Aggregate results on the extracted package:

```text
npm run check              → EXIT 0
npm run check:all:critical → EXIT 0
npm run check:all          → EXIT 0
```

One combined long-running shell invocation initially exhausted its overall tool time budget after `check` and `check:all:critical` had already returned EXIT 0 while `check:all` was still running. `check:all` was then rerun independently on the same extracted package and completed with **EXIT 0**. No aggregate failure was hidden or treated as PASS.

The ZIP exclusion audit confirmed no `node_modules`, `.git`, `.env`, `.phase_logs`, log/temp files, service-account JSON, PEM/P12 file, or private-key file is included.
