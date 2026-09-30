# PHASE 4K-6V5U6H8R2.1C1F1A — Reversal Replay Invalidation Report

## Root cause
A completed QuickPay entry could survive deletion/reversal of its transaction and replay the now-deleted `txId`. The delete path also accepted a reconciliation helper returning `{ok:false}` without converting the overall operation into failure.

## Patch
- Added narrow `TuitionCommandBoundary.invalidateCompletedReplayForTransaction(txId)` semantics inside the existing owner.
- Successful tuition delete/reversal order is now:
  1. existing canonical transaction delete;
  2. existing tuition profile reconciliation;
  3. confirm reconciliation did not return `ok:false`;
  4. invalidate only completed replay rows matching the deleted `txId`;
  5. perform the existing domain invalidation/audit.
- No global `completedReplay.clear()` is used for transaction deletion.
- If transaction deletion fails before success, replay remains protected.
- If transaction deletion succeeds but profile reconciliation reports failure, the operation is surfaced as partial failure and is not treated as successful reversal.
- Existing reconciliation local-state sync was tightened: local `paidMonths/paidUntil` changes occur only after the Firestore profile reversal write is confirmed (`writeOk=true`). This prevents a failed reversal write from making local state falsely unpaid.

## Dynamic evidence
- ID10 Collect → Delete SUCCESS → Recollect: matching replay invalidated, profile reopened, new primary commit +1, new txId differs from deleted txId.
- ID11 Collect → Delete FAIL → Recollect: replay/paid protection remains; primary delta 0.
- ID12 multi-month package delete: affected months reopen under existing reversal semantics; recollect is one legitimate new commit.
- Old deleted txId is not replayed after successful reversal.

No new Firestore read, writer authority, listener, scheduler, collection, or schema is introduced.
