# D1C — Financial Guard Contract Report

## Root cause
`guardFinancialWriteIntent()` returns a structured object. Legacy callers used JavaScript truthiness or `!== false`, so `{ok:false}` could be interpreted as allowed.

## Final contract
- Single authority: `FinancialActionAuditGuard`.
- Single normalizer: `isFinancialWriteAllowed(result)` in the same owner.
- Allowed only when: boolean `true`, or structured result with `ok === true`.
- Structured `{ok:false}`, boolean `false`, null/undefined are blocked.
- Positive-amount actions: `tuition.quickPay`, `tuition.transactionForm`, `tuition.familyCombo`, `multiitem.pay` require finite amount > 0.

## Caller sweep
8 production-reachable financial action paths across 6 syntactic guard call sites were audited:
1. TuitionCommandBoundary collect/QuickPay — `tuition.quickPay`.
2. TuitionCommandBoundary delete — `transaction.delete`.
3. Canonical Transaction Form — `tuition.transactionForm`.
4. Canonical Family Combo — `tuition.familyCombo`.
5. Canonical generic transaction delete — `transaction.delete`.
6. MultiItem pay — `multiitem.pay`.
7. Inventory mark-paid — `inventory.markPaid`.
8. Exam cancel payment — `exam.cancelPayment`.

All production-reachable callers now consume the owner-level normalizer. No caller-local truthiness parser remains.

## Behavioral evidence
GUARD01–GUARD10 semantics are covered by the D1C actual-handler gate, including real structured guard results, unauthorized role, missing club, zero and non-finite payment amount.
