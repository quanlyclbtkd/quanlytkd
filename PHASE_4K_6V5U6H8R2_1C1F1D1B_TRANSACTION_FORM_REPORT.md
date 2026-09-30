# D1B — Transaction Form Report

## Root cause
Canonical `js/modules/finance.js` Transaction Form resolved a profile, calculated `newPaidUntil`, and built the tuition transaction/profile write plan before acquiring the existing per-profile tuition mutation lane. The write itself was serialized, but the financial decision could be stale.

## Patch
The handler now keeps only raw UI intent outside the lane. For Tuition-bearing submissions it enters `TuitionCommandBoundary.runInProfileTuitionMutationLane`, re-resolves the latest local canonical profile via the existing profile store, rechecks settlement through `TuitionDebtCanonical`, recomputes `paidUntil` with the canonical reconciliation helper, builds the final write plan inside the lane, commits through the existing `FinanceService.commitAtomicWritePlan`, then calls `commitLocalTuitionPaymentState` before releasing the lane.

No transaction schema, primary writer, Firestore reader, listener, or UI architecture was added.

## Behavioral evidence
- FORM01: normal Tuition payment -> one atomic primary plan.
- FORM02 / RACE-A: stale Form Sep queued behind a mutation that advances state to Oct -> no Sep regression; no stale plan is committed.
- FORM03 / RACE-B: Sep becomes settled while Form waits -> zero additional transaction/profile write.
- FORM04 / RACE-C: successful Form payment locally commits tuition state; immediate QuickPay before snapshot sees settled state -> zero duplicate write.
- FORM05: injected primary failure -> no false local commit; lane count returns to zero.
- FORM07: independent students can occupy independent profile lanes concurrently.
- Actual canonical `transactionForm.onsubmit` is executed by the D1B gate; business logic is not reimplemented.

## Receipt/lane
The current Transaction Form handler has no dedicated receipt-export stage. D1B does not invent one. Its critical lane ends after primary success + local canonical commit; secondary audit/UI work occurs after the lane.

Status: **PASS in tested same-runtime path**.
