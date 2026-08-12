# PHASE 4K-6V5U6B — Club Bootstrap Single Read Boundary + Initial Snapshot Access Gate

## 1. Executive summary

Phase V5U6B converges the normal tenant bootstrap for `clubs/{clubId}` from two read authorities into one canonical realtime authority.

### BEFORE

```text
VERIFIED AUTH CONTEXT
        ↓
getDoc(clubs/{clubId})
        ↓
accountStatus / expiryDate check
        ↓
protected ready events
        ↓
downstream tenant readers
        ↓
onSnapshot(clubs/{clubId})
        ↓
realtime club state
```

The old expiry/status point-read error path was warning-only, therefore the protected runtime could continue after the root club document could not be safely verified.

### AFTER

```text
VERIFIED AUTH CONTEXT
        ↓
ONE onSnapshot(clubs/{clubId})
        ↓
FIRST SNAPSHOT
        ↓
ACCESS VALIDATION
        ↓
clubData/store commit
        ↓
clubAccess.ready = true
        ↓
app:context-ready
        ↓
app:db-ready
        ↓
app:shell-ready
        ↓
downstream tenant readers
        ↓
SAME ROOT LISTENER CONTINUES REALTIME
```

Normal tenant startup no longer performs a point `getDoc(clubs/{clubId})` for access bootstrap. Missing/locked/expired/read-error/registration-error paths fail closed before protected downstream readers mount.

No Firestore Rules or Cloud Functions were changed.

---

## 2. Source and baseline

Input source: **Phase 4K-6V5U6A — Firestore Read Authority Convergence + Startup Read Budget Freeze**.

A pristine copy and a separate backup were created before implementation.

### Baseline regression before product changes

The following V5U6A/V5U5 gates completed PASS before implementation:

- `check:admin-credential-single-source`
- `check:auth-context-single-writer`
- `check:legacy-global-freeze`
- `check:superadmin-auth-principal-alignment`
- `check:superadmin-hotfix`
- `check:superadmin-audit`
- `check:superadmin-monthstats`
- `check:security-coach-branch-boundary`
- `check:coach-attendance-only-read-boundary`
- `check:coach-branch-runtime-repair`
- `check:listener-ownership-boundary`
- `check:global-ownership-adoption-cleanup`
- `check:legacy-app-reduction-readiness`
- `check:spark-read-cost-hardening`
- `check:firestore-read-attribution-canonical-tx-boundary`
- `check:canonical-transaction-safe-cutover`
- `check:debt-profile-read-boundary`
- `check:student-name-search-priority`
- `check:production-stability-gate`
- `check:runtime-stability-gate`
- `check:performance-stability-gate`

The original serial `check:syntax` harness exceeded the execution time limit without reporting a syntax failure. This was classified as a **test-environment/harness bottleneck**, not a source regression. `tools/check-syntax.mjs` was changed only to use bounded parallel `node --check` execution while preserving the same scope and assertions. The optimized checker was run against the untouched baseline backup and returned **244/244 PASS (236 JS files + 8 inline scripts)** before V5U6B product changes continued.

No runtime semantics were added to the syntax checker.

---

## 3. Root cause

`initSaaSDatabase(clubId)` had two authorities for the exact same root document:

1. `await getDoc(doc(db, "clubs", clubId))` to decide account lock/expiry access.
2. A later `onSnapshot(clubRef, ...)` to keep club metadata realtime.

This caused:

- approximately one redundant document read per normal tenant login;
- access policy and realtime club state to be owned by separate flows;
- protected ready events to be dispatched before the first root realtime snapshot;
- a fail-open bootstrap hazard because the point-read exception path logged a warning and could continue.

---

## 4. Implementation

### 4.1 Canonical club bootstrap state

A single diagnostics/access state is maintained as `window.__clubAccessBootstrapState` with the following bounded state model:

```text
idle → waiting → ready
             ↘ blocked
             ↘ error
```

It records only bootstrap diagnostics such as generation, clubId, listener key, first-snapshot status, snapshot source, blocked reason and ready timestamp. It contains no password, token or student data.

### 4.2 One root authority

Normal tenant startup now registers exactly one root listener with the canonical key:

```text
global:club:{clubId}
```

through `safeRegisterSnapshot()`.

The same listener supplies:

- first bootstrap data;
- initial access decision;
- club metadata commit;
- later realtime updates;
- later lock/expiry revalidation.

There is no bootstrap listener followed by a replacement realtime listener.

### 4.3 First snapshot Promise/gate

