# PHASE 4K-6V5U6C — Dashboard Stats Single Read Authority + Stale Result Guard

## 1. Executive result

Phase 4K-6V5U6C converges the normal tenant Dashboard stats/history network path onto the existing `scheduleDashboardHistoryFetch()` → `fetchHistoricalDashboardFallback()` authority. The render path is now RAM-only for Dashboard stats/history, while current-month authoritative totals, six-month charts, and the historical report are applied from the same canonical payload and the same request generation.

No Firestore Rules or Cloud Functions were modified. No Tuition, Debt, Inventory, Attendance, Exam, Coach branch, transaction production-listener, Search V5U3, Quit, Auth V5U5, or Club Bootstrap V5U6B business boundary was rewritten.

**V5U6C scope BLOCKER count after implementation: 0.**

---

## 2. Baseline before implementation

Input package: **Phase 4K-6V5U6B — Club Bootstrap Single Read Boundary + Initial Snapshot Access Gate**.

Mandatory baseline gates were run before changing the runtime source and were clean. The protected files were hashed before implementation:

- `firestore.rules`: `56522af42761702329e1fb0d730f321d18b22e81de6a8b8a6e74b2cf270c271a`
- `functions/index.js`: `77aeef0c77e84394201e39b3cc273631fb96e534ccb5f2c2fb48ef8a61d8c7dc`
- `functions/src/superAdminSummary.js`: `a16415f195bb6f2fc666ca5006fd8cee41a3ee5ef30b2004fb8514c25347926b`

Those hashes are identical after V5U6C.

V5U6B runtime static read-call baseline used for the direct before/after comparison:

| Primitive | V5U6B | V5U6C | Delta |
|---|---:|---:|---:|
| `getDoc` family | 32 | 31 | -1 |
| `getDocs` family | 56 | 56 | 0 |
| `onSnapshot` family | 16 | 16 | 0 |

The V5U6A startup-budget manifest remains the upper-bound freeze at 33 / 56 / 17. V5U6C stays below it.

---

## 3. Root cause — BEFORE read graph

Normal Dashboard behavior had three reader paths for the same stats/history purpose:

```text
renderApp / Dashboard render
   ├─ tryApplyCurrentMonthStats(selectedMonth)
   │     └─ fetchMonthStats()
   │           └─ 1 × getDoc(stats/{selectedMonth})
   │
   ├─ fetchAndRenderHistoricalCharts(...)
   │     └─ 5 × getDoc(stats/{historicalMonth})
   │
   └─ scheduleDashboardHistoryFetch()
         └─ fetchHistoricalDashboardFallback()
               └─ 6 × getDoc(stats/{month})
                  + compact transaction fallback if stats incomplete
```

Potential cold stats point reads for one Dashboard cycle:

```text
1 current + 5 legacy history + 6 modern history = up to 12 stats document reads
```

This was not a business-data correctness split in the transaction production listener; it was a **Dashboard reporting read-authority duplication**.

---

## 4. AFTER read graph

```text
Dashboard tab open / invalidate / month change / explicit force refresh
                              ↓
                 scheduleDashboardHistoryFetch()
                              ↓
                  hidden-tab / debounce gate
                              ↓
                    TTL + single-flight
                              ↓
             fetchHistoricalDashboardFallback()
                              ↓
             ONE six-month stats acquisition
                   6 × getDoc(stats/{month})
                              ↓
           compact tx fallback only if coverage missing
                              ↓
                    canonical payload
                    ├─ monthStats
                    ├─ chartData
                    ├─ reportHtml
                    ├─ source
                    └─ fetchedAt
                              ↓
                  stale-result validation
                              ↓
             atomic RAM/presentation application
                 ├─ current summary totals
                 ├─ six-month chart
                 └─ historical report
```

`js/ui/render.js` is no longer a Dashboard Firestore reader. It consumes only the canonical RAM snapshot or RAM fallback presentation data.

---

## 5. Canonical owner and compatibility APIs

### Canonical network owner

Normal Dashboard stats/history reads are owned by:

- trigger aggregator: `scheduleDashboardHistoryFetch()`
- network owner: `fetchHistoricalDashboardFallback()`

The existing API name was intentionally retained to avoid a risky public-API rename during a low-risk convergence phase.

### Legacy `fetchAndRenderHistoricalCharts()`

The API remains for compatibility, but its network authority was removed. It now reads the canonical RAM snapshot and can update chart arrays/UI from already-loaded data only. It contains no `getDoc()` / `getDocs()` call.

### Legacy `tryApplyCurrentMonthStats()`

The API remains for compatibility, but no longer calls `fetchMonthStats()`. It applies the current month from the canonical RAM payload.

### `fetchMonthStats()`

