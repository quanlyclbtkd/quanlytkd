# PHASE 4K-6V5U6H6 — Remote Functions Inventory

Timestamp: 2026-08-28T22:02:37Z

Production project declared by source: **`quanly-tst`**.

Read-only command attempted:

```text
firebase functions:list --project quanly-tst
```

Actual result: **EXIT 127 — Firebase CLI unavailable**. Therefore local source is not used as proof of remote state.

| FUNCTION | LOCAL | REMOTE | TRIGGER TYPE (local source) | COLLECTION / DOMAIN WRITTEN (local intent) | CURRENT REMOTE AUTHORITY | CONFLICT? | ACTION |
|---|---|---|---|---|---|---|---|
| `onProfileWriteDebt` | YES | UNKNOWN | Firestore profile write | profiles derived debt fields | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `onTuitionTxWriteDebt` | YES | UNKNOWN | Firestore transaction write | profiles derived debt fields | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `scheduledDebtRecalculation` | YES | UNKNOWN | Schedule | profiles derived debt fields | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `recalcDebtForClub` | YES | UNKNOWN | Callable | profiles derived debt fields | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `onTransactionCreate` | YES | UNKNOWN | Firestore transaction create | stats / derived summary | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `onTransactionDelete` | YES | UNKNOWN | Firestore transaction delete | stats / derived summary | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `onTransactionUpdate` | YES | UNKNOWN | Firestore transaction update | stats / derived summary | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `rebuildStatsForClub` | YES | UNKNOWN | Callable | stats / derived summary | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `onProfileWriteSuperAdminSummary` | YES | UNKNOWN | Firestore profile write | SuperAdmin summary/cache | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `onTransactionWriteSuperAdminSummary` | YES | UNKNOWN | Firestore transaction write | SuperAdmin summary/cache | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `refreshSuperAdminSummaryForClub` | YES | UNKNOWN | Callable | SuperAdmin summary/cache | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |
| `scheduledRefreshSuperAdminSummaries` | YES | UNKNOWN | Schedule | SuperAdmin summary/cache | UNKNOWN until remote inspection | UNKNOWN | NO ACTION |

## Final classification

**REMOTE FUNCTIONS = UNKNOWN**.

Because remote inventory cannot be read, server/client authority overlap cannot be proven safe. No Function was deployed, deleted, disabled, or modified remotely in H6. This remains a release blocker for PILOT READY.
