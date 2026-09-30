# F1B Partial-Reversal Replay Report

Invariant implemented: once canonical transaction deletion succeeds, that deleted txId can never be returned from completed replay again.

New order inside the existing `TuitionCommandBoundary.deleteTuitionTransaction()`:

`delete transaction SUCCESS → remove local tx → invalidate completed replay by exact txId → attempt profile reconciliation`.

- Delete failure: no delete-success invalidation occurs.
- Delete success + reconcile success: normal reversal, replay invalidated.
- Delete success + reconcile failure: error remains a partial-write/reconciliation failure, but deleted tx replay is already invalidated.
- Same QuickPay while profile still says paid: canonical settlement blocks the write and returns `txId:null`; it never resurrects the deleted txId.
- After the existing profile recovery later marks the month unpaid: recollect creates a new txId.
- Invalidation is narrow by txId; unrelated completed replay entries remain.

PR01–PR08: **8/8 PASS**.