The standalone function remains as an explicit/manual compatibility API. It is **not called by normal Dashboard render or the canonical scheduler path**. This keeps rollback/diagnostic compatibility without creating a second normal Dashboard authority.

---

## 6. Current-month authority preservation

The old standalone current-month point read protected the case where in-memory transaction coverage was incomplete. V5U6C preserves that protection without another read by retaining each selected month stats document inside the canonical six-month payload.

The canonical payload contains normalized `monthStats`, and `_applyCurrentMonthStatsFromPayload(payload)` applies:

- `totalIncomeDashboard`
- `totalExpenseDashboard`
- `totalProfitDashboard`
- mobile summary income

from `payload.monthStats[payload.selectedMonth]` when coverage is proven.

The current summary, chart, and report are applied from the same accepted payload generation. Therefore a late request cannot leave a July summary next to an August chart.

### Zero-value semantics

Authority detection is field-existence/coverage based, not truthiness based. A valid:

```text
income.total = 0
expense.total = 0
```

remains authoritative and does not trigger a transaction fallback merely because the numeric value is zero.

Both flat legacy keys and nested stats shapes are normalized where the existing system requires compatibility.

---

## 7. TTL and single-flight evidence

V5U6C reuses the existing mechanisms rather than adding a second cache/flight layer:

- `_SPARK_HISTORY_TTL_MS` remains the existing six-hour TTL.
- `_sparkHistoryInFlight` remains the single-flight owner.
- the cache schema is versioned to v2 because the canonical payload now includes `monthStats` and additional payload identity fields.
- no PII is added to the Dashboard history cache.

Dynamic regression evidence from `check:dashboard-single-read-authority`:

- 3 simultaneous same-key calls → **exactly 6 stats reads**, not 18.
- single-flight coalesced metric increments.
- repeat call inside TTL → **0 additional stats reads**.
- cache-hit metric increments.
- simultaneous force refreshes for the same key remain single-flighted.

---

## 8. Stale Result Guard

A canonical Dashboard request captures:

- request generation;
- `clubId`;
- `selectedMonth`;
- verified auth generation.

Before any canonical payload mutates summary/chart/report state, the captured identity is compared with the current runtime identity.

If it is stale:

```text
DROP RESULT
```

and increment:

```text
dashboardStaleResultDropped
```

No stale payload may mutate chart, report HTML, canonical snapshot, or current summary.

### Dynamic month race

```text
A = July starts
B = August starts
B resolves → applied
A resolves late → dropped
```

Regression result:

- B applied exactly as final canonical month.
- A applied zero times after becoming stale.
- only the B chart render is accepted.
- stale-result metric increments.

### Dynamic club/auth race

A late Club A payload after logout/switch to Club B is dropped, and the canonical Dashboard snapshot remains Club B.

---

## 9. Hidden Dashboard behavior

The existing V6V1/Spark hidden-tab behavior is preserved:

```text
Dashboard hidden → no history network acquisition
```

An invalidation may record pending intent, but it does not create a background Dashboard stats read merely because profiles/finance/inventory changed while the Dashboard is hidden.

When the Dashboard becomes active, the existing scheduler consumes the intent.

No polling, `setInterval`, recursive refresh, or new listener was introduced.

---

## 10. Transaction fallback

The existing compact historical fallback is preserved. V5U6C does **not** change the production transaction listener or canonical/legacy transaction source selection.

If any non-future stats month lacks required income/expense coverage, one canonical flight may execute the existing compact range set:

- `txMonth` range;
- date range;
- `packageMonths array-contains-any`.

Results continue to deduplicate transaction IDs using `Map`.

V5U6C does **not** reintroduce `6 months × 3 transaction queries`.

If all six stats documents have adequate authority coverage, historical transaction fallback = 0.

---

## 11. Read attribution / metrics

The existing Spark metrics object is reused; no new metrics global was created.

V5U6C tracks:

- `dashboardCanonicalStatsReads`
- `dashboardCacheHit`
- `dashboardSingleFlightCoalesced`
- `dashboardStaleResultDropped`
- `dashboardTransactionFallbackDocs`
- `dashboardCurrentMonthPayloadApplied`

`dashboardStatsRead` is retained as a compatibility diagnostic counter for older safety tooling; it counts the same canonical stats acquisition and does not represent a second reader.

The canonical read-attribution key is:

```text
dashboard.canonicalStatsReads
```

Legacy normal-flow month/history metrics do not gain a second reader path.

---

## 12. Expected READ behavior

### Cold Dashboard

Before:

```text
potential stats point reads ≈ 12
```

After:

```text
canonical stats point reads = up to 6 for the six-month payload
```

If all stats docs have required coverage:

```text
historical transaction fallback = 0
```

### Warm/repeat Dashboard render inside TTL

