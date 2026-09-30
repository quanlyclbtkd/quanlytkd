# D1B — Family Combo Report

## Root cause
Canonical `window.processCombo` previously built transaction/profile-update rows from profile objects captured before acquiring its multi-profile tuition lanes. This serialized commit time but not decision time, allowing stale settlement or stale `paidUntil` decisions.

## Patch
`processCombo` now retains only intent-level participant/month/amount input before locking. It uses the existing `TuitionCommandBoundary.runInProfileTuitionMutationLanes` API. After all deterministic lanes are acquired, it re-resolves every participant from the existing local canonical profile store, rechecks settlement via `TuitionDebtCanonical`, builds the final transactions/profile updates from fresh state, calls the existing `FinanceService.commitAtomicWritePlan`, commits local tuition state for every successful profile, then releases all lanes. Fee audit and receipt remain outside the critical section.

If any participating Tuition component becomes settled while waiting, Combo fails closed before primary write and asks the user to reconfirm. It does not silently remove a participant or redistribute amounts.

## Behavioral evidence
- COMBO01: normal two-student Combo -> one atomic plan with two transactions/two profile updates; local state committed for both.
- Receipt runs with `profileMutationLaneCount === 0`.
- COMBO03: participant changes while waiting -> queued behind the same profile lane, then stale participant causes zero partial write.
- COMBO04: newer `paidUntil` state cannot be regressed by stale Sep intent.
- COMBO05 invariant is covered by local-state commit + immediate QuickPay protection in the canonical owner; no snapshot reread is required.
- COMBO06/07: reverse profile order uses deterministic lane ordering and completes without deadlock.
- COMBO08: injected primary batch failure -> all lanes released; no false local tuition commit.
- Actual canonical `window.processCombo` is executed by the D1B gate.

Status: **PASS in tested same-runtime path**.
