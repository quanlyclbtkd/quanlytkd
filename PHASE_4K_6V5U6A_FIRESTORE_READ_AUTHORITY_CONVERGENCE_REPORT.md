# Phase 4K-6V5U6A — Firestore Read Authority Convergence + Startup Read Budget Freeze

Date: 2026-08-12
Source baseline: `taekwondo_club_phase_4k_6v5u5_canonical_security_truth_hardening.zip`

## Executive result

**STATUS: PASS — no BLOCKER remains inside V5U6A scope.**

V5U6A converges three confirmed redundant client read flows without changing Firestore Rules, Cloud Functions, Auth V5U5, transaction source boundaries, Coach branch behavior, Tuition/Debt, Inventory, Attendance, Exam, Search V5U3, or Quit authority.

Implemented convergence:

1. Admin notifications: realtime `onSnapshot` now owns initial + realtime unread state; `getDocs` is fallback-only and at most once per verified auth generation if the listener fails before first success.
2. SuperAdmin current-month stats: root `clubs/{cid}` data is checked first; `stats/{YYYY_MM}` is read only for clubs whose current-month cache is not provably complete.
3. SuperAdmin automatic server refresh: callable response is merged into already-loaded RAM and rerendered from RAM; successful automatic refresh no longer calls `loadSuperAdminData()` and no longer causes a full client Firestore reload.

The implementation also fixed two correctness hazards discovered while testing the cache-first path: `Number(null) === 0` had the potential to turn unknown student/revenue cache values into false “complete” zero values. V5U6A now keeps `null/undefined/unknown` as unknown and allows the targeted fallback to run.

---

## A. Baseline regression before implementation

The mandatory baseline was executed on the untouched V5U5 source before runtime edits.

| Command | Baseline result |
|---|---|
| `check:admin-credential-single-source` | PASS 33/33 |
| `check:auth-context-single-writer` | PASS 40/40 |
| `check:legacy-global-freeze` | PASS 20/20 |
| `check:superadmin-auth-principal-alignment` | PASS 17/17 |
| `check:superadmin-hotfix` | PASS |
| `check:superadmin-audit` | PASS |
| `check:superadmin-monthstats` | PASS |
| `check:security-coach-branch-boundary` | PASS 35/35 |
| `check:coach-attendance-only-read-boundary` | PASS 30/30 |
| `check:coach-branch-runtime-repair` | PASS 25/25 |
| `check:listener-ownership-boundary` | PASS |
| `check:global-ownership-adoption-cleanup` | PASS 105 assertions |
| `check:legacy-app-reduction-readiness` | PASS 26 |
| `check:spark-read-cost-hardening` | PASS 17/17 |
| `check:firestore-read-attribution-canonical-tx-boundary` | PASS 34/34 |
| `check:canonical-transaction-safe-cutover` | PASS 27/27 |
| `check:debt-profile-read-boundary` | PASS 23/23 |
| `check:student-name-search-priority` | PASS 43/43 |
| `check:production-stability-gate` | PASS 22/22 |
| `check:runtime-stability-gate` | PASS 17/17 |
| `check:performance-stability-gate` | PASS 27/27 |
| `check:syntax` | initial harness timeout; standalone rerun PASS, 244 items |

Baseline classification: **clean**. The initial syntax timeout was a harness timing issue; the standalone command completed with no syntax error before implementation proceeded.

Baseline static read-budget manifest: `tools/v5u6a-read-budget-baseline.json`.

Baseline runtime call-site counts:

- getDoc family: **33**
- getDocs family: **56**
- onSnapshot family: **17**
- app.js size: **662,494 bytes**
- app.js lines: **10,745**
- app.js `window.X =` assignments: **534**
- duplicate globals app.js ↔ all `js/**/*.js`: **159**

---

## B. Complete Read Authority Matrix — PRE implementation