```text
stats reads = 0
transaction fallback = 0
```

### Render storm / multiple triggers

```text
many triggers → one scheduler intent → one in-flight network acquisition per key
```

---

## 13. Files changed

Runtime/source files intentionally changed:

- `js/modules/dashboard.js`
- `js/ui/render.js`
- `js/main.js`
- `index.html`
- `package.json`

New regression gate:

- `tools/check-dashboard-single-read-authority.mjs`

Existing safety tools were updated only where required to understand the V5U6C canonical Dashboard marker/read-attribution semantics and to freeze the new authority. This included Dashboard authority tests and compatibility marker checks for older phase guards.

`app.js` was not refactored for this phase.

---

## 14. Firestore Rules / Cloud Functions integrity

V5U6C does not require a Rules change or Function change.

Final hashes remain byte-identical to baseline:

- `firestore.rules`: `56522af42761702329e1fb0d730f321d18b22e81de6a8b8a6e74b2cf270c271a`
- `functions/index.js`: `77aeef0c77e84394201e39b3cc273631fb96e534ccb5f2c2fb48ef8a61d8c7dc`
- `functions/src/superAdminSummary.js`: `a16415f195bb6f2fc666ca5006fd8cee41a3ee5ef30b2004fb8514c25347926b`

Cloud Functions stats-writer **source is present**, but source presence does not prove production deployment. Deployment status remains **UNKNOWN**.

---

## 15. Regression results

### New V5U6C gate

`check:dashboard-single-read-authority` → **PASS 36/36**.

It verifies static authority convergence and dynamic single-flight, TTL, force-refresh, zero-value, stale-month, and stale-club behavior.

### Core mandatory gates after final build

All of the following passed on the final working source after `build:public`:

- `check:syntax` — PASS, 244 items (236 JS files + 8 inline scripts)
- `check:dashboard-single-read-authority` — PASS 36/36
- `check:dashboard-stats` — PASS 15/15
- `check:dashboard-history-fallback` — PASS
- `check:dashboard-historical-authority` — PASS
- `check:dashboard-chart-lifecycle` — PASS
- `check:dashboard-recompute-before-island` — PASS
- `check:spark-read-cost-hardening` — PASS
- `check:club-bootstrap-single-read-authority` — PASS 20/20
- `check:club-initial-snapshot-access-gate` — PASS 39/39
- `check:auth-context-single-writer` — PASS
- `check:notification-single-read-authority` — PASS 17/17
- `check:parallel-read-authority` — PASS 20/20 (extended with Dashboard guards)
- `check:startup-read-budget-freeze` — PASS 8/8
- `check:canonical-transaction-safe-cutover` — PASS
- `check:firestore-read-attribution-canonical-tx-boundary` — PASS
- `check:v5u2-tuition-command-behavior` — PASS
- `check:debt-authoritative-tuition-coverage` — PASS
- `check:tuition-debt-source-of-truth` — PASS
- `check:inventory-ledger-reconciliation` — PASS
- `check:attendance-canonical-ownership` — PASS 141 assertions
- `check:coach-attendance-only-read-boundary` — PASS
- `check:security-coach-branch-boundary` — PASS
- `check:student-name-search-priority` — PASS
- `check:quit-tab-authoritative-completeness` — PASS
- `check:quit-tab-mobile-parity` — PASS
- `check:firestore-indexes` — PASS
- `check:diagnostic-permissions` — PASS
- `check:production-stability-gate` — PASS 22/22
- `check:runtime-stability-gate` — PASS
- `check:performance-stability-gate` — PASS

Additional transaction/stats compatibility gates also pass:

- `check:stats-aggregation` — PASS 63/63
- `check:transaction-realtime` — PASS 46/46

### Aggregate command status

The monolithic aggregate commands exceed the available execution window, therefore they are **not reported as aggregate PASS**.

- `npm run check` → **TIMEOUT** during the monolithic chain. Every one of its **52/52 constituent scripts was then executed individually/in bounded chunks and PASS**.
- `npm run check:all:critical` → **TIMEOUT** as a monolithic chain. Every one of its **101/101 constituent scripts was executed individually/in bounded chunks and PASS**.
- `npm run check:all` → **TIMEOUT** as a monolithic chain. Every one of its **95/95 constituent scripts was executed individually/in bounded chunks and PASS**.

No constituent failure was ignored. Legacy static checks that initially rejected the new cache-bust/read-attribution marker were updated only to recognize the newer V5U6C marker/authority; their original behavioral protections remain active.

---

## 16. Root ↔ public synchronization

`npm run build:public` completed successfully.

A same-path hash comparison over:

- `index.html`
- `app.js`
- all `js/**`
- all `css/**`

reported:

