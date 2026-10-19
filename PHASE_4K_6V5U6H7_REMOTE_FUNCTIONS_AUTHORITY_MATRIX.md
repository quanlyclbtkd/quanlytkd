# PHASE 4K-6V5U6H7 — Remote Functions Authority Matrix

Remote state is **UNKNOWN** because `functions:list` could not execute. The matrix below is a local-source authority map only; it must not be read as proof that any Function is deployed.

| Function | Local | Remote | Region | Trigger | Trigger path | Writes to / fields | Canonical or derived | Client same-field writer? | Conflict | Still consumed? | Expected? | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| onProfileWriteDebt | YES | UNKNOWN | asia-southeast1 | Firestore onWrite | `clubs/{clubId}/profiles/{studentId}` | profile `isOwed, owedMonths, owedCount, debtCalcAt` | derived debt projection | No direct client writer found; client treats legacy flags as non-authoritative evidence | UNKNOWN remote; no source-level writer conflict proven | Client may read flags as supplementary evidence | UNKNOWN | INVESTIGATE |
| onTuitionTxWriteDebt | YES | UNKNOWN | asia-southeast1 | Firestore onWrite | `clubs/{clubId}/transactions/{txId}` | same debt projection on profile | derived | No direct client writer found | UNKNOWN | supplementary/legacy use | UNKNOWN | INVESTIGATE |
| scheduledDebtRecalculation | YES | UNKNOWN | asia-southeast1 | Scheduled | daily | same debt projection on active profiles | derived | No direct client writer found | UNKNOWN | supplementary/legacy use | UNKNOWN | INVESTIGATE |
| recalcDebtForClub | YES | UNKNOWN | asia-southeast1 | Callable | admin request | same debt projection | derived | No direct client writer found | UNKNOWN | callable is policy-guarded/optional | UNKNOWN | INVESTIGATE |
| onTransactionCreate | YES | UNKNOWN | asia-southeast1 | Firestore onCreate | transactions | `stats/{YYYY_MM}` income/expense/profit/txCount | derived stats projection | YES: current client `clubStatsAutoCache` can write stats mirror when authorized | UNKNOWN; if remotely active there is derived-projection overlap, but not proof of two canonical business truths | Dashboard/SuperAdmin may read stats fallback | UNKNOWN | INVESTIGATE |
| onTransactionDelete | YES | UNKNOWN | asia-southeast1 | Firestore onDelete | transactions | same stats projection | derived | YES | UNKNOWN; same condition | yes/fallback | UNKNOWN | INVESTIGATE |
| onTransactionUpdate | YES | UNKNOWN | asia-southeast1 | Firestore onUpdate | transactions | same stats projection | derived | YES | UNKNOWN; same condition | yes/fallback | UNKNOWN | INVESTIGATE |
| rebuildStatsForClub | YES | UNKNOWN | asia-southeast1 | Callable | admin request | rebuilds `stats/*` | derived | YES | UNKNOWN; manual server projection could overlap client mirror if remote active | optional/admin callable | UNKNOWN | INVESTIGATE |
| onProfileWriteSuperAdminSummary | YES | UNKNOWN | asia-southeast1 | Firestore onWrite | profiles | club root cached counts + `superAdminStats` | derived display/cache projection | YES: `clubStatsAutoCache` writes overlapping root cache fields | UNKNOWN; derived cache overlap possible if remote active | SuperAdmin reads cache/fallback | UNKNOWN | INVESTIGATE |
| onTransactionWriteSuperAdminSummary | YES | UNKNOWN | asia-southeast1 | Firestore onWrite | transactions | root cached revenue/tx + `superAdminStats` | derived display/cache projection | YES | UNKNOWN; derived cache overlap possible | yes | UNKNOWN | INVESTIGATE |
| refreshSuperAdminSummaryForClub | YES | UNKNOWN | asia-southeast1 | Callable | admin/SuperAdmin | root summary + `stats/{month}` | derived | YES | UNKNOWN; potential cache writer overlap | optional/manual refresh source exists | UNKNOWN | INVESTIGATE |
| scheduledRefreshSuperAdminSummaries | YES | UNKNOWN | asia-southeast1 | Scheduled | every 6 hours | root summary + stats | derived | YES | UNKNOWN; potential cache writer overlap | cache consumers exist | UNKNOWN | INVESTIGATE |

## Authority assessment
- Debt fields are a persisted **derived projection**; current client canonical debt computation explicitly treats old `isOwed/owedMonths` flags as non-authoritative and no direct client write to those four debt fields was found.
- Transaction stats and SuperAdmin summary Functions, if remotely active, may write fields also written by the current client cache writer. These are derived cache/stat projections rather than transaction/tuition canonical truth. Remote presence and runtime policy must be verified before deciding KEEP/DEPRECATE.
- Because remote state is unknown, **AUTHORITY CONFLICT = UNKNOWN**, not NONE and not FOUND.
