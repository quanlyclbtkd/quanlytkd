# F1B Gap Settlement Report

Canonical owner: `js/core/tuitionDebtCanonical.js`.

Precedence now used by `getTuitionMonthSettlement()`:

1. `skippedMonths` explicit entry => not paid / skipped.
2. explicit `paidMonths` => paid, including months later than `paidUntil`.
3. contiguous legacy `paidUntil` => paid for target <= boundary.
4. already-loaded canonical tuition transaction fallback when applicable.
5. otherwise unpaid.

`paidUntil` remains a contiguous boundary, while `paidMonths` may preserve later month-level evidence across a middle gap.

Example verified:

- `paidUntil=2026-08`
- `paidMonths=[2026-08,2026-10]`
- Sep => unpaid
- Oct => paid

Recollect Sep merges evidence `[Aug,Sep,Oct]` and advances contiguous paidUntil to Oct without deleting Oct evidence.

GS01–GS10: **10/10 PASS**.

`js/main.js::recalculatePaidUntilFromPaidMonths()` delegates to the canonical reconciler with `allowRegression:true` for reversal. Payment collection uses the same canonical reconciler with monotonic mode (`allowRegression:false`).