`_mountClubRootAuthority()` exposes one `firstSnapshotPromise` associated with the current verified auth identity and generation.

The promise settles once. Registration failure cannot leave it pending. An ambiguous/stale duplicate registry entry can be removed once and registration retried once; there is no timer, polling or recursive recovery loop.

### 4.4 Access validation

The first snapshot validates:

- document existence;
- `accountStatus` (`missing` remains backward-compatible as `active`);
- `expiryDate` using the existing legacy fallback policy when missing;
- locked state;
- expired state;
- expiry warning within 30 days.

The legacy missing-expiry fallback is not migrated in this phase; it is marked diagnostically via `legacyExpiryFallback`.

### 4.5 Fail-closed policy

Before the first accepted snapshot, each of the following blocks the protected runtime:

- missing club document;
- locked club;
- expired club;
- Firestore permission/listener error;
- listener registration failure;
- stale auth/session generation.

Protected downstream read authorities are not mounted on those paths.

### 4.6 Cache-first snapshot compatibility

If Firestore emits a cached first snapshot, the snapshot source is recorded as `cache`; no second server point read is added.

The same listener revalidates every later server snapshot. A later server-backed locked/expired snapshot performs an idempotent `ready → blocked` transition and cleans protected tenant listeners while preserving the canonical root listener for diagnostics. A blocked session does not auto-bootstrap back to ready; the user must re-login after unlock/renewal.

### 4.7 Stale callback protection

Every root callback is bound to and verifies:

- authenticated UID;
- committed verified-auth UID;
- clubId;
- auth generation.

A delayed Club A snapshot cannot commit data, dispatch ready events or mount runtime after logout/login into Club B or after a later auth generation.

### 4.8 Protected event order

The implementation now guarantees in `initSaaSDatabase()`:

```text
await first root-club snapshot
        ↓
accepted access gate
        ↓
clubData/store already committed
        ↓
app:context-ready
        ↓
app:db-ready
        ↓
app:shell-ready
        ↓
settings / profiles / transactions / inventory / other consumers
```

Coach's automatic first attendance render was deferred until after these ready events. Coach branch verification and attendance-only boundaries were not changed.

---

## 5. Files changed

Runtime/source changes:

- `app.js`
- `index.html` — cache-bust marker only
- `package.json` — registers V5U6B gates

New gates:

- `tools/check-club-bootstrap-single-read-authority.mjs`
- `tools/check-club-initial-snapshot-access-gate.mjs`

Test-harness-only change:

- `tools/check-syntax.mjs` — bounded parallel syntax execution; same `node --check` coverage/semantics.

No changes:

- `firestore.rules`
- `functions/index.js`
- `functions/src/superAdminSummary.js`
- transaction canonical boundary
- tuition/debt computation
- inventory ledger
- attendance business writes/pagination
- exam finance/business logic
- Search V5U3
- Quit authoritative source
- Auth V5U5 single-writer authority

---

## 6. Firestore read budget

The canonical V5U6A runtime-source counter is defined by `tools/check-startup-read-budget-freeze.mjs` and excludes tools/functions/migrations/diagnostics.

| Metric | V5U6A baseline | V5U6B | Delta |
|---|---:|---:|---:|
| `getDoc` family call sites | 33 | 32 | -1 |
| `getDocs` family call sites | 56 | 56 | 0 |
| `onSnapshot` family call sites | 17 | 16 | -1 |

The `onSnapshot` static call-site reduction is from removing the legacy direct root-listener fallback call site; runtime still has exactly **one** root club listener authority.

### Normal tenant root-club startup

Before:

```text
clubs/{clubId} point read = 1
clubs/{clubId} listener authority = 1
```

After:

```text
clubs/{clubId} point read = 0
clubs/{clubId} listener authority = 1
```

No new startup Firestore source, query family, listener, polling loop or cache layer was introduced.

Auth `users/{uid}` verification remains the V5U5 single-flight source and remains at most one verification read per normal login.

---

## 7. Listener ownership

Root listener owner after V5U6B:

```text
key   = global:club:{clubId}
owner = club
scope = global
```

It is registered through the existing ListenerRegistry/safeRegisterSnapshot boundary.

V5U6B does not add a listener owner. The root direct fallback registration path was removed rather than replaced.

The mandatory listener-ownership and parallel-read gates pass with no new owner collision.

---

## 8. Global ownership metrics

Actual V5U6A input vs V5U6B working source:

