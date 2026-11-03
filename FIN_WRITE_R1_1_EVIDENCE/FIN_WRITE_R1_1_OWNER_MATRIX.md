# FIN_WRITE_R1_1_OWNER_MATRIX

| Concern | Owner after R1.1 | Rule |
|---|---|---|
| Reusable complete month evidence | `FinanceService` | One read owner; lazy/write-triggered; no listener. |
| Financial persistence | Existing `FinanceService` methods / existing atomic plan | No new writer owner. |
| Tuition command decision | `TuitionCommandBoundary` | One settlement evidence contract. |
| Tuition matching | `TuitionDebtCanonical` | Pure/synchronous; no Firestore. |
| Exam matching | Existing `buildCanonicalExamPaymentLedger` | Reused; no second ledger. |
| Tuition delete profile regression | `FinanceService.updateProfileAfterTxDelete()` | Single normal profile reconciliation writer. |
| Family Combo / form / Quick Exam / MultiItem | Callsite only | May request decision; may not own evidence query/matcher. |
| Legacy global tuition reconcile | `LEGACY_COMPAT` only | Normal runtime callers = 0. |
