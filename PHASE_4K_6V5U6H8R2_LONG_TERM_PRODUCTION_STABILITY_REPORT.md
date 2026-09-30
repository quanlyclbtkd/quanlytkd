# PHASE 4K-6V5U6H8R2 — LONG-TERM PRODUCTION STABILITY REPORT

## 1. Executive summary

H8R2 was implemented as a low-risk closure on top of H8R1. No second Firestore reader, writer, listener, scheduler, cache authority, Cloud Function, Rules relaxation, profile rename, Attendance migration, or mass transaction migration was introduced.

Automated/source verification is clean:

- `check:long-term-production-stability`: **27/27 PASS**
- `precheck:all:critical`: **EXIT 0**
- canonical `check:release`: **36/36 PASS**
- Production Authority Closure: **64/64 PASS**
- Production Security Trust Boundary: **PASS**
- Attendance Explicit Shift: **60/60 PASS**
- Attendance Daily: **73/73 PASS**
- Attendance Offline Canonical Sync: **39/39 PASS**
- Production Residual Closure: **66/66 PASS**
- Syntax: **246 items PASS**
- Root/public parity: **123/123, missing=0, extra=0, hashMismatch=0**
- Firestore static budget: **getDoc 29 / getDocs 51 / onSnapshot 16** (unchanged from H8R1)

**Release status: H8R2 = NOT READY** because the acceptance contract explicitly requires authenticated runtime smoke, R1–R8 runtime attribution, a 25-cycle active-listener leak measurement, and a 2–4 hour soak. Those cannot be truthfully proven from this non-authenticated container environment. No source regression is currently known; the remaining blocker is runtime release evidence.

---

## 2. Exact defects found

| ID | Severity | Defect |
|---|---|---|
| R2-A1 | P2 | Transaction pagination could initialize while Thu Chi was hidden because DOM existence was treated as active-tab state. |
| R2-B1 | P1 | Attendance daily reader could silently truncate at a fixed upper bound near 1200 records. |
| R2-B2 | P1 | Attendance bulk save could place too many writes in one Firestore batch and did not expose sufficiently precise committed/pending state for partial chunk failure. |
| R2-C1 | P0 | Tuition flow could sequence primary transaction/profile writes, allowing transaction/profile divergence on failure. |
| R2-C2 | P0 | Inventory payment/debt linkage could sequence primary writes, allowing stock/debt/revenue divergence. |
| R2-C3 | P0 | Combo/MultiItem legacy paths could perform multiple independent primary writes and fallback writes. |
| R2-D1 | P2 | Quit authority could full-read profiles solely because a short TTL expired, even with complete clean coverage. |
| R2-E1 | P1 | Exam promotion/reset could exceed Firestore batch limits; retry safety needed deterministic per-student target semantics. |
| R2-F1 | P2 | Main boot 50 ms polling could continue without a hard deadline when legacy dependency never became ready. |
| R2-F2 | P2 | Mobile header had a permanent 3-second synchronization interval in addition to event/observer mechanisms. |
| R2-F3 | P1 | Some legacy user-text render paths could fall back from `escapeHtml` to a raw identity function. |

The complete pre-implementation audit, including authority/read/write/listener/rollback fields, is in `PHASE_4K_6V5U6H8R2_PRE_IMPLEMENTATION_DEFECT_MATRIX.md`.

---

## 3. Root cause per defect

### A — Transaction pagination
The hidden Thu Chi pane remains in the DOM. Checking `document.getElementById('txList')` therefore did not prove that the tab was active. Pagination was coupled to DOM presence instead of the existing active-tab authority.

### B — Attendance scale
`AttendanceService.loadByDate()` previously depended on a fixed-limit read model rather than bounded internal cursor pagination. Bulk writes used a single logical batch path without a hard per-commit chunk ceiling suitable for large clubs.

### C — Financial atomicity
Several business actions prepared and committed canonical data in multiple awaited primary writes. A failure between writes could leave a half-paid or partially linked accounting state. The defect was orchestration, not missing data authority.

### D — Quit reads
The Quit completeness authority used elapsed time as a primary invalidation condition. A complete, unchanged profile snapshot could therefore be re-read just because ~60 seconds elapsed.

### E — Exam batch scale
Promotion/reset loops accumulated writes into one batch. The current business semantics are per-student deterministic promotion/reset rather than all-students-in-session atomicity, so independent student chunks can be committed safely when each student target is idempotent.

### F — long-running runtime
Boot retry lacked a terminal deadline; mobile-header synchronization duplicated event-driven state with a permanent interval; legacy escaping could fail open when the canonical helper was not yet available.

