# PHASE_4K_6V5U6H8R2_1C1F1D1A — Final Canonical Authority Map

No critical financial domain has a parallel active writer/classifier/lane after F1D1A.

## TUITION — QuickPay

`UI intent`  
→ `js/modules/finance.js :: quickPay` (UI adapter)  
→ `TuitionCommandBoundary.collectTuition`  
→ **ONE `profileMutationLanes` lane**  
→ **ONE `TuitionDebtCanonical` settlement authority**  
→ `FinanceService.commitAtomicWritePlan`  
→ canonical local commit  
→ existing receipt owner/render queue

## TUITION — MultiItem

`MultiItem UI intent`  
→ **protected runtime owner `app.js :: window.processMultiItem`**  
→ SAME `TuitionCommandBoundary.runInProfileTuitionMutationLane` when Tuition exists  
→ SAME `TuitionDebtCanonical` settlement/reconciliation  
→ existing MultiItem `writeBatch` owner (not `collectTuition`, no second tx)  
→ canonical local Tuition commit  
→ lane release  
→ existing receipt owner

## TRANSACTION DELETE

`UI delete intent`  
→ **ONE coordinator `js/modules/finance.js :: window.deleteTx`**  
→ **ONE classifier `TransactionDeleteIntegrity`**  
→ pure Tuition: `TuitionCommandBoundary`  
→ pure Inventory: `InventoryService` only with canonical safe evidence  
→ generic non-Inventory Finance: `FinanceService`  
→ mixed/ambiguous/protected unresolved linkage: **FAIL CLOSED**

## INVENTORY

`Inventory UI row`  
→ renderer emits intent only; relationship refs come from **TransactionDeleteIntegrity**  
→ one finance delete coordinator  
→ **ONE Inventory mutation owner `InventoryService`**

No renderer performs Inventory Firestore mutation. No second nested-ref parser authorizes destructive delete.

## RECEIPT

Payment result / reprint intent  
→ existing `exportReceipt` + existing serialized receipt render queue  
→ no payment writer in receipt/retry path.

## Duplicate-flow classification

| Surface | Active authoritative implementation | Other occurrences | Final classification |
|---|---|---|---|
| `window.quickPay` | `js/modules/finance.js` | `app.js` pre-module no-write/not-ready stub + presence checks | CANONICAL OWNER + guarded bootstrap stub; no second writer |
| `window.deleteTx` | `js/modules/finance.js` | `app.js` pre-module no-write/not-ready stub + callers/presence checks | ONE active coordinator |
| `window.processMultiItem` | `app.js` | presence checks only | LEGACY PROTECTED OWNER, production reachable |
| `window.exportReceipt` | `app.js` | presence check in `main.js` | ONE receipt owner |
| Transaction delete classifier | `TransactionDeleteIntegrity` | render/finance consumers | ONE classifier |
| Inventory mutation | `InventoryService` | `FinanceService.deleteRelatedInventory` delegates to InventoryService | ONE writer owner |
| Tuition lane | `TuitionCommandBoundary.profileMutationLanes` | callers use exposed lane API | ONE lane |
| Tuition settlement | `TuitionDebtCanonical` | callers consume helpers | ONE settlement authority |

**Duplicate active financial critical flow: NO.**
