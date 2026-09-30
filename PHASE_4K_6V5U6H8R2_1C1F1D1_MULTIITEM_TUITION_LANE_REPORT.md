# PHASE 4K-6V5U6H8R2.1C1F1D1 — MultiItem Tuition Lane Report

## Result
**PASS — same-runtime tuition-bearing `processMultiItem` now shares the existing `TuitionCommandBoundary.profileMutationLanes`.**

## Root cause
`window.processMultiItem.__atomicInFlight` serialized only MultiItem→MultiItem. It did not serialize MultiItem against QuickPay, Tuition delete/reversal, generic tuition-affecting delete, skipped-month mutation, or other commands using the canonical profile lane. In addition, package months and `paidUntil` were derived from a profile captured before any wait.

## Patch
- `processMultiItem` remains the existing protected legacy high-write owner and keeps its existing `writeBatch` / transaction shape / inventory preparation.
- Tuition-bearing MultiItem calls `TuitionCommandBoundary.runInProfileTuitionMutationLane(...)`; non-Tuition MultiItem does not acquire the tuition lane.
- Inside the lane it re-resolves the latest profile from existing local canonical stores, rebuilds target tuition months, calls canonical `TuitionDebtCanonical.areTuitionMonthsSettled()` and `reconcilePaidUntilFromMonthEvidence(...,{allowRegression:false})`, then performs the same existing batch.
- All-settled Tuition-only becomes no-write. Stale mixed/partially-settled bundle fails closed before primary write; bundle composition is not silently changed.
- After a successful batch, `TuitionCommandBoundary.commitLocalTuitionPaymentState()` updates existing local canonical state before lane release.
- Receipt/audit/UI work occurs after the critical lane result; html2canvas delay cannot hold the tuition lane.

## Dynamic MT evidence
| Case | Result |
|---|---|
| MT01 Tuition-only normal | existing primary writer, serialized |
| MT02 Tuition + Inventory normal | existing same atomic MultiItem effect |
| MT03 QuickPay first, MultiItem waits | PASS; latest state used; no `paidUntil` regression |
| MT04 MultiItem first, QuickPay waits | PASS; same profile never mutates concurrently |
| MT05 stale same-month MultiItem | PASS; no second Tuition payment effect |
| MT06 same month/different amount | PASS through canonical settlement recheck |
| MT07 partially settled stale package | PASS; fail-closed/reconfirm before write |
| MT08 different profiles | PASS; parallel allowed |
| MT09 primary/rejected lane task | PASS; lane cleans; future mutation proceeds |
| MT10 no Tuition | PASS; no unnecessary tuition lane |
| MT11 receipt failure after write | payment preserved; receipt outside lane |
| MT12 F1C completed replay | preserved |

## Scope
Same-runtime concurrency is closed. This client-local lane is **not** a cross-device distributed lock.