---

## 4. Files changed

Production source changed from H8R1:

- `app.js`
- `index.html`
- `js/main.js`
- `js/core/tuitionCommandBoundary.js`
- `js/listeners/profiles.listeners.js`
- `js/modules/attendance.js`
- `js/modules/finance.js`
- `js/modules/inventory.js`
- `js/services/attendance.service.js`
- `js/services/finance.service.js`
- `js/services/inventory.service.js`
- `package.json`

Generated `/public` equivalents were produced only by the existing build pipeline, not hand-edited.

Test/gate files were updated where old assertions encoded superseded but legitimate H8R2 semantics or imported a stale cache-busted module instance. The new master gate is:

- `tools/check-long-term-production-stability.mjs`

No old assertion was removed merely to make the build pass; cache-instance fixes and atomic/chunk semantics retained or increased coverage.

---

## 5. Functions changed

Key functions/owners modified include:

- Transaction pagination initialization/activation in `js/modules/finance.js` and existing tab activation hook in `js/main.js`.
- `AttendanceService.loadByDate()` — bounded cursor paging inside the existing owner.
- Attendance bulk writer/service — chunk size <=400 with committed/pending metadata.
- Attendance UI bulk/offline cleanup — cleanup only confirmed committed records/chunks.
- `FinanceService.commitAtomicWritePlan()` — atomic-plan primitive added inside the existing FinanceService writer authority.
- `TuitionCommandBoundary.collectTuition()` — one logical canonical atomic plan for transaction + profile tuition state.
- `InventoryService.prepareAddItemMutation()` — pure preparation primitive inside existing InventoryService.
- Inventory add/payment paths — one canonical batch for business-source-of-truth changes.
- `processCombo()` / `transactionForm.onsubmit` / `processMultiItem()` — route primary writes to existing canonical owners/one logical batch; no sequential fallback primary writer.
- Quit profile-loading authority in `js/listeners/profiles.listeners.js` — dirty/completeness-driven invalidation instead of 60-second time-only refresh.
- `processBatchUpgrade()` / `finishExamSession()` — per-student deterministic chunks <=400.
- `_loadMainWhenLegacyReady()` — hard deadline and recoverable fail state.
- mobile-header synchronization — permanent 3-second interval removed.
- legacy HTML escaping fallbacks — fail-closed pure local escaping rather than raw identity fallback.

---

## 6. Existing authority before patch

H8R2 preserved the existing owners:

- Transactions: canonical transaction realtime/write authority already present in H8/H8R1.
- Attendance: `AttendanceService.loadByDate()` and existing Attendance canonical bulk/offline writer.
- Tuition: `TuitionCommandBoundary`.
- General financial transaction writing: existing `FinanceService`.
- Inventory: existing `InventoryService` / Inventory Ledger authority.
- Quit: existing profile/Quit ownership in `profiles.listeners.js`.
- Exam: existing legacy Exam owner/functions in `app.js`.
- Boot/UI synchronization: existing bootstrap and UI hooks.

---

## 7. Proof no new authority was created

The master H8R2 gate statically verifies:

- no hidden second Transaction pagination reader;
- Attendance pagination remains inside `loadByDate()`;
- Attendance bulk remains inside the existing writer;
- no new `FinanceWriterV2`/parallel payment writer;
- transactionForm/Combo/MultiItem do not bypass existing canonical owners;
- no new Quit listener;
- Exam uses its existing owner rather than a replacement writer;
- no new permanent polling authority;
- Firestore static call-site budget is unchanged.

`check:long-term-production-stability` result: **27/27 PASS**.

---

## 8. Firestore static count before/after

| API | H8R1 baseline | H8R2 | Delta |
|---|---:|---:|---:|
| getDoc | 29 | 29 | 0 |
| getDocs | 51 | 51 | 0 |
| onSnapshot | 16 | 16 | 0 |

These are the canonical static-budget counts produced by the project gate's exact attribution patterns, not a broad text grep.

Result: **PASS — no static reader/listener call-site increase**.

---

## 9. Runtime read attribution before/after

### Deterministic/source evidence

- Hidden Transaction tab no longer invokes the pagination initializer based on DOM existence.
- Changing transaction month while hidden only dirties local pagination context.
- Attendance pagination is demand-driven inside one existing call path.
- Quit tab complete/clean state no longer refreshes because 60 seconds elapsed.

### Required authenticated R1–R8 evidence