| Domain | Role | Path / collection | Primitive | Query / scope | Mount / trigger | Canonical owner | Secondary / fallback | Classification | Listener cleanup owner | Expected read behavior | V5U6A action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Auth profile | Admin/Viewer/Coach | `users/{uid}` | getDoc | exact doc | each authenticated login | `app.js::_readUserAuthorizationProfileOnce` | none | CANONICAL | n/a | max 1 verification read/login | FREEZE |
| SuperAdmin principal | SuperAdmin | `super_admins/{uid}` | getDoc | exact own UID | ROOT login before runtime | `app.js::_ensureSuperAdminPrincipal` | bootstrap create only if missing | CANONICAL | n/a | 1 principal check; no tenant data before ready | FREEZE |
| Tenant bootstrap status | Admin/Viewer/Coach | `clubs/{clubId}` | getDoc | exact doc | before tenant listeners | `app.js::initSaaSDatabase` expiry/lock check | root club listener mounts later | POTENTIAL DUPLICATE | n/a | 1 point read + later first listener snapshot | REPORT ONLY → V5U6B |
| Club root realtime | Admin/Viewer/Coach | `clubs/{clubId}` | onSnapshot | exact doc | tenant runtime startup | `app.js::initSaaSDatabase` | bootstrap point read exists earlier | CANONICAL REALTIME | ListenerRegistry owner `club` | initial doc + changes | FREEZE |
| Main config | Admin/Viewer | `clubs/{clubId}/settings/main_config` | onSnapshot | exact doc | tenant startup | settings listener | `js/main.js` lazy settings reads for specific workflows | INTENTIONAL by workflow | owner `settings` | initial config + changes | FREEZE |
| Inventory stats | Admin/Viewer | `clubs/{clubId}/settings/inventory_stats` | onSnapshot | exact doc | tenant startup | inventory stats listener | none normal | CANONICAL | owner `inventory` | initial stats + changes | FREEZE |
| Active profiles | Admin/Viewer | `clubs/{clubId}/profiles` | onSnapshot | `status ==/in activeValues` | tenant startup | `js/listeners/profiles.listeners.js` | bounded active-zero existence probe; full fallback only on failure/legacy data | CONDITIONAL FALLBACK | owner `students` | one active listener; probe only first empty snapshot | FREEZE |
| Active profiles Coach | Coach | profiles | onSnapshot | status + assigned branch | attendance startup | profiles listener | branch-safe getDocs fallback only on listener/query failure | CONDITIONAL FALLBACK | owner `students` | no full-club read | FREEZE |
| Coach CS1 legacy primary | Coach CS1 | profiles | onSnapshot | status + `branch == "Mặc định"` | only when assigned branch CS1 | profiles listener legacy-primary owner | assigned CS1 listener | INTENTIONAL dual source | ListenerRegistry separate legacy key | two scoped listeners, never broad full-club query | FREEZE |
| Active-zero probe | Admin/Viewer/Coach | profiles | getDocs | `limit(1)` (branch scoped for Coach) | first active snapshot only when 0 | profiles listener | full fallback only if probe finds docs | CONDITIONAL FALLBACK | n/a | <=1 doc | FREEZE |
| Full profiles fallback | Admin/Viewer | profiles | getDocs | full collection | only SDK/query/listener error or legacy status evidence | profiles listener fallback | none normal | CONDITIONAL FALLBACK | n/a | never parallel in healthy path | FREEZE |
| Coach profile fallback | Coach | profiles | getDocs | assigned branch aliases only | active listener/query failure | profiles listener fallback | none normal | CONDITIONAL FALLBACK | n/a | branch-safe only | FREEZE |
| Quit authoritative | Admin/Viewer | profiles | getDocs | authoritative full profile snapshot on quit reconciliation | lazy / dirty reconciliation | profiles listener quit authority | active snapshot merged in memory | CANONICAL LAZY | n/a | one single-flight authority when needed | FREEZE |
| Transactions canonical | Admin/Viewer | transactions | onSnapshot | `accountingMonths array-contains selectedMonth` | when canonical cutover enabled | `app.js::listenToData` | none | CANONICAL MODE | finance listener key | exactly 1 listener source | FREEZE / ASSERT |
| Transactions legacy date | Admin/Viewer | transactions | onSnapshot | date range selected month | legacy mode | `app.js::listenToData` | txMonth + packageMonths | INTENTIONAL legacy 3-source | finance listener group | source 1/3 | FREEZE / ASSERT |
| Transactions legacy txMonth | Admin/Viewer | transactions | onSnapshot | `txMonth == selectedMonth` | legacy mode | `app.js::listenToData` | date + packageMonths | INTENTIONAL legacy 3-source | finance listener group | source 2/3 | FREEZE / ASSERT |
| Transactions legacy packageMonths | Admin/Viewer | transactions | onSnapshot | `packageMonths array-contains selectedMonth` | legacy mode | `app.js::listenToData` | date + txMonth | INTENTIONAL legacy 3-source | finance listener group | source 3/3 | FREEZE / ASSERT |
| Inventory active debt | Admin/Viewer | inventory | onSnapshot | `unpaid == true` | tenant startup | app inventory debt boundary | none normal | CANONICAL SHARED | owner `inventory-debt` | stays global because many consumers depend on it | FREEZE |
| Inventory history | Admin/Viewer | inventory | getDocs | paginated date/history constraints | lazy when inventory history requested | pagination owner | no startup full read | CANONICAL LAZY | n/a | page reads only | FREEZE |
| Attendance session/list | Admin/Coach | attendance | getDocs | date/branch constraints | attendance actions/tab | attendance service/module | none normal | CANONICAL LAZY | n/a | role/branch scoped | FREEZE |
| Dashboard current month stats | Admin/Viewer | `stats/{YYYY_MM}` | getDoc | exact month doc | Dashboard visible render | `tryApplyCurrentMonthStats` | current in-memory tx-derived numbers | CONDITIONAL OVERRIDE | n/a | point read when dashboard visible | AUDIT/FREEZE |
| Dashboard historical stats | Admin/Viewer | `stats/{YYYY_MM}` | getDoc | six month point reads | visible dashboard scheduler with TTL/single-flight | `fetchHistoricalDashboardFallback` | compact transaction range fallback if stats incomplete | CONDITIONAL FALLBACK | n/a | cached/single-flight; hidden-tab guard | AUDIT/FREEZE |
| Dashboard legacy historical renderer | Admin/Viewer | stats docs | getDoc | historical months | called from `render.js` legacy path | `fetchAndRenderHistoricalCharts` | modern scheduler also exists | POTENTIAL PARALLEL | n/a | requires audit; no V5U6A rewrite by default | AUDIT ONLY |
| Admin notifications realtime | Admin | `adminNotifications` | onSnapshot | unread, `orderBy(createdAt desc)` | tenant startup | `setupNotifListener` | `checkAdminNotifications` one-shot | **REDUNDANT PRE-V5U6A** | owner `notif` + legacy bridge | first snapshot already supplies initial unread set | **FIX V5U6A** |
| Admin notifications one-shot | Admin | `adminNotifications` | getDocs | unread, order desc, limit 50 | unconditionally 1.2s after startup | should be fallback only | realtime listener | **REDUNDANT PRE-V5U6A** | n/a | duplicates initial purpose | **FIX V5U6A** |
| Login history | SuperAdmin | `login_history` | getDocs | order timestamp desc, limit 500 | tab `loginlog` open | `window.loadLoginHistory` | none | CANONICAL LAZY | n/a | one load per explicit tab switch | FREEZE |
| SuperAdmin clubs list | SuperAdmin | `clubs` | getDocs | limit 200 | SuperAdmin dashboard load | `js/modules/superadmin.js::loadSuperAdminData` | none | CANONICAL | n/a | N root club docs | KEEP |
| SuperAdmin current-month stats | SuperAdmin | `clubs/{cid}/stats/{YYYY_MM}` | getDoc | exact per club | currently for every club after root list | stats doc | root club cache already contains equivalent fields when current-month provenance is provable | **REDUNDANT WHEN ROOT CACHE COMPLETE** | n/a | pre-V5U6A ~N point reads | **FIX cache-first targeted fallback** |
| SuperAdmin auto server refresh | SuperAdmin | callable Functions | callable | club summary | missing-cache background flow | server refresh helper | after success calls full `loadSuperAdminData()` | **REDUNDANT CLIENT RELOAD PRE-V5U6A** | n/a | callable response already applied to `_saClubData` | **FIX in-memory rerender, no auto full reload** |
| SuperAdmin manual refresh | SuperAdmin | callable Functions + existing full loader | callable then loader | one club | explicit user action | manual refresh action | full loader | INTENTIONAL MANUAL behavior | n/a | preserved unless business behavior explicitly changed | KEEP |
| SuperAdmin revenue tab | SuperAdmin | clubs + stats/transactions fallback | getDocs/getDoc/pagination | selected month | explicit revenue tab/action | `app.js::loadSARevenue` | transaction scan if stats unavailable | CONDITIONAL FALLBACK | n/a | lazy, not startup | FREEZE |
| SuperAdmin branch config | SuperAdmin | `settings/main_config` | getDoc | exact doc | branch config action | SuperAdmin module | none | CANONICAL LAZY | n/a | action-only point read | FREEZE |
| Club stats auto cache | Admin/Viewer | root club + stats doc | setDoc (writer, no read authority) | derived from in-memory stores | events/visibility/TTL owner | `clubStatsAutoCache` | Cloud Functions may write overlapping summary | WRITER OVERLAP, not client read | n/a | no new read | AUDIT ONLY |
| Cloud Function profile summary trigger | server | profiles → root club summary | server trigger reads event payload, writes root | onWrite | if deployed | `onProfileWriteSuperAdminSummary` | client auto cache overlaps fields | POTENTIAL IF DEPLOYED | server | no client read, but writer overlap | REPORT V5U6C |
| Cloud Function tx summary trigger | server | tx event → root club summary | server trigger reads event payload, writes root | onWrite | if deployed | `onTransactionWriteSuperAdminSummary` | client auto cache overlaps fields | POTENTIAL IF DEPLOYED | server | no client scan on trigger | REPORT V5U6C |
| Cloud Function callable refresh | server | profiles + transactions | paged reads | explicit callable | if deployed | `refreshSuperAdminSummaryForClub` | scheduled refresh uses same internal scanner | POTENTIAL IF DEPLOYED | server | can scan profiles twice + current-month tx pages | REPORT V5U6C |
| Cloud Function scheduled refresh | server | all clubs then per-club profiles/tx | server list + paged reads | schedule | if deployed | `scheduledRefreshSuperAdminSummaries` | callable/internal same writer | POTENTIAL IF DEPLOYED | server | potential read amplification across all clubs | REPORT V5U6C |

