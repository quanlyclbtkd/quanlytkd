# PHASE 4K-6V5U6H7 — Remote Functions Inventory

Timestamp: `2026-08-29 09:01:44 +0700`
Firebase project expected: `quanly-tst`

Read-only command attempted: `firebase functions:list --project quanly-tst`

Result: **EXIT 127 — Firebase CLI unavailable**.

Therefore: **REMOTE FUNCTIONS INVENTORY = UNKNOWN**.

Local source exports were parsed only for comparison preparation; local source is not evidence of remote deployment:
1. `onProfileWriteDebt`
2. `onTuitionTxWriteDebt`
3. `scheduledDebtRecalculation`
4. `recalcDebtForClub`
5. `onTransactionCreate`
6. `onTransactionDelete`
7. `onTransactionUpdate`
8. `rebuildStatsForClub`
9. `onProfileWriteSuperAdminSummary`
10. `onTransactionWriteSuperAdminSummary`
11. `refreshSuperAdminSummaryForClub`
12. `scheduledRefreshSuperAdminSummaries`

No Function was deployed, deleted, disabled, or modified.