| Scenario | Status |
|---|---|
| R1 Fresh login → Dashboard only | NOT EXECUTED in authenticated browser |
| R2 Login + wait 10 seconds | NOT EXECUTED |
| R3 Open Students | NOT EXECUTED |
| R4 Open Debt | NOT EXECUTED |
| R5 Open Attendance | NOT EXECUTED |
| R6 Open Inventory | NOT EXECUTED |
| R7 Open Transactions | NOT EXECUTED |
| R8 Return Dashboard | NOT EXECUTED |

Reason: this build environment has no authenticated production/staging browser session and no Admin/Coach/SuperAdmin credentials. Fabricating those counts would violate the acceptance contract.

---

## 10. Listener count before/after

Static listener call sites remain **16 → 16**.

The required real-runtime test — 25 repetitions of Dashboard → Students → Debt → Attendance → Inventory → Transactions → Dashboard, comparing active listener count after stabilization — was **NOT EXECUTED** in an authenticated browser. Therefore `listener leak = 0` is not yet proven for release acceptance, even though no new listener call site was added.

---

## 11. Attendance >1200 test

Master-gate dynamic harness loaded **1,501 Attendance records completely across 4 pages** using the existing `AttendanceService.loadByDate()` owner.

Result: **PASS**.

The service preserves date/branch/explicit-shift filters and supports latest-wins cancellation through current-request validation. If a safety ceiling is reached before complete coverage, the flow fails as incomplete rather than silently rendering truncated data as complete.

---

## 12. Attendance >500 bulk test

Dynamic failure injection used **1,001 records** with chunk size <=400 and forced the second commit to fail.

Observed:

- committed: **400**
- pending/uncommitted: **601**
- no false “all success” result
- committed cleanup is scoped to confirmed committed records
- uncommitted journal entries are retained
- no whole-day `finally` cleanup

Result: **PASS for chunk/partial-failure semantics**.

Attendance Offline Canonical Sync Guard: **39/39 PASS**.

---

## 13. Financial failure-injection results

Implemented semantics:

- Tuition transaction + profile tuition state are committed in one existing FinanceService atomic plan.
- Failure before/at batch commit leaves no transaction/profile half-state.
- Secondary `fee_audit` remains Class 2 and cannot convert canonical success into canonical failure.
- Inventory debt-payment transaction and paid linkage are committed in one batch.
- MultiItem prepares all references/payloads first and commits one logical batch when within safe size.
- A financial plan over the safe operation limit is blocked before the first write rather than split into independent non-atomic batches.
- action-local in-flight guards prevent ordinary double-click duplicate submission without introducing a global idempotency authority.
- H8R1 `profileKey` remains canonical identity; `displayName` remains display-only metadata.

Automated gates covering these boundaries pass, including canonical transaction, debt, inventory ledger, financial action audit, TuitionCommandBoundary behavior/cutover, and Exam payment identity.

Limit: not every C1–C12 case was injected against live Firestore. Production acceptance still requires authenticated smoke/failure observation.

---

## 14. Quit repeated-open read test

Static/behavior gates verify the 60-second time-only condition is removed. The existing Quit authority reloads only when:

- not loaded;
- coverage incomplete;
- dirty/error;
- club/auth context changed;
- explicit force refresh.

Existing profile snapshot ownership supplies dirty signals; no Quit listener was added.

A browser-timed “open 10 times / wait 2 minutes / reopen” authenticated network trace was **NOT EXECUTED** in this environment.

---

## 15. Exam >500 test

Exam promotion/reset now use **chunks <=400** inside the existing Exam owner. The operation was classified as **per-student atomicity**, not whole-session atomicity, because each student promotion is a deterministic target-state mutation.

Retry safety:

- target belt is deterministic;
- already-committed students are not advanced another belt merely because the action is retried;
- committed/pending counts are reported on chunk failure;
- fee/profile identity remains H8R1-safe.

The master/static gates prove the batch cannot exceed the safe size and the existing Exam gates pass. A live Firestore 501/1000-student destructive promotion was intentionally **not performed** without an authenticated test dataset.

---

## 16. Boot timeout test

Bootstrap retry now has a **15,000 ms hard deadline**. After the deadline:

- retry scheduling stops;
- diagnostic state is set;
- runtime error recording is attempted through the existing diagnostic hook;
- a recoverable message asks the user to reload;
- no automatic reload loop is introduced.

Master static gate: **PASS**. Normal syntax/release startup gates also pass.

---

## 17. XSS escaping test

Production Security Trust Boundary / Stored-XSS gate validates the major user-controlled rendering boundaries, including Students, Attendance, Transactions, Inventory, Exam, SuperAdmin and login history.

Stored-XSS sub-gate: **38/38 PASS** during release verification.

