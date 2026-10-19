# PHASE 4K-6V5U6H5 — Club Root Listener Bootstrap Readiness + Exam Full Roster Export Report

Generated: `2026-08-27T10:50:52.524639+00:00`  
Runtime build: `4K-6V5U6H5-club-root-listener-bootstrap-readiness-exam-full-roster-export-20260827`

## 1. ROOT CAUSE

### A — Club Root Listener bootstrap race

Before H5, restored Firebase Auth could invoke `initSaaSDatabase()` and `_mountClubRootAuthority()` before `js/main.js` exposed the Listener Registry bridge. The mount path immediately treated missing `safeRegisterSnapshot` as `listener-registration-failed`. In addition, `_clubAccessBootstrapFlight` was committed after the registration attempt, so concurrent same-session calls could not reuse a canonical flight while the dependency was still loading.

### B — Exam registration export was actually paid-only

`exportExamPaidList()` constructed workbook rows from `paidData`, aborted when the paid ledger was empty, and hard-coded every exported row as `✔ Đã nộp phí`. Active students without an exam payment were therefore absent from the registration roster.

## 2. BEFORE → AFTER

### Club Root

**Before**

```text
restored Auth
→ app.js bootstrap
→ safeRegisterSnapshot missing at first tick
→ immediate listener-registration-failed
```

**After**

```text
create/reuse ONE bootstrap flight
→ wait one-shot Listener Registry readiness (bounded ~10s)
→ re-check uid/clubId/authGeneration
→ safeRegisterSnapshot(global:club:{clubId})
→ ONE root onSnapshot
→ first snapshot accepted
→ tenant data may load
```

If Registry/main genuinely fails, H5 still fails closed. No direct listener fallback exists.

### Exam export

**Before**

```text
paid ledger
→ paid names only
→ zero paid = abort
→ every row marked paid
```

**After**

```text
canonical RAM active profiles
+ canonical exam payment ledger
+ existing BELT_NEXT
→ full active roster
→ paid/unpaid per student
→ branch sheets + total sheet
→ zero-paid roster still exports
```

## 3. FILES CHANGED AND WHY

### Runtime source

- `app.js` — one bounded Listener Registry readiness barrier; bootstrap flight ordering; stale-auth/duplicate diagnostics. No new Firestore call.
- `js/main.js` — exposes one one-shot Listener Registry ready signal after the existing bridge; H5 build marker; cache-busts the changed report facade.
- `index.html` — emits one registry-failure signal on genuine `main.js` load failure; H5 app/main cache-bust.
- `js/modules/reports.js` — full active Exam roster builder/join and paid/unpaid workbook semantics.
- `js/modules/reports/reportExportFacade.js` — cache-busts the changed `reports.js` while preserving lazy import.

### Test/tooling

- `package.json` — adds the two requested H5 check scripts only.
- `tools/check-club-listener-bootstrap-readiness.mjs` — new H5 source/runtime harness gate.
- `tools/check-exam-export-full-roster.mjs` — new dynamic Exam roster gate.
- `tools/check-club-bootstrap-single-read-authority.mjs` — modernized for the bounded H5 readiness barrier.
- `tools/check-report-export-lazy-isolation.mjs` — optional query-string support on the same lazy module path.
- `tools/check-lazy-assets-loading.mjs` — same cache-bust compatibility.
- `tools/check-v5u2e-attendance-excel-sdk-fix.mjs` — cache-token-independent facade-path/source-public parity check.

`public/*` mirrors were regenerated solely by `npm run build:public`.

## 4. LISTENER COUNT / AUTHORITY

```text
Club Root canonical Firestore source = clubs/{clubId}
Club Root listener key              = global:club:${clubId}
Club Root active listener authority = ONE
Registration owner                  = safeRegisterSnapshot()
Direct onSnapshot fallback          = NONE
Polling/retry loop                  = NONE
```

The runtime readiness gate reports **36/36 PASS**.

## 5. FIRESTORE READ BUDGET

```text
H4: getDoc 29 / getDocs 51 / onSnapshot 16
H5: getDoc 29 / getDocs 51 / onSnapshot 16
Delta: 0 / 0 / 0
```

## 6. EXAM EXPORT ROW EVIDENCE

```text
10 active / 3 paid / 7 unpaid → 10 rows
10 active / 0 paid            → 10 rows; no abort
8 active / 2 quit             → 8 rows
CS1=5 + CS2=5                 → all=10, CS1=5, CS2=5
cancelled payment             → unpaid
combo tuition+exam            → uses examAmount only
```

Dynamic Exam gate: **21/21 PASS**.

## 7. REGRESSION RESULTS

```text
npm run check              = EXIT 0
npm run check:all:critical = EXIT 0
npm run check:all          = EXIT 0
```

Security, Auth, Club Bootstrap, Attendance, Dashboard, Canonical Transaction, Tuition, Debt and Inventory gates remain green through the full regression suites.

## 8. ROOT/PUBLIC

SHA-256: **123/123 exact**, missing=0, extra=0, mismatches=0.

## 9. KNOWN BLOCKERS

The H5 Node/browser-like runtime harness verifies the restored-session/slow-main/logout/relogin/duplicate cases, but an actual authenticated deployed browser session was not available here. Therefore:

```text
SOURCE VERIFIED
RUNTIME HARNESS VERIFIED
AUTHENTICATED BROWSER SMOKE = PENDING/BLOCKED
PRODUCTION VERIFIED = NO
```

H4's external Firebase-environment blockers (actual Rules Emulator execution, remote Functions certainty, and authenticated deployed smoke) are not closed by this H5 source patch and must remain separately classified until executed in an authorized environment.
