# FIN_WRITE_R1_1_CALL_GRAPH

## Before patch

| Path | Classification | Baseline authority/problem |
|---|---|---|
| `TuitionCommandBoundary.collectTuition()` | WRITE_OWNER / command owner | Uses profile + bounded transaction RAM; negative RAM absence can authorize tuition write. |
| `finance.processCombo()` | CALLSITE_ONLY + existing atomic writer caller | Family command has its own negative settlement decision from bounded rows. |
| `transactionForm.onsubmit` | CALLSITE_ONLY + existing atomic writer caller | Tuition/mixed form can commit from partial negative evidence. |
| `app.js processMultiItem()` | LEGACY_COMPAT normal callsite | Protected legacy kernel can commit tuition/exam without server-complete negative evidence. |
| `quickCollectExam()` | CALLSITE_ONLY | Existing Exam ledger sees bounded RAM; negative can authorize `FinanceService.addTransaction()`. |
| `TuitionCommandBoundary.deleteTuitionTransaction()` | WRITE_OWNER | Delegates post-delete paid-state authority to legacy global reconcile. |
| `window.reconcileStudentTuitionAfterDeletedTransaction()` | LEGACY_COMPAT / secondary profile writer | Uses bounded RAM absence and can lower `paidMonths/paidUntil`. |
| `FinanceService.addTransaction()` | WRITE_OWNER | Existing persistence owner; remains unchanged as writer owner. |
| `FinanceService.updateProfileAfterTxDelete()` | WRITE_OWNER | Existing narrow delete-profile writer, not the sole normal authority before patch. |

## After patch

`FinanceService` is the only reusable complete-transaction evidence read owner. `TuitionCommandBoundary` owns tuition settlement/write decisions. `TuitionDebtCanonical` remains pure. `buildCanonicalExamPaymentLedger` remains the Exam matcher. `processCombo`, transaction form, Quick Exam and `processMultiItem` are callsites only and consume the shared decision contracts. Normal tuition delete has zero caller dependency on the legacy global reconcile and uses `FinanceService.updateProfileAfterTxDelete()` as its only profile reconciliation writer.

### Reachability evidence
- `collectTuition`: `js/core/tuitionCommandBoundary.js:387`; normal Finance caller at `js/modules/finance.js:304`.
- `processCombo`: `js/modules/finance.js:544`; shared tuition decision at line 556.
- transaction form: `js/modules/finance.js:574`; shared tuition/mixed exam decision at line 597.
- `processMultiItem`: `app.js:9466`; tuition/exam evidence calls around lines 9610–9617.
- `quickCollectExam`: `js/modules/finance.js:510`; shared Exam decision around line 529.
- delete owner: `js/core/tuitionCommandBoundary.js:527`; Finance routes tuition deletion there at `js/modules/finance.js:193`.
- legacy reconcile remains defined at `js/main.js:5378`, but no normal Finance/Tuition boundary caller remains. `TransactionDeleteIntegrity.reconcileAfterTransactionDelete()` retains an archaeology/compat wrapper and has no normal runtime caller discovered.