## Pre-implementation findings

1. **REDUNDANT — Notifications:** normal Admin startup mounts unread notification `onSnapshot` and then unconditionally executes `checkAdminNotifications()` for the same initial UI purpose.
2. **REDUNDANT WHEN CACHE COMPLETE — SuperAdmin stats:** `loadSuperAdminData()` always reads `stats/{currentMonth}` per club even when the root club document already contains a current-month keyed revenue cache plus current student counts.
3. **REDUNDANT — SuperAdmin auto refresh:** server response is already applied to `window._saClubData`, but successful background refresh then schedules `loadSuperAdminData()` and re-reads the full club list/stats.
4. **INTENTIONAL — Transactions legacy mode:** exactly three listeners are required for compatibility; canonical mode must remain exactly one and must never run simultaneously with legacy sources.
5. **INTENTIONAL — Coach CS1:** assigned `CS1` + legacy `Mặc định` are two scoped listeners used to preserve legacy primary-branch records without a broad full-club read.
6. **CONDITIONAL FALLBACK — Profiles:** active-zero probe and full/branch fallback are conditional, bounded or guarded; they are not normal parallel authorities.
7. **REPORT ONLY — Club bootstrap:** exact `clubs/{clubId}` is point-read for lock/expiry before a realtime root listener is mounted; potential saving is one document read/login, but this is a protected bootstrap boundary reserved for V5U6B.
8. **POTENTIAL IF DEPLOYED — Functions:** source contains profile/transaction summary triggers, callable refresh and scheduled refresh. Package contents do not prove production deployment; deployment status is **UNKNOWN**.
9. **Dashboard:** modern scheduler is TTL/single-flight/visibility guarded, but a legacy historical renderer remains callable from `render.js`. V5U6A freezes this unless a direct duplicate normal network path can be proven without changing dashboard semantics.

