# F1D — MIXED BUNDLE DELETE SAFETY

## Root cause
`finance.js::deleteTx()` previously derived `isTuitionOnly` from tuition type plus absence of top-level `relatedInvId`. Inventory responsibility can live only inside `components[]` (`relatedInvId`, `paymentBundleId`, `paidTxId`, `inventoryId`, `invId`), so a Tuition+Inventory bundle could be misrouted to `TuitionCommandBoundary.deleteTuitionTransaction()`.

## Patch
- Canonical owner remains `TransactionDeleteIntegrity`.
- `analyzeTransactionDeleteImpact()` now emits `hasInventoryLinkage`, `isMixedBundle`, `isPureTuition` and inspects nested inventory link fields.
- Mixed Tuition+Inventory impact adds blocker `mixed-domain-delete-requires-specialized-owner`; `safeToHardDelete=false`.
- `finance.js` consumes only `impact.isPureTuition` for pure-tuition routing.
- Because no existing owner proves complete cross-domain Tuition+Inventory+Profile rollback atomically, mixed delete **fails closed before any destructive write**.

## Behavioral result
MB01 pure tuition -> pure Tuition route. MB02 pure inventory -> non-tuition route. MB03–MB06 mixed/nested linkage -> mixed, not pure Tuition. MB08 unsafe mixed -> blocked; transaction/inventory/profile destructive deltas all 0. Existing inventory ledger owner remains `InventoryService`; no new rollback writer was added.
