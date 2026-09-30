# PHASE 4K-6V5U6H8R2.1C1F1C — LEGACY GAP REVERSAL REPORT

## Root cause

`main.js::reconcileStudentTuitionAfterDeletedTransaction()` delegated reversal paidUntil calculation to `TuitionDebtCanonical.reconcilePaidUntilFromMonthEvidence(..., {allowRegression:true})` using only the remaining `paidMonths`. When a profile represented legacy contiguous coverage only through `paidUntil`, deleting a future explicit payment could leave `remainingPaidMonths=[]`; the canonical helper then returned `''`, corrupting the legacy baseline.

Example before F1C:

- previous `paidUntil=2026-08`
- explicit future payment `paidMonths=[2026-10]`
- delete October
- remaining explicit months `[]`
- old regression calculation could return empty paidUntil.

## Patch

The existing canonical reconciler now accepts existing reversal context: `removedMonths` / `monthsActuallyRemoved`.

Reversal rules:

A. If every actually removed chargeable month is **after** previous `paidUntil`, previous `paidUntil` is preserved.

B. If an actually removed chargeable month intersects the previous contiguous boundary, the boundary regresses only to the previous non-skipped month before the earliest affected month.

C. Explicit remaining `paidMonths` after the new boundary remain explicit paid evidence; they are not discarded.

D. `skippedMonths` keeps canonical precedence. When regressing a boundary, skipped months are stepped over rather than converted to paid history.

E. Existing local canonical transaction fallback remains available for later paid-month classification. No Firestore read was added.

`main.js` passes `monthsToRemove` into the canonical reconciler. It does not synthesize months or backfill history.

## LB01–LB10 results

| Case | Expected / actual |
|---|---|
| LB01 legacy Aug → collect Oct → delete Oct | `paidUntil=Aug`, Oct removed — PASS |
| LB02 Aug + explicit Oct → delete Oct | `paidUntil=Aug` — PASS |
| LB03 Aug + Oct/Nov → delete Nov | baseline Aug, Oct retained — PASS |
| LB04 boundary Oct + Aug/Sep/Oct → delete Sep | `paidUntil=Aug`, Oct explicit-paid — PASS |
| LB05 legacy boundary Oct, no paidMonths → delete Oct | `paidUntil=Sep` — PASS |
| LB06 boundary Oct + explicit Dec → delete Dec | `paidUntil=Oct` — PASS |
| LB07 boundary Oct + explicit Dec → delete Sep | `paidUntil=Aug`, Dec evidence retained — PASS |
| LB08 skipped month before removed boundary | skipped precedence preserved — PASS |
| LB09 future-gap delete + reconcile failure | local legacy state remains unchanged/fail-closed — PASS |
| LB10 future-gap delete → recollect | new txId, baseline Aug preserved, Oct explicit-paid — PASS |

F1B middle-gap invariant remains: with `paidUntil=Aug`, `paidMonths=[Aug,Oct]`, Sep is unpaid and Oct is paid.
