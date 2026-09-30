# PHASE 4K-6V5U6H8R2.1C1F1D1 — Nested Inventory Delete Safety

## Result
**PASS in tested source/runtime mocks.** Classification and execution identity now share `TransactionDeleteIntegrity` truth.

## Root cause
F1D classification could see nested inventory impact, but `finance.deleteTx(id, relatedInvId)` could still receive an empty UI/top-level ref. Therefore classifier truth and destructive execution identity could diverge.

## Patch
`TransactionDeleteIntegrity` remains the sole delete-impact classifier and now distinguishes:
- **actual Inventory document refs:** `relatedInvId`, `inventoryId`, `invId`;
- **linkage evidence only:** `paymentBundleId`, `paidTxId`.

It exposes deduplicated canonical `inventoryRefs`. `paymentBundleId/paidTxId` are never promoted into an Inventory document ID.

`finance.deleteTx` treats the UI `relatedInvId` argument only as a hint. Canonical impact wins; conflicts, multiple refs, missing local Inventory evidence, mixed domains, or unsupported rollback all fail closed before destructive writes.

For **pure Inventory** with exactly one canonical ref and a locally loaded `previous` record, it reuses existing `InventoryService.deleteItem(invId,{previous,relatedTxId:id,...})`. That existing owner performs Inventory delete + inventory_stats reversal + related Finance transaction delete in one existing writeBatch. It therefore avoids both `Finance delete → rollback fail` and `rollback → Finance delete fail` two-step sequences.

## NI matrix
NI01–NI12 were represented in behavioral/source assertions: top-level ref, nested-only ref, blank UI hint, conflicts, multi-ref ambiguity, owner failure contract, Finance-delete consistency, pure Tuition unaffected, mixed Tuition+Inventory remains F1D fail-closed, debt/payment linkage, absent record fail-closed, receipt no Inventory mutation. **No new Firestore read was introduced.**
