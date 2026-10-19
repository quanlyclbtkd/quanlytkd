# PHASE 4K-6V5U6H8 — Remote Functions Matrix

Remote inventory command `firebase functions:list --project quanly-tst` returned EXIT 127 because Firebase CLI is unavailable. Therefore remote presence/generation/region/runtime cannot be asserted.

| NAME | LOCAL EXISTS | REMOTE EXISTS | GEN | REGION/RUNTIME | DOMAIN | LOCAL TRIGGER TYPE | LOCAL WRITES | CONFLICT | STATUS |
|---|---:|---|---|---|---|---|---|---|---|
| `onProfileWriteDebt` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Debt projection | Firestore / schedule / callable (local source) | profiles debt-derived fields | UNKNOWN | INVESTIGATE |
| `onTuitionTxWriteDebt` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Debt projection | Firestore / schedule / callable (local source) | profiles debt-derived fields | UNKNOWN | INVESTIGATE |
| `scheduledDebtRecalculation` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Debt projection | Firestore / schedule / callable (local source) | profiles debt-derived fields | UNKNOWN | INVESTIGATE |
| `recalcDebtForClub` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Debt projection | Firestore / schedule / callable (local source) | profiles debt-derived fields | UNKNOWN | INVESTIGATE |
| `onTransactionCreate` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Transaction stats | transactions trigger / callable | clubs/{clubId}/stats/{month} | UNKNOWN | INVESTIGATE |
| `onTransactionDelete` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Transaction stats | transactions trigger / callable | clubs/{clubId}/stats/{month} | UNKNOWN | INVESTIGATE |
| `onTransactionUpdate` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Transaction stats | transactions trigger / callable | clubs/{clubId}/stats/{month} | UNKNOWN | INVESTIGATE |
| `rebuildStatsForClub` | YES | UNKNOWN | UNKNOWN | UNKNOWN | Transaction stats | transactions trigger / callable | clubs/{clubId}/stats/{month} | UNKNOWN | INVESTIGATE |
| `onProfileWriteSuperAdminSummary` | YES | UNKNOWN | UNKNOWN | UNKNOWN | SuperAdmin summary | profiles/transactions trigger / schedule / callable | club root summary + stats projection | UNKNOWN | INVESTIGATE |
| `onTransactionWriteSuperAdminSummary` | YES | UNKNOWN | UNKNOWN | UNKNOWN | SuperAdmin summary | profiles/transactions trigger / schedule / callable | club root summary + stats projection | UNKNOWN | INVESTIGATE |
| `refreshSuperAdminSummaryForClub` | YES | UNKNOWN | UNKNOWN | UNKNOWN | SuperAdmin summary | profiles/transactions trigger / schedule / callable | club root summary + stats projection | UNKNOWN | INVESTIGATE |
| `scheduledRefreshSuperAdminSummaries` | YES | UNKNOWN | UNKNOWN | UNKNOWN | SuperAdmin summary | profiles/transactions trigger / schedule / callable | club root summary + stats projection | UNKNOWN | INVESTIGATE |

Local export count: **12**. Remote count: **UNKNOWN**. Unexpected remote: **UNKNOWN**. Missing remote: **UNKNOWN**.
