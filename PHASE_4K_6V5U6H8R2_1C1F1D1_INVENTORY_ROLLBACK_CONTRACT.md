# PHASE 4K-6V5U6H8R2.1C1F1D1 — Inventory Rollback Contract

## Existing owner reused
`InventoryService.deleteItem(invId, options)` is the existing canonical Inventory owner used for the only F1D1 destructive pure-Inventory route.

## Proven contract from current source
When supplied with existing local `previous` Inventory state and `relatedTxId`, the owner builds one existing Firestore writeBatch that can:
1. delete the Inventory record;
2. reverse/update Inventory aggregate/stat state according to the existing ledger logic;
3. delete the related Finance transaction in the same batch when `relatedTxId` is supplied;
4. update existing local/runtime Inventory state after successful commit.

## Critical F1D1 restriction
The owner has a fallback Firestore `getDoc` when `previous` is absent. F1D1 does **not** use that fallback because the phase forbids new reads. `finance.deleteTx` therefore requires canonical local Inventory state; if absent it **fails closed before the first destructive write**.

## Unsupported / fail-closed cases
- mixed Tuition + Inventory transaction;
- zero actual Inventory document refs while rollback is required;
- multiple/ambiguous actual Inventory refs;
- UI ref conflicts with canonical impact;
- missing local `previous` record;
- unavailable InventoryService owner.

No `InventoryRollbackService`, direct new Inventory writer, polling, or compensating loop was created.
