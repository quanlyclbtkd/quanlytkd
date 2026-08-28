# PHASE 4K-6V5U6H5 — Defect Matrix

Generated: `2026-08-27T10:50:52.524639+00:00`  
Runtime build: `4K-6V5U6H5-club-root-listener-bootstrap-readiness-exam-full-roster-export-20260827`

| ID | Severity | Domain | Verified root cause | Smallest patch | New reader/listener/writer | Status |
|---|---|---|---|---|---|---|
| H5-A | P1 | Club Root bootstrap | `_mountClubRootAuthority()` could execute from restored Firebase Auth before `js/main.js` exposed `safeRegisterSnapshot`; `_clubAccessBootstrapFlight` was also committed after the registration attempt. This could produce `listener-registration-failed` even though the canonical Listener Registry would become ready moments later. | Add one one-shot Listener Registry readiness signal in `main.js`, one shared bounded wait helper in `app.js`, commit the existing bootstrap flight before waiting, revalidate auth identity before registration, and keep registration exclusively through `safeRegisterSnapshot(global:club:${clubId})`. | `0 / 0 / 0` | FIXED + runtime harness VERIFIED |
| H5-B | P1 | Exam export | `exportExamPaidList()` built workbook rows from the paid ledger only, aborted when paid count was zero, and hard-coded every row as paid. | Build export roster from canonical RAM `_profiles()` active students, join the existing canonical exam payment ledger, use existing `BELT_NEXT`, preserve existing sort/lazy XLSX flow, and compute paid/unpaid summaries. | `0 / 0 / 0` | FIXED + dynamic export harness VERIFIED |

## Scope freeze

No H5 runtime patch was made to Attendance, Dashboard, Tuition, Debt, Inventory, Canonical Transaction, Auth Context, Firestore Rules, or Cloud Functions.
