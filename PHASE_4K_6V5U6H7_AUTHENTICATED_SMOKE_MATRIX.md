# PHASE 4K-6V5U6H7 — Authenticated Deployed Smoke Matrix

No deployed candidate was created in H7 because Firebase toolchain/project/Rules prerequisites were blocked. Static/runtime harness results from earlier phases are not substituted for deployed browser evidence.

| CASE | ROLE | ACTION | EXPECTED | ACTUAL | CONSOLE | NETWORK | FIRESTORE | AUTHORITY | PASS/FAIL | EVIDENCE |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Admin | normal login | one root listener; app unlocks | NOT EXECUTED | not captured | not captured | not observed | Club Root | BLOCKED | no deployed candidate |
| A2 | Admin | restored-session reload | no bootstrap banner; one root listener | NOT EXECUTED | not captured | not captured | not observed | Club Root | BLOCKED | no deployed candidate |
| A3 | Admin | hard refresh | same as A2 | NOT EXECUTED | not captured | not captured | not observed | Club Root | BLOCKED | no deployed candidate |
| A4 | Admin | slow bootstrap | wait Registry; no premature fail | NOT EXECUTED | not captured | not captured | not observed | Club Root | BLOCKED | browser throttling unavailable without candidate |
| A5 | Admin | full tab navigation | no duplicate loops/errors | NOT EXECUTED | not captured | not captured | not observed | module owners | BLOCKED | no deployed candidate |
| A6 | Admin | Exam full-roster export | full active roster; state-pure | NOT EXECUTED | not captured | not captured | not observed | canonical Exam ledger | BLOCKED | source gates pass only |
| C1 | Coach | login | Attendance-only experience | NOT EXECUTED | not captured | not captured | not observed | Coach boundary | BLOCKED | no deployed candidate |
| C2 | Coach | assigned branch | only assigned branch | NOT EXECUTED | not captured | not captured | not observed | branch authority | BLOCKED | no deployed candidate |
| C3 | Coach | forbidden branch | denied | NOT EXECUTED | not captured | not captured | not observed | branch authority | BLOCKED | no deployed candidate |
| C4 | Coach | Attendance write | one valid canonical write | NOT EXECUTED | not captured | not captured | not observed | Attendance | BLOCKED | no safe runtime account |
| V1 | Viewer | read-only session | no forbidden writes | NOT EXECUTED | not captured | not captured | not observed | Viewer Rules | BLOCKED | production role state not verified |
| S1 | SuperAdmin | login | valid principal loads UI | NOT EXECUTED | not captured | not captured | not observed | SuperAdmin principal | BLOCKED | no deployed candidate |
| S2 | Admin | attempt SuperAdmin | denied | NOT EXECUTED | not captured | not captured | not observed | SuperAdmin principal | BLOCKED | no deployed candidate |
| L1 | Admin | logout | context/listener cleanup | NOT EXECUTED | not captured | not captured | not observed | Auth/Listener registry | BLOCKED | no deployed candidate |
| L2 | A→B | rapid relogin | no stale Club A authority | NOT EXECUTED | not captured | not captured | not observed | authGeneration | BLOCKED | no two safe accounts |
| SEC1 | cross-tenant | Club A → Club B | DENY | NOT EXECUTED | not captured | not captured | not observed | Rules | BLOCKED | Emulator/deployed Rules not verified |
