# PHASE 4K-6V5U6H8R2.1C1F1D1C — PRE-IMPLEMENTATION MATRIX

Created before source patching.

| ID | Function / caller | Runtime owner | Current contract/timing | Root cause / risk | Planned patch | Read / write / listener impact |
|---|---|---|---|---|---|---|
| D1C-A01 | `FinancialActionAuditGuard.guardFinancialWriteIntent` | `js/core/financialActionAuditGuard.js` | returns structured `{ok,...}` | callers use object truthiness | add ONE owner-level `isAllowed` normalizer; preserve structured guard | 0 / 0 / 0 |
| D1C-A02 | `TuitionCommandBoundary._guard` | TCB | `result !== false` | `{ok:false}` interpreted allowed | consume guard owner normalizer | 0 / 0 / 0 |
| D1C-A03 | `finance.deleteTx` | canonical delete coordinator | `!guardResult` | blocked structured result interpreted allowed | canonical normalizer | 0 / 0 / 0 |
| D1C-A04 | `app.js inventory.markPaid` | existing inventory caller | `!guardResult` | same bypass | canonical normalizer | 0 / 0 / 0 |
| D1C-A05 | `app.js exam.cancelPayment` | existing exam caller | `!guardResult` | same bypass | canonical normalizer | 0 / 0 / 0 |
| D1C-A06 | `app.js processMultiItem('pay')` | protected MultiItem owner | `!guardResult` | same bypass | canonical normalizer | 0 / 0 / 0 |
| D1C-B01 | canonical `transactionForm.onsubmit` | `js/modules/finance.js` | HTML/UI validation only; no canonical guard | zero/negative/non-finite/date/package can reach plan | handler-level finite-positive/date/package invariants + guard before lane | 0 / primary behavior only / 0 |
| D1C-C01 | canonical `processCombo` | `js/modules/finance.js` | raw `f1/f2`, filters incomplete rows, raw total | duplicate profile, partial-row silent drop, report/pay divergence, raw total mismatch | ONE pure validated-intent builder in finance module; report/pay consume same model | 0 / primary behavior only / 0 |
| D1C-C02 | `processCombo('pay')` | `js/modules/finance.js` | no FinancialActionAuditGuard | unauthorized/missing-club write boundary absent | guard validated total/action before lanes | 0 / 0 / 0 |
| D1C-D01 | Form fee audit | FinanceService secondary owner | awaited before handler completion | slow audit delays success/receipt path | detached-but-observed after primary/lane result | 0 / same secondary write / 0 |
| D1C-D02 | Combo fee audits | FinanceService secondary owner | sequential `await` before receipt | same blocking risk | detached observed calls; receipt not gated | 0 / same secondary writes / 0 |
| D1C-E01 | `skippedMonths` | `TuitionDebtCanonical` | settlement returns `skipped:true, paid:false`; debt excludes skipped | business collection policy not explicit from debt semantics alone | evidence-only audit; no behavior change without proof | 0 / 0 / 0 |
