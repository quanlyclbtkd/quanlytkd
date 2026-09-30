# D1B — Local Canonical Commit Report

The duplicate-payment window between successful Firestore commit and the next snapshot is closed for the remaining canonical Tuition callers.

## Transaction Form
Inside the same profile lane:
1. latest local profile is resolved;
2. settlement is checked;
3. final plan is built;
4. `FinanceService.commitAtomicWritePlan` succeeds;
5. `TuitionCommandBoundary.commitLocalTuitionPaymentState` updates `paidUntil/paidMonths` locally;
6. only then is the lane released.

RACE-C evidence: immediate same-month QuickPay before any snapshot returns already-settled/no-write.

## Family Combo
Inside all acquired profile lanes:
1. latest state is resolved for every participant;
2. stale settlement causes fail-closed;
3. one existing atomic plan is committed;
4. `commitLocalTuitionPaymentState` is called for every affected profile;
5. lanes release;
6. fee audit/receipt run afterwards.

No new local store owner and no Firestore reread were introduced.

Status: **PASS**.