## Baseline static read-call inventory

Manifest: `tools/v5u6a-read-budget-baseline.json`

Runtime include: `app.js`, `js/**/*.js`.
Runtime exclude: `public/**`, `tools/**`, `functions/**`, `js/migrations/**`, `js/diagnostics/**`.

- getDoc-family call sites: **33**
- getDocs-family call sites: **56**
- onSnapshot-family call sites: **17**
- app.js window assignments: **534**
- app.js ↔ js duplicate globals: **159**

These totals are a static freeze metric, not Firestore billing truth.


---

## C. Parallel flow findings after implementation

### REDUNDANT — fixed in V5U6A

**Admin notifications.** Pre-V5U6A normal Admin startup used both an unread `onSnapshot` and an unconditional one-shot unread `getDocs`. The listener initial snapshot already carried the initial unread state. V5U6A removes the unconditional call and retains the GET only as a terminal-listener fallback before first successful snapshot.

**SuperAdmin current-month stats.** Pre-V5U6A every loaded club paid one `stats/{YYYY_MM}` point read even when the root club document already had enough current-month summary data. V5U6A checks exact-month root cache provenance first and only reads the stats document for an incomplete club.

**SuperAdmin automatic server refresh reload.** The callable result was already applied to `_saClubData`, then a delayed `loadSuperAdminData()` reread all clubs/stats. V5U6A removes that automatic reread and recomputes rows/top cards from RAM.

### INTENTIONAL — frozen

**Transaction legacy mode:** exactly three sources remain intentional: date range, `txMonth`, and `packageMonths`. Canonical mode remains exactly one `accountingMonths` source. The branch is mutually exclusive; canonical and legacy cannot mount together.

**Coach CS1 compatibility:** assigned `CS1` plus legacy primary value `Mặc định` remain two scoped listeners. This is intentionally not replaced with a full-club query.

### CONDITIONAL FALLBACK — frozen

Profiles active-zero existence probe and full/branch fallback remain conditional. No normal parallel full + scoped profile authority was added.

### POTENTIAL IF DEPLOYED — report only

Cloud Function summary triggers/callable/scheduled refresh exist in source. Deployment cannot be proven from the package; **DEPLOYMENT STATUS = UNKNOWN**.