| Metric | V5U6A | V5U6B |
|---|---:|---:|
| `app.js` bytes | 664,129 | 675,155 |
| `app.js` lines | 10,781 | 10,980 |
| `window.X =` assignments | 533 | 533 |
| duplicate globals (legacy-global gate method) | 159 | 159 |

The runtime read-budget gate's narrower include/exclude method reports 157 duplicate globals after V5U6B, still below its baseline allowance of 159. No new legacy-global debt was introduced.

---

## 9. Firestore Rules / Cloud Functions integrity

`firestore.rules` is byte-identical to V5U6A:

```text
SHA-256 56522af42761702329e1fb0d730f321d18b22e81de6a8b8a6e74b2cf270c271a
```

`functions/index.js` is byte-identical:

```text
SHA-256 77aeef0c77e84394201e39b3cc273631fb96e534ccb5f2c2fb48ef8a61d8c7dc
```

`functions/src/superAdminSummary.js` is byte-identical:

```text
SHA-256 a16415f195bb6f2fc666ca5006fd8cee41a3ee5ef30b2004fb8514c25347926b
```

Cloud Function summary writers are present in source, including profile/transaction summary triggers, callable refresh and scheduled refresh. **Deployment status was not verified from the local source/package and remains UNKNOWN.** No Cloud Function was changed or deployed by V5U6B.

---

## 10. New V5U6B gates

### `check:club-bootstrap-single-read-authority`

**20/20 PASS**

Covers no normal root point read, exactly one root snapshot authority, same listener after bootstrap, ListenerRegistry registration, bounded duplicate handling, Promise settlement and no polling/server point-read replacement.

### `check:club-initial-snapshot-access-gate`

**39/39 PASS**

Covers event order, active Admin/Viewer/Coach, Coach CS1 compatibility, locked, expired, <=30-day warning, missing document, permission error, registration failure, cache→server revalidation, server lock after cache, logout/login generation and stale Club A callback after Club B login.

---

## 11. Required targeted regression result

All mandatory targeted V5U6B regression gates were executed and PASS, including:

- syntax: **244/244**
- auth context single writer: **40/40**
- Admin credential single source
- SuperAdmin principal alignment: **17/17**
- listener ownership boundary
- notification single read authority: **17/17**
- parallel read authority: **14/14**
- startup read budget freeze: **8/8**
- canonical transaction safe cutover
- Firestore read attribution/canonical tx boundary
- Coach attendance-only boundary
- Coach branch security: **35/35**
- V5T write freeze
- V5U1 student status behavior
- V5U2 tuition behavior
- inventory ledger reconciliation
- attendance base/canonical ownership/schedule/offline-shift/shift-filter
- dashboard stats/history fallback/historical authority/chart lifecycle
- Spark read-cost hardening
- Firestore indexes
- diagnostic permissions
- production/runtime/performance stability
- student-name search priority: **43/43**
- student search index/search runtime/cross-tab replay
- debt authoritative tuition coverage / tuition debt source of truth
- Quit authoritative completeness / mobile parity
- SuperAdmin hotfix/audit/monthstats/cache/quota/server-refresh families
- exam upgrade/finance separation: **41 checks PASS**
- runtime smoke static gate: **12/12 PASS**

No required gate was ignored after a failure.

---

## 12. Aggregate test status

Aggregate commands were attempted exactly as requested. Long monolithic runs exceeded the execution harness time limit; they are **not** recorded as aggregate PASS.

- `npm run check` → **TIMEOUT** after completed constituents had PASS. Remaining scripts were executed individually. **51/51 constituents have PASS evidence.**
- `npm run check:all:critical` → **TIMEOUT** after completed constituents had PASS. Remaining scripts were executed individually. **100/100 constituents have PASS evidence.**
- `npm run check:all` → **TIMEOUT** during the sequence. Remaining scripts were executed individually, including a separate rerun of `check:exam-upgrade-finance-separation`. **94/94 constituents have PASS evidence.**

This report deliberately distinguishes an aggregate timeout from the individually verified constituent results.

---

## 13. Runtime smoke interpretation

A live production Firebase session was not available inside the isolated build environment, so V5U6B does not claim a live production-login test.

The access-state runtime simulations plus existing runtime smoke/static regression cover:

- active Admin accepted;
- active Viewer accepted without new writes;
- active Coach accepted only after branch context verification;
- Coach CS1 compatibility retained;
- locked/expired/missing block before downstream runtime;
- cache-active → later server-locked transition;
- rapid logout/login generation separation;
- stale Club A callback cannot activate Club B.

The final deployment should still be canary-tested against the real Firebase project with one Admin, one Viewer and one Coach account.

---

