# D1C — Family Combo Canonical Intent Report

Canonical handler: `js/modules/finance.js :: window.processCombo`.

One pure validated-intent builder now serves both `report` and `pay`.

An active row is any row with student, amount, or month input. Every active row must have:
- valid existing canonical profile;
- stable profile identity;
- finite amount > 0;
- month exactly `YYYY-MM`.

Duplicate stable profile identity is fail-closed. Partial rows are fail-closed. No silent row drop or merge occurs.

All downstream values derive from `validatedIntents`: lane identities, student names, months, committed transaction amounts, total, report total, receipt total and local commits.

`receiptTotal = sum(validated committed intent amounts)` for the current tuition-only family Combo contract.

`processCombo('pay')` additionally requires FinancialActionAuditGuard action `tuition.familyCombo`; viewer/missing-club tests produce zero writes.