```text
runtime files checked = 120
public missing root files = 0
root/public differing files = 0
public-only extra runtime files = 0
```

No file under `public/` was maintained as an independent source of truth.

---

## 17. Global/listener/read-budget freeze

Current `check:startup-read-budget-freeze` result:

```text
getDoc runtime call sites  = 31  (V5U6A allowance <= 33; V5U6B was 32)
getDocs runtime call sites = 56  (allowance <= 56)
onSnapshot call sites      = 16  (allowance <= 17; unchanged from V5U6B)
window assignments         = 533 (allowance <= 534)
duplicate globals          = 157 (allowance <= 159)
```

No Dashboard listener, query family, polling loop, retry loop, or new startup read owner was added.

---

## 18. Full-system audit after implementation

### BLOCKER

- **None found in V5U6C scope.**

### HIGH / pending separate security/writer work

- **Cloud Functions/client stats writer deployment overlap remains unverified.** Function source exists, but production deployment status is UNKNOWN. V5U6C intentionally changes only Dashboard readers, not writer authority.
- **Club `accountStatus` / expiry enforcement at the Firestore Rules layer remains a separate security phase.** V5U6B handles fail-closed client bootstrap/realtime access gating; V5U6C does not alter Rules.

### MEDIUM / known next read-concurrency phase

- **Attendance daily refresh authority is still pending V5U6D.** Existing profile invalidation/direct attendance refresh paths were intentionally not changed here, and the daily request path still needs its own latest-wins convergence scope.

### LOW / technical debt

- Legacy global ownership debt remains. V5U6C does not expand it and does not attempt a broad global migration.

No regression was found in Tuition, Debt, Inventory, Attendance canonical ownership, Coach boundary, Club Bootstrap, transaction cutover, Search V5U3, Quit authority, or SuperAdmin authorization by the mandatory gates.

---

## 19. Deliberately NOT fixed in V5U6C

V5U6C intentionally does not modify:

- Attendance daily refresh/latest-wins convergence — pending **V5U6D**.
- Cloud Functions/client stats writer convergence — deployment overlap **UNKNOWN** and requires a separate writer-authority phase.
- Firestore Rules account lock/expiry enforcement — pending separate security phase.
- transaction production listener architecture.
- Tuition/Debt/Inventory/Exam business logic.
- Coach CS1 + legacy `Mặc định` compatibility.
- Auth V5U5 and Club Bootstrap V5U6B.
- broad legacy global ownership cleanup.

Therefore this report does **not** claim that the entire system has no parallel flow. It claims that the **normal Dashboard stats/history Firestore read authority is converged**.

---

## 20. Definition of Done result

V5U6C acceptance result:

- ONE normal Dashboard Firestore stats authority — **PASS**
- `render.js` Dashboard zero network reads — **PASS**
- no standalone current-month read in normal render — **PASS**
- no legacy historical stats network read in normal render — **PASS**
- current-month authoritative stats retained in canonical payload — **PASS**
- six-month history retained — **PASS**
- TTL retained — **PASS**
- existing single-flight retained — **PASS**
- hidden Dashboard zero-read retained — **PASS**
- stale month response cannot overwrite new month — **PASS**
- stale club/auth response cannot overwrite new context — **PASS**
- compact transaction fallback retained — **PASS**
- no business-boundary regression found by mandatory gates — **PASS**
- Firestore Rules unchanged — **PASS**
- Cloud Functions unchanged — **PASS**
- root/public synchronized — **PASS**
- V5U6C scope BLOCKER — **0**

**Phase 4K-6V5U6C is ready for final clean-package verification.**

---

## 21. Final ZIP package verification

A clean final ZIP is created only from the source tree, excluding `node_modules`, `.git`, `.env*`, caches, temporary/debug logs, service-account files, and private-key candidates.

The ZIP is then extracted into a fresh TEMP directory and tested on the **extracted package itself**, not on the working directory. Final package verification includes:

- `check:syntax` — PASS
- `check:dashboard-single-read-authority` — PASS
- `check:club-bootstrap-single-read-authority` — PASS
- `check:club-initial-snapshot-access-gate` — PASS
- `check:auth-context-single-writer` — PASS
- `check:notification-single-read-authority` — PASS
- `check:parallel-read-authority` — PASS
- `check:startup-read-budget-freeze` — PASS
- `check:dashboard-stats` — PASS
- `check:dashboard-history-fallback` — PASS
- `check:dashboard-historical-authority` — PASS
- `check:production-stability-gate` — PASS
- `check:runtime-stability-gate` — PASS
- `check:performance-stability-gate` — PASS

Extracted-package root/public same-path hash verification also reports:

```text
checked = 120
missing = 0
different = 0
```

Final delivery is permitted only after these extracted-package checks remain green.