Legacy patterns equivalent to `window.escapeHtml || (s => s)` were replaced by fail-closed behavior. No competing global escaping authority was created.

---

## 18. Regression results

Final automated evidence:

- `check:long-term-production-stability`: **27/27 PASS**
- `precheck:all:critical`: **EXIT 0**
- `check:release`: **36/36 PASS**
- Production Authority Closure: **64/64 PASS**
- Production Security Trust Boundary: **PASS**
- Profile Referential Guard: **11/11 PASS**
- Attendance Explicit Shift: **60/60 PASS**
- Attendance Daily: **73/73 PASS**
- Attendance Offline Canonical Sync: **39/39 PASS**
- Production Residual Closure: **66/66 PASS**
- DB Ready Guards: **14/14 PASS**
- Runtime Month + Admission Hydration: **38/38 PASS**
- Deploy Package: **12/12 PASS**
- Syntax: **246 checked, PASS**

Failure-injection logs such as `wrong-club`, `invalid-shift`, forced ledger failures and `legacy commit failed` are deliberate test fixtures; the release command exited successfully.

---

## 19. Root/public parity

After the final source build using the existing pipeline:

```text
rootFileCount   = 123
publicFileCount = 123
missing         = 0
extra           = 0
hashMismatch    = 0
status          = PASS
```

`/public` was not manually patched.

---

## 20. Authenticated runtime smoke

**NOT EXECUTED — RELEASE BLOCKER.**

Required but not provable in this container:

ADMIN:
- login;
- Dashboard;
- Students + displayName edit;
- Debt;
- tuition payment test;
- Attendance + multi-shift;
- Inventory;
- Transactions;
- Exam;
- Quit;
- Search.

COACH:
- login;
- assigned branch only;
- Attendance;
- no cross-branch profile exposure;
- no full-profile fallback.

SUPERADMIN where available:
- login;
- club list;
- club switch;
- authorization regression check.

Also outstanding:
- R1–R8 live Firestore invocation attribution;
- 25 navigation cycles with active-listener count;
- 2–4 hour soak;
- live proof of `unexpected runtime error = 0`, `unhandled rejection = 0`, `new permission-denied = 0`.

---

## 21. Remaining risks

1. **Runtime evidence gap:** static/source gates cannot prove browser lifetime behavior under a real authenticated Firebase session.
2. **Soak evidence gap:** timer/listener/memory stability over 2–4 hours has not been observed in a real browser.
3. **High-volume destructive Exam test:** chunking/idempotence is source/gate-proven, but a 501/1000 real-student promotion must use a controlled staging dataset, not production students.
4. **Financial network behavior:** source atomicity eliminates client-side sequential primary divergence within one Firestore batch, but production release still requires authenticated smoke against the actual Firebase environment.

No known source defect currently requires a second authority, Rules relaxation, Cloud Function, mass migration, profile rename, Attendance migration, or static read-budget increase.

---

## 22. Production recommendation

Do **not** label H8R2 final production PASS yet.

Use this package as the **release candidate**. Deploy the built `/public` candidate to the intended staging/controlled hosting target, then complete:

1. authenticated Admin/Coach/SuperAdmin smoke;
2. R1–R8 read/listener attribution;
3. 25-cycle listener leak test;
4. controlled finance and Attendance smoke;
5. 2–4 hour soak with network/console/timer/listener monitoring.

Only when all required runtime budgets are zero/stable should the final acceptance be changed from `H8R2 = NOT READY` to `H8R2 = PASS`.

---

# FINAL ACCEPTANCE

**H8R2 = NOT READY**

## BLOCKER
Authenticated runtime smoke, R1–R8 runtime read attribution, 25-cycle active-listener leak measurement, and 2–4 hour soak are not executed.

## ROOT CAUSE
The current execution environment is a source/test container and does not contain an authenticated Admin/Coach/SuperAdmin browser session connected to the production/staging Firebase runtime. These requirements are runtime observations and cannot be honestly inferred from static tests.

## OWNER
Release validation / authenticated staging-production operator. No new application data authority is required.

## FIX REQUIRED
Deploy the already-built H8R2 `/public` release candidate to a controlled target and execute the exact authenticated smoke + R1–R8 attribution + 25-cycle leak test + 2–4 hour soak. Capture console errors, unhandled rejections, permission-denied events, Firestore calls, active listeners and timer/network behavior.

## REGRESSION IMPACT
No source regression is currently detected: critical/release/master gates pass, static Firestore budget remains 29/51/16, and root/public parity is exact. The blocker is missing live-runtime acceptance evidence, not a known code regression.
