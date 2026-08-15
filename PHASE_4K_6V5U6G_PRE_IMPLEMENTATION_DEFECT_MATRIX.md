# PHASE 4K-6V5U6G — Pre-Implementation Defect Matrix

Baseline: PHASE 4K-6V5U6F. Audit performed before code changes.

| ID | Priority | module | symptom | root cause | current authority | affected data | severity | reproducible | planned patch | read impact | write impact | listener impact | regression risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G-001 | P0 | `js/modules/attendance.js` | Morning/Evening offline mutations for same day can overwrite each other | localStorage key is `offline_att_${clubId}_${date}` and omits shift/doc identity | Attendance module offline sync owner | attendance daily records | data loss/cross-shift overwrite | YES (static + deterministic) | V2 per-record journal keyed by club/date/shift/docId | 0 | same canonical AttendanceService writer | 0 | medium |
| G-002 | P1 | `js/modules/attendance.js` | One toggle queues the entire class snapshot | `_saveAttOffline()` loops `_attCurrentProfiles` | Attendance module offline sync owner | pending attendance mutations | stale replay / unnecessary writes | YES | enqueue changed record(s) only; coalesce same docId | 0 | reduces queued writes | 0 | medium |
| G-003 | P1 | `js/modules/attendance.js` | Successful single/bulk online write clears unrelated pending records | success/finally removes whole day key | Attendance module online writer + offline owner | pending attendance records | silent pending-data loss | YES | scoped V2 cleanup; bulk cleanup only after commit | 0 | no new writer | 0 | medium |
| G-004 | P1 | `js/modules/attendance.js` | startup + online + manual sync can overlap; sync exceptions are swallowed | no Promise latch; `catch(e){}` in sync loop | Attendance module offline sync owner | offline replay | duplicate/ambiguous sync + invisible failure | YES | one module-local Promise latch + structured error classification | 0 | no retry loop; same writer | 0 | medium |
| G-005 | P1 | `js/listeners/profiles.listeners.js` + Dashboard hydration | truly empty profiles source can retain cached active count | initial hydration uses `coverageComplete: activeCount > 0`; existing zero probe does not close empty case | active profiles listener + existing zero probe; Dashboard RAM reconciliation | dashboard active member count | stale data | YES | when existing probe is empty, reconcile `activeCount:0, coverageComplete:true` | 0 new call-sites | 0 | 0 | low |
| G-006 | P1 | `app.js` + `js/listeners/profiles.listeners.js` | emergency full listener can coexist with active module after recovery | fallback key differs from active key and takeover has no pre-cleanup contract | profiles active module; Admin emergency fallback | profiles RAM/store | duplicate read authority | YES (lifecycle path) | remove `global:profiles:{clubId}` before active mount; fallback registry ownership explicit | 0 | 0 | no additional listener; removes overlap | medium |
| G-007 | P1 | Attendance stats / inventory linkage / fee audit / note notification | secondary consistency writes can fail silently; one inventory linkage failure can bubble after primary transaction success | empty catch or awaited projection after primary commit | existing canonical primary writers; projection writers non-authoritative | derived stats/link/audit/notification | consistency / duplicate-retry risk | YES | keep primary success; emit structured `recordRuntimeError` diagnostic; no blind retry | 0 | no duplicate primary writes | 0 | low-medium |
| G-008 | P2 | event/listener lifecycle | potential duplicate runtime/tab/club event mounts | audit required; no proven duplicate business side-effect found in baseline scan | existing event modules/listener registry | UI/runtime | possible duplicate handler | NOT REPRODUCED | no code change unless test proves duplicate; document audit | 0 | 0 | 0 | low |
| G-009 | P2 | async UI flows | potential late async result overwrite | audit required across search/modals/load-more/etc.; canonical latest-wins guards already present in high-risk Attendance/Dashboard/Search paths | domain-specific owners | presentation | stale UI risk | NOT REPRODUCED | freeze unless reproducible failure is found by gates | 0 | 0 | 0 | low |
| G-010 | P3 | `js/utils/offline-queue.js` | generic offline processor exists beside Attendance offline sync | separate domains; generic queue has no Attendance caller | generic queue owner vs Attendance owner | none currently overlapping | technical debt/name similarity only | NO overlap | intentionally keep separate | 0 | 0 | 0 | none |

## Authority answer before patching

- Auth → verified auth context.
- Club → root club listener.
- Profiles → `profiles.listeners.js`; Admin full listener only as mutually-exclusive emergency recovery.
- Transactions → canonical/legacy transaction authority.
- Dashboard → canonical Dashboard loader + RAM hydration reconciliation.
- Attendance daily → `_requestAttendanceDailyRefresh()`.
- Attendance shifts → `_loadClubShifts()`.
- Attendance offline → `js/modules/attendance.js` only.
- Inventory → canonical inventory ledger / existing transaction writer.
- Debt/Tuition → existing canonical boundaries; frozen in this phase.

## Baseline static budgets before implementation

- `getDoc`: 31
- `getDocs`: 56
- `onSnapshot`: 16
- `window assignments`: 534
- duplicate globals: 156

No Firestore Rules change is planned.