## 14. Full source audit after implementation

### BLOCKER

**None found within V5U6B scope.**

### HIGH — deliberately not fixed in V5U6B

1. **Server-authoritative club lock remains a separate security concern.** V5U6B now fail-closes and realtime-blocks the client runtime from the root club document, but Firestore Rules were intentionally unchanged. A separate phase is still required if lock state must revoke rule-level tenant access independently of client runtime.
2. **Admin replacement stale principal lifecycle** remains outside this read-authority phase; replacing an Admin does not by itself prove that every old Auth principal has been revoked.

### MEDIUM — known parallel/authority debt, intentionally frozen

1. **Dashboard historical dual authority** remains around `tryApplyCurrentMonthStats()`, `fetchAndRenderHistoricalCharts()` and `scheduleDashboardHistoryFetch()`. V5U6B does not modify it.
2. **Attendance refresh/concurrency debt** remains: profile invalidation can coexist with direct `renderAttendanceList()` triggers and daily loading does not yet have a dedicated latest-wins convergence phase.
3. **Potential Cloud Functions/client SuperAdmin stats-writer overlap** exists in source if the Functions are deployed. Source presence is confirmed; deployment status is **UNKNOWN**.
4. **Legacy global ownership debt** remains at 159 duplicate globals by the established legacy-global metric. It did not increase.

### LOW / diagnostic follow-up

1. Legacy club documents without `expiryDate` still use the existing compatibility fallback policy. V5U6B adds diagnostics but does not migrate data.
2. A cached first root snapshot may bootstrap compatibly before a later server snapshot arrives; the same listener immediately revalidates the server state and blocks if it is locked/expired. This is the explicitly requested compatibility policy and no server point-read was added.

---

## 15. Business-domain freeze verification

V5U6B did not alter the following business authorities:

- transaction canonical vs legacy source selection;
- Tuition command/ledger/paid-until/skip-month logic;
- Debt source of truth and debt calculation;
- Inventory ledger/stock/debt-sale/collection logic;
- Attendance writes/monthly pagination/Coach branch authorization;
- Exam registration/fee/upgrade/finance separation;
- Student status and Quit authoritative source;
- Search V5U3 ranking;
- receipt/Excel business behavior.

Regression gates for these domains remain PASS.

---

## 16. Root ↔ public synchronization

`npm run build:public` completed successfully.

Post-build hash comparison covered:

- `index.html`
- `app.js`
- `style.css`
- every file under root `js/**`
- every file under root `css/**`

Result:

```text
runtime root files checked     = 121
public missing root files      = 0
root/public differing files    = 0
```

Post-build V5U6B/auth/security/listener/search/production/syntax gates were rerun and PASS.

---

## 17. Final Definition of Done

PASS:

- ONE `clubs/{clubId}` read authority for normal tenant bootstrap/realtime.
- FIRST SNAPSHOT owns access bootstrap.
- SAME LISTENER owns realtime club state.
- NO root startup `getDoc(clubs/{clubId})` for access decision.
- NO protected ready event before accepted access.
- NO downstream tenant reader before the gate.
- NO fail-open on missing/error first snapshot.
- NO stale login callback can activate another session.
- NO transaction/Tuition/Debt/Inventory/Attendance/Coach/SuperAdmin/Search/Quit regression found by mandatory gates.
- Firestore Rules unchanged.
- Cloud Functions unchanged.
- Read-budget groups do not increase.
- Global/window debt does not increase.
- Root/public synchronized.
- No V5U6B-scope BLOCKER remains.


---

## 18. Final ZIP validation

The final source package is created without `node_modules`, `.git`, `.env*`, cache/temp directories, logs, private keys or service-account key material.

The ZIP is then extracted into a new TEMP directory and the tests are executed against **the extracted package itself**, not the working directory.

Final package gates:

- `check:syntax` — PASS, 244 items
- `check:club-bootstrap-single-read-authority` — PASS, 20/20
- `check:club-initial-snapshot-access-gate` — PASS, 39/39
- `check:notification-single-read-authority` — PASS, 17/17
- `check:superadmin-cache-first-read` — PASS, 16/16
- `check:parallel-read-authority` — PASS, 14/14
- `check:startup-read-budget-freeze` — PASS, 8/8
- `check:auth-context-single-writer` — PASS, 40/40
- `check:superadmin-auth-principal-alignment` — PASS, 17/17
- `check:listener-ownership-boundary` — PASS
- `check:production-stability-gate` — PASS, 22/22

Package cleanliness scan returned no forbidden entry.