---

## D. Admin Notifications — BEFORE → AFTER

### Before

```text
setupNotifListener()
    -> onSnapshot unread notifications
    -> initial snapshot

AND normal startup also called

checkAdminNotifications()
    -> getDocs unread notifications limit(50)
```

Read formula:

```text
listener initial documents + one-shot unread GET documents
```

### After

```text
setupNotifListener()
    -> onSnapshot is canonical initial + realtime source
    -> first success => fallback count 0

listener create/registration/error before first snapshot
    -> checkAdminNotifications({fallback:true})
    -> at most one GET for that verified auth generation
```

Normal read formula:

```text
listener initial documents
```

Normal fallback GET: **0**.

If the canonical listener fails before first success: fallback GET **<= 1**. The fallback once-key includes UID + clubId + verified auth generation, so duplicate setup in the same login cannot multiply reads, while a clean logout/login can receive one fresh fallback if its new listener also fails.

No polling, retry loop, or new listener was added.

---

## E. SuperAdmin reads — BEFORE → AFTER

Let:

- `N` = number of root club documents loaded by the existing bounded clubs list.
- `F` = number of clubs that do **not** have a provably complete current-month root cache.

### Before

```text
clubs list: N documents
+
stats point reads: approximately N
```

### After

```text
clubs list: N documents
+
stats point reads: F
```

where `0 <= F <= N`.

Examples verified by regression simulation:

- 3/3 clubs with valid current-month root cache -> **0 stats reads**.
- 2/3 complete, 1 incomplete -> **1 stats read**.
- stale month marker -> **fallback stats read**.
- empty/missing revenue -> **unknown**, never fabricated as zero.
- empty root cache -> **incomplete**, never treated as a zero-complete cache.

Cache validity rules:

- month-keyed fields such as `cachedMonthlyRevenue[currentMonth]` / `revenueByMonth[currentMonth]` can prove month provenance;
- generic `cachedCurrentMonthRevenue` is accepted only when `superAdminStats.month/currentMonth` proves it belongs to the requested month;
- unknown student/revenue remains `null`/`--`;
- no new cache field or write was introduced.

---

## F. SuperAdmin server refresh — BEFORE → AFTER

### Before

```text
refreshSuperAdminSummaryForClub callable
    -> server response
    -> _applySummaryToClubData(...)
    -> rerender row
    -> setTimeout(loadSuperAdminData)
    -> full clubs getDocs
    -> per-club stats getDoc
```

### After

```text
refreshSuperAdminSummaryForClub callable
    -> server response
    -> _applySummaryToClubData(...)
    -> existing _saClubData updated
    -> _renderSAClubRows(...)
    -> SuperAdminModule.renderSummaryFromLoadedData(...)
    -> 0 automatic client Firestore reload
```

A runtime mock verifies:

- callable executes once;
- loaded club RAM receives student/revenue values;
- row renderer executes from RAM;
- aggregate summary renderer executes from RAM;
- `loadSuperAdminData()` call count = **0** on successful automatic refresh.

Manual user refresh behavior remains unchanged and may still use the existing full loader.

---

## G. Transaction read authority audit

No transaction runtime code was changed.

Invariant remains:

```text
CANONICAL MODE
  accountingMonths array-contains selectedMonth
  -> exactly 1 onSnapshot

LEGACY MODE
  date range
  + txMonth
  + packageMonths array-contains
  -> exactly 3 onSnapshot sources
```

`_desiredTxReadMode === 'canonical'` returns immediately after mounting the canonical source, before legacy listeners are created. Regression gate confirms canonical + legacy are not simultaneous and no fourth source was introduced.

---

## H. Coach dual-listener audit

No Coach read path was changed.

For Coach assigned to `CS1`, source intentionally listens to:

1. records scoped to `CS1`;
2. legacy primary-branch records scoped to `Mặc định`.

This remains a compatibility boundary, not a redundant full-club read. Coach branch permissions, `RoleReadBoundary`, `CoachBranchRuntimeRepair`, and attendance-only read boundary continue to pass regression.

---

## I. Dashboard legacy/canonical audit

Modern path exists and is guarded by:

- visible Dashboard check;
- 250 ms scheduler debounce;
- 6-hour local TTL cache;
- per club/month single-flight;
- compact transaction fallback only when stats are incomplete.

A legacy direct `fetchAndRenderHistoricalCharts()` path also remains in `js/ui/render.js` when Dashboard is active. Source inspection shows that it can still perform historical stats point reads independently of the modern scheduler under some render/invalidation sequences.

**Classification: MEDIUM / AUDIT-ONLY in V5U6A.**

