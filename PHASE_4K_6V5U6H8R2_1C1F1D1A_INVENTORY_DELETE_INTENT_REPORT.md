# PHASE_4K_6V5U6H8R2_1C1F1D1A — Inventory Delete Intent Report

Three delete intents are now explicit and fail-closed where evidence is insufficient.

### A. Finance transaction exists
UI intent → one `window.deleteTx` coordinator → `TransactionDeleteIntegrity` → correct domain owner.

- pure Tuition → `TuitionCommandBoundary.deleteTuitionTransaction`
- pure Inventory with exactly one canonical ref + loaded `previous` → existing `InventoryService.deleteItem`
- generic non-Inventory Finance → existing `FinanceService.deleteTransaction`
- mixed/ambiguous/unsupported Inventory impact → fail-closed

### B. No Finance transaction exists, valid Inventory row exists
Renderer emits a blank Finance tx ID as explicit Inventory-row intent, never literal `"undefined"`. Coordinator uses the loaded canonical Inventory row and delegates only to existing `InventoryService.deleteItem` when there is no protected payment linkage.

### C. Protected linkage exists but Finance transaction cannot be resolved
`paidTxId`, `paymentBundleId`, or related protected payment linkage → **FAIL CLOSED**. No guessed transaction ID and no destructive write.

## Guards

- `FinanceService.deleteTransaction()` never receives `undefined`, `null`, `"undefined"`, `"null"`, or `""` from the UI delete coordinator.
- `TransactionDeleteIntegrity.analyzeTransactionDeleteImpact({})` returns invalid/fail-closed semantics and cannot authorize a destructive delete.
- Multiple/ambiguous Inventory refs fail closed unless an existing owner explicitly proves support.
- Mixed Tuition+Inventory F1D protection remains fail-closed.
