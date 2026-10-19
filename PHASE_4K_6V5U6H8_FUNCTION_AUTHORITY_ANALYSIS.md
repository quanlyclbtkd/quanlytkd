# PHASE 4K-6V5U6H8 — Function Authority Analysis

## Authority question

**WHO OWNS THIS DATA NOW?** Remote state cannot be answered without `functions:list`; therefore H8 does not classify a remote writer collision as NONE or FOUND.

### Local Debt projection group
`onProfileWriteDebt`, `onTuitionTxWriteDebt`, `scheduledDebtRecalculation`, `recalcDebtForClub` locally write derived profile fields such as `isOwed`, `owedMonths`, `owedCount`, `debtCalcAt`. Local source describes these as persisted debt projections. Remote activity and current production consumer dependency remain unverified in H8.

### Local transaction stats group
`onTransactionCreate`, `onTransactionDelete`, `onTransactionUpdate`, `rebuildStatsForClub` locally write monthly `clubs/{clubId}/stats/{YYYY_MM}` projections (income/expense totals and related stats). Presence remotely is unknown.

### Local SuperAdmin summary group
`onProfileWriteSuperAdminSummary`, `onTransactionWriteSuperAdminSummary`, `refreshSuperAdminSummaryForClub`, `scheduledRefreshSuperAdminSummaries` locally write derived club-root summary/cache fields and stats projections. Some local client cache writers touch related display-cache fields, but without remote inventory and runtime evidence H8 does **not** declare a canonical writer conflict.

## Final authority result

- Remote Functions inventory: **UNKNOWN**
- Unresolved canonical writer conflict: **UNKNOWN**
- Automatic deploy/delete/disable action: **NONE**
- Release impact: **BLOCKER** until remote inventory is read successfully.