It was deliberately not changed because this phase forbids a Dashboard architecture rewrite and the correct cutover needs a dedicated behavior-parity gate proving chart/report timing before delegating the legacy call to the scheduler. No new dashboard read path was added by V5U6A.

Recommended future phase: a small Dashboard Historical Read Authority Convergence after V5U6B/V5U6C, only if runtime telemetry confirms duplicated normal reads.

---

## J. Club bootstrap duplicate read — REPORT ONLY for V5U6B

Current non-SuperAdmin login still has:

```text
getDoc(clubs/{clubId})
  -> protected expiry/lock bootstrap decision

then later

onSnapshot(clubs/{clubId})
  -> realtime club root authority
```

Potential saving: approximately **1 document read / tenant login**.

This was deliberately not modified because it is a protected bootstrap/security boundary. Proposed next isolated phase: **Phase 4K-6V5U6B — Club Bootstrap Single Read Boundary**.

---

## K. Cloud Functions summary writers — REPORT ONLY for V5U6C

Source present:

- `onProfileWriteSuperAdminSummary`
- `onTransactionWriteSuperAdminSummary`
- `refreshSuperAdminSummaryForClub`
- `scheduledRefreshSuperAdminSummaries` (every 6 hours in source)

Source writer overlap exists with client `clubStatsAutoCache` on root summary fields such as active/profile counts, current-month revenue maps and `superAdminStats`.

The trigger-based writers use event payloads and update root cache incrementally. The explicit/scheduled refresh path can be much more expensive: it pages profiles to count active records, pages profiles again to count all profiles, and pages current-month transactions; the scheduled function also reads the full clubs collection before refreshing clubs sequentially.

**SOURCE PRESENT = YES.**

**DEPLOYMENT VERIFIED = UNKNOWN.** Package source is not proof that these functions are deployed in production.

If deployed, the scheduled/callable refresh path is a potential server-side Firestore read amplifier and should be addressed separately in **V5U6C**. Functions were byte-identical throughout V5U6A.

---

## L. Firestore read budget BEFORE → AFTER

### Static runtime call sites

The static call-site total intentionally does not need to fall because the removed normal reads remain as fallback code sites.

| Metric | V5U5 baseline | V5U6A final |
|---|---:|---:|
| getDoc-family call sites | 33 | 33 |
| getDocs-family call sites | 56 | 56 |
| onSnapshot-family call sites | 17 | 17 |

No new startup Firestore source or query family was introduced.

### Dynamic/authority budget

**Admin notifications**

```text
Before = listener initial docs + one-shot unread GET docs
After  = listener initial docs
Normal extra GET = 0
```

The one-shot fallback still exists only for listener failure and is capped to one per verified auth generation.

**SuperAdmin dashboard**

```text
Before = N root club docs + ~N current-month stats point reads
After  = N root club docs + F current-month stats point reads
0 <= F <= N
```

**SuperAdmin automatic server refresh**

```text
Before = callable work + automatic full client reload
After  = callable work + in-memory client update
Automatic client Firestore reload = 0
```

**Admin/Coach normal startup:** no added startup read authority. `users/{uid}` verification remains max one read/login under V5U5 single-flight.

---

## M. Listener counts / owners BEFORE → AFTER

| Item | Before | After |
|---|---:|---:|
| runtime onSnapshot-family static call sites | 17 | 17 |
| notification canonical listener | 1 | 1 |
| notification normal one-shot GET authority | 1 additional | 0 additional |
| canonical transaction sources | 1 | 1 |
| legacy transaction sources | 3 | 3 |
| Coach CS1 scoped sources | 2 intentional | 2 intentional |
| listener ownership collision | 0 in gate | 0 in gate |

No listener, polling loop, `setInterval`, or recursive recovery flow was added.

---

## N. Global metrics BEFORE → AFTER

V5U6A phase baseline is the actual V5U5 package, not the older V5U4 baseline embedded in the V5U5 legacy-global gate.

| Metric | V5U5 baseline | V5U6A final |
|---|---:|---:|
| app.js size | 662,494 bytes | 664,129 bytes |
| app.js lines | 10,745 | 10,782 |
| `window.X =` assignments | 534 | 533 |
| duplicate globals app.js ↔ all JS | 159 | 159 |

The file grew slightly because the notification fallback guard/diagnostics comments were added. Global writer count decreased by one and duplicate-global count did not increase.

`GlobalOwnershipRegistry`, `legacyAppAudit`, protected business flows and Auth V5U5 writers were not moved.

---

## O. Regression commands — exact status

### New V5U6A gates — final

| Command | Final result |
|---|---|
| `check:notification-single-read-authority` | PASS 17/17 |
| `check:superadmin-cache-first-read` | PASS 16/16 |
| `check:parallel-read-authority` | PASS 14/14, including runtime server-refresh mock |
| `check:startup-read-budget-freeze` | PASS 8/8 |

