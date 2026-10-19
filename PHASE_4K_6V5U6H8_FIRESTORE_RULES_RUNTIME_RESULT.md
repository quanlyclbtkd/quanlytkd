# PHASE 4K-6V5U6H8 — Firestore Rules Runtime Result

**STATIC SECURITY GATES: PASS**  
**RULES EMULATOR: BLOCKED**  
**RULES RUNTIME VERIFIED: NO**

Canonical command attempted:

`npm run check:rules:emulator`

Result: EXIT 127, `firebase: not found`. The Firestore Emulator did not start and no actual allow/deny request executed.

| CASE | AUTH / SCOPE | OPERATION | EXPECTED | ACTUAL | PASS/FAIL | EVIDENCE |
|---|---|---|---|---|---|---|
| R1 | Admin own-tenant allowed operations | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R2 | Admin cross-tenant deny | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R3 | Coach assigned-branch Attendance allow | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R4 | Coach other-branch deny | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R5 | Coach finance/config deny | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R6 | Viewer read-only / write deny | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R7 | SuperAdmin valid principal allow | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R8 | Normal Admin cannot spoof SuperAdmin | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R9 | Unauthenticated private data deny | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R10 | Spoofed login-history identity deny | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |
| R11 | Cross-tenant profiles/transactions/attendance/inventory/settings deny | runtime allow/deny | REQUIRED | NOT EXECUTED | BLOCKED | Firebase CLI unavailable |

No production Firestore data was used and `firestore.rules` was not modified.
