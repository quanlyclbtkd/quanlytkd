# D1C — Final Financial Authority Map

## Financial authorization
UI/command intent → **FinancialActionAuditGuard** → owner-level `isFinancialWriteAllowed` → caller proceeds/blocks.

## Tuition serialization and settlement
QuickPay / Transaction Form / Family Combo / Tuition-bearing MultiItem / tuition delete-status mutations
→ **TuitionCommandBoundary profileMutationLane(s)**
→ **TuitionDebtCanonical**
→ approved existing writer for that flow
→ local canonical Tuition state commit
→ lane release
→ receipt / secondary audit / UI.

## Writers
- QuickPay: `FinanceService.commitAtomicWritePlan` via TuitionCommandBoundary.
- Transaction Form: existing canonical finance module + `FinanceService.commitAtomicWritePlan`.
- Family Combo: existing canonical finance module + `FinanceService.commitAtomicWritePlan`.
- MultiItem: protected existing `processMultiItem` batch writer, using the SAME Tuition lane/settlement.

## Delete / Inventory
UI delete intent → one Finance delete coordinator → **TransactionDeleteIntegrity** → correct domain owner.
Inventory mutation/rollback → existing **InventoryService**.

## Receipt
Existing `exportReceipt` / receipt render queue only.

Active alternate financial writer = **0** in audited critical paths.
Duplicate Tuition lane owner = **0**.
Duplicate settlement authority = **0**.
Duplicate Financial Guard owner = **0**.