### V5U5 / SuperAdmin / Coach / read boundaries — final targeted coverage

PASS:

- `check:admin-credential-single-source`
- `check:auth-context-single-writer`
- `check:legacy-global-freeze`
- `check:superadmin-auth-principal-alignment`
- `check:superadmin-hotfix`
- `check:superadmin-audit`
- `check:superadmin-monthstats`
- `check:superadmin-aggregation-hard-stop`
- `check:superadmin-quota-guard`
- `check:superadmin-cache-stats-island-fallback`
- `check:superadmin-render-scope-fix`
- `check:club-stats-auto-cache`
- `check:superadmin-server-summary-cache`
- `check:superadmin-safe-server-refresh`
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
- `check:v5t-command-boundary-write-freeze`
- `check:v5t-command-boundary-behavior`
- `check:v5u1-student-status-command-cutover`
- `check:v5u1-student-status-command-behavior`
- `check:v5u2-tuition-command-cutover`
- `check:v5u2-tuition-command-behavior`
- `check:v5u2e-attendance-excel-sdk-fix` — final PASS 22/22
- `check:student-name-search-priority`
- `check:search-runtime-v2`
- `check:student-search-index`
- `check:cross-tab-search-replay`
- `check:debt-authoritative-tuition-coverage`
- `check:tuition-debt-source-of-truth`
- `check:inventory-ledger-reconciliation`
- `check:quit-tab-authoritative-completeness`
- `check:quit-tab-mobile-parity`
- `check:production-stability-gate`
- `check:runtime-stability-gate`
- `check:performance-stability-gate`
- `check:syntax` — PASS, 244 checked items

Additional `check:all`-only constituent gates executed and PASS:

- `check:transaction-realtime` 46/46
- `check:deploy-package` 12/12
- `check:github-pages-paths` 18/18
- `check:exam-export-belt-sort` 13/13
- `check:active-new-students-filter` 30/30
- `check:tuition-package-month-coverage` 33/33
- `check:superadmin-monthstats` 8/8
- `check:superadmin-hotfix` 27/27

### Aggregate command handling

`npm run check` was attempted as requested. The aggregate process exceeded the harness execution window after `check:v5u1-student-status-command-cutover` had completed and `check:v5u1-student-status-command-behavior` had begun. **Aggregate status = TIMEOUT / interrupted, not PASS.** The remaining tail commands were rerun individually; all **51/51 constituents** of `check` are covered and PASS.

`npm run check:all:critical` was also attempted. It exceeded the harness execution window near the end, after `check:admin-credential-single-source` had completed and `check:auth-context-single-writer` had begun. **Aggregate status = TIMEOUT / interrupted, not PASS.** The remaining commands were rerun individually; all **100/100 constituents** are covered and PASS.

`npm run check:all` was not executed as one monolithic aggregate after the two aggregate timeouts. Instead, the union of `check`, `check:all:critical`, plus the eight `check:all`-unique commands above covers **94/94 `check:all` constituents**, all PASS. This is reported as constituent coverage, not as a claim that the monolithic `npm run check:all` command completed.

### Temporary implementation-time regression finding

An early targeted run of `check:v5u2e-attendance-excel-sdk-fix` failed one public cache-marker assertion before the final public build. Root-side logic already accepted V5U5 as “V5U2E-or-later”, but the public-side assertion did not. The test fixture was aligned with the root assertion; no V5U2E runtime/business logic was changed. Final gate result: **PASS 22/22**.

---

## P. Full system audit after implementation

### BLOCKER

**None in V5U6A scope.**

No evidence from source/regression shows a V5U6A change breaking Auth, SuperAdmin, tenant listeners, students, finance, inventory, attendance, exam, search, quit, reports, mobile/desktop gates, or root/public synchronization.

### HIGH

1. **Potential Cloud Functions read amplification if deployed — deployment unknown.** `scheduledRefreshSuperAdminSummaries` source runs every six hours and refreshes every club. The internal refresh counts profiles through two separate paged scans (active count and profile count) and scans current-month transactions. This can be material at scale. Deliberately not changed in V5U6A; proposed V5U6C.
2. **Admin account lifecycle / stale old Admin principal remains from V5U5 audit.** Replacing an Admin does not prove that the previous Firebase Auth principal is revoked. Outside V5U6A.
3. **Club lock is not fully server-authoritative.** Existing account lock remains primarily a client/business-state boundary rather than a redesigned authorization boundary. Outside V5U6A.

### MEDIUM

