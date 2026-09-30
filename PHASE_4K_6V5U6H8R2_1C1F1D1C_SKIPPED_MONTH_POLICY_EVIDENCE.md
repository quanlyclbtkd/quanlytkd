# D1C — SKIPPED MONTH POLICY EVIDENCE

## Evidence
- `TuitionDebtCanonical.getTuitionMonthSettlement()` gives `skipped:true`, `paid:false`, `settled:false` for a skipped month.
- Debt computation excludes `skippedMonths` from chargeable/debt months.
- Existing Tuition writers use paid/settled evidence; skipped state is not treated as paid and current flows do not have a canonical "non-collectible" rejection.
- Existing regression gates explicitly verify skipped month suppresses debt and has precedence over paid classification.

## Preserved product policy
**POLICY B — skipped month is excluded from Debt, while Admin explicit/manual collection remains possible under the current product behavior.**

D1C makes **no business-policy change** here. Adding a non-collectible rule would be a separate approved business phase.
