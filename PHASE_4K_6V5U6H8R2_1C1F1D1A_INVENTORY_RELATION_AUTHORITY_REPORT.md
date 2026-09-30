# PHASE_4K_6V5U6H8R2_1C1F1D1A — Inventory Relation Authority Report

## Canonical owner

`js/core/transactionDeleteIntegrity.js` is the single destructive-delete relationship/classification authority.

F1D1A exposes/uses the pure canonical helper `extractInventoryRefsFromTransaction(tx)` and keeps linkage classification in the same owner.

### Actual Inventory document identity

Only validated existing Inventory ID fields are treated as rollback document identity:

- `relatedInvId`
- `inventoryId`
- `invId`
- the same fields inside validated inventory/inventoryDebt components

Refs are normalized, blank/`undefined`/`null` values are ignored, and duplicates are removed.

`paymentBundleId` and `paidTxId` are **linkage evidence**, not Inventory document IDs.

## Consumer closure

- Active `inventoryRenderer` consumes `TransactionDeleteIntegrity.extractInventoryRefsFromTransaction()`; it no longer implements a top-level-only nested-ref parser.
- Protected legacy app renderer is kept behaviorally aligned with the same canonical helper.
- `finance.deleteTx` consumes `TransactionDeleteIntegrity.analyzeTransactionDeleteImpact()` and canonical refs; it does not recreate nested parsing.

Nested-only `components[].relatedInvId` actual renderer test: **PASS**.