1. **Club bootstrap double-read boundary:** exact root club point read before the root realtime listener costs a potential ~1 document/login. Report-only; proposed V5U6B.
2. **Dashboard historical dual authority potential:** legacy direct historical stats reads still coexist with the newer TTL/single-flight scheduler. Source can reach both in normal Dashboard lifecycle under some sequences. No new duplicate path was introduced here; dedicated behavior-parity cutover recommended before removal.
3. **SuperAdmin manual explicit refresh may still full-reload.** This is intentional user-driven behavior and was preserved by requirement.

### LOW

1. `app.js` remains a large legacy kernel with 159 duplicate global names across app/module sources. V5U6A freezes rather than expands this debt.
2. Static Firestore call-site totals remain high because many are lazy/action-specific reads; static count is not billing truth. Future work should continue by authority purpose, not by blindly deleting calls.

---

## Q. Issues deliberately NOT fixed

V5U6A intentionally did not modify:

- Auth V5U5 canonical writer / cache verification;
- Firestore Rules;
- Cloud Functions;
- transaction canonical/legacy cutover;
- Coach CS1 dual scoped source;
- active profile fallback;
- inventory active-debt listener/history pagination;
- Tuition/Debt calculations and ledgers;
- Inventory business writes/stock ledger;
- Attendance writes/report pagination;
- Exam registration/fees/belt upgrade/finance;
- Search V5U3;
- Quit authoritative source;
- receipt / Excel export behavior;
- Club bootstrap point-read boundary;
- Dashboard historical architecture;
- Admin lifecycle revocation;
- server-authoritative club lock redesign;
- App Check / CSP / Cloud Function deployment changes.

---

## R. Root/public synchronization

Final `npm run build:public` completed successfully.

SHA-256 equality:

| Runtime file | Root SHA-256 | Public SHA-256 | Status |
|---|---|---|---|
| `app.js` | `a4047c91948fe06da5e94a9ad2846b590d724466cf4830c9dd738a207ba28926` | same | MATCH |
| `index.html` | `d350c79f88a676482f1a59abba444d8f0008035665b592288e69e3d82fe10e77` | same | MATCH |
| `js/modules/superadmin.js` | `b6abeec36b28154953897d88c1fde9c6fa8d88bbcbeab6edca8b6f654bc1a7f9` | same | MATCH |
| `js/core/superAdminServerRefresh.js` | `6fb040cf2bfcbc71d7d5a3fe879142620d7fed3d5fefa0b623a37f06a81d88fd` | same | MATCH |

Deployment-cache query marker in `index.html` was advanced with `p=firestore-read-authority-convergence-20260812-v5u6a` while retaining prior compatibility markers expected by older regression gates.

Protected unchanged files:

- `firestore.rules` SHA-256: `56522af42761702329e1fb0d730f321d18b22e81de6a8b8a6e74b2cf270c271a` — byte-identical to V5U5.
- `functions/index.js`: `77aeef0c77e84394201e39b3cc273631fb96e534ccb5f2c2fb48ef8a61d8c7dc` — byte-identical.
- `functions/src/superAdminSummary.js`: `a16415f195bb6f2fc666ca5006fd8cee41a3ee5ef30b2004fb8514c25347926b` — byte-identical.

---

## Files changed

### Runtime/source

- `app.js`
- `index.html` — cache-bust only for V5U6A deployment pickup
- `js/modules/superadmin.js`
- `js/core/superAdminServerRefresh.js`

### Regression / audit tooling

- `package.json`
- `tools/check-notification-single-read-authority.mjs`
- `tools/check-superadmin-cache-first-read.mjs`
- `tools/check-parallel-read-authority.mjs`
- `tools/check-startup-read-budget-freeze.mjs`
- `tools/v5u6a-read-budget-baseline.json`
- `tools/check-v5u2e-attendance-excel-sdk-fix.mjs` — test-fixture compatibility only
- `PHASE_4K_6V5U6A_READ_AUTHORITY_MATRIX_PRE_IMPLEMENTATION.md`
- `PHASE_4K_6V5U6A_FIRESTORE_READ_AUTHORITY_CONVERGENCE_REPORT.md`

No `firestore.rules` or `functions/*` source change.

---

## Acceptance criteria conclusion

All 42 V5U6A acceptance criteria are satisfied by final source/regression evidence:

- one normal notification authority;
- targeted listener fallback only;
- root-cache-first SuperAdmin stats;
- stale month rejected;
- unknown never fabricated as zero;
- auto server refresh uses RAM without full loader;
- Auth V5U5 invariant preserved;
- no new startup read source;
- transaction/Coach/profile/inventory/dashboard business boundaries preserved;
- Firestore Rules and Cloud Functions unchanged;
- global/listener counts do not increase;
- stability and syntax gates pass;
- root/public synchronized;
- no BLOCKER remains in V5U6A scope.
