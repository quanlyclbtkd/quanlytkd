# Phase 4K-6V5U6A — Read Authority Matrix (PRE-IMPLEMENTATION)

Source: V5U5 package, audited before any V5U6A runtime edit.

Classification:
- **REDUNDANT**: same data purpose is read by two normal authorities.
- **INTENTIONAL**: multiple sources are required by compatibility/business semantics.
- **CONDITIONAL FALLBACK**: secondary read executes only when canonical authority cannot supply the data.
- **POTENTIAL IF DEPLOYED**: source exists, but production deployment is not proven from this package.
- **FREEZE / OUT OF SCOPE**: audited but not changed in V5U6A.

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
