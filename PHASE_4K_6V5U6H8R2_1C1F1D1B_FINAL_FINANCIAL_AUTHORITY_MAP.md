# D1B — Final Financial Authority Map

## Tuition serialization and settlement

```text
QuickPay UI
  -> js/modules/finance.js
  -> TuitionCommandBoundary.collectTuition
  -> SAME profileMutationLanes
  -> TuitionDebtCanonical
  -> FinanceService.commitAtomicWritePlan
  -> local canonical tuition commit
  -> lane release
  -> secondary audit / receipt

Transaction Form UI
  -> canonical js/modules/finance.js onsubmit
  -> SAME profileMutationLanes
  -> latest local canonical profile
  -> TuitionDebtCanonical
  -> existing FinanceService.commitAtomicWritePlan
  -> local canonical tuition commit
  -> lane release
  -> secondary audit / UI

Family Combo UI
  -> canonical js/modules/finance.js processCombo
  -> SAME deterministic profileMutationLanes for all participants
  -> latest local canonical profiles
  -> TuitionDebtCanonical
  -> existing FinanceService.commitAtomicWritePlan
  -> local canonical commits for all profiles
  -> lane release
  -> secondary audit / receipt

processMultiItem UI
  -> protected existing app.js processMultiItem owner
  -> SAME profileMutationLane when Tuition is present
  -> latest local canonical profile
  -> TuitionDebtCanonical
  -> existing protected atomic batch writer
  -> local canonical tuition commit
  -> lane release
  -> receipt/UI
```

## Delete / Inventory

```text
UI delete intent
  -> ONE finance delete coordinator
  -> TransactionDeleteIntegrity (single classifier / inventory relation authority)
     -> Pure Tuition -> TuitionCommandBoundary owner self-guard -> FinanceService transaction delete + existing reconcile
     -> Safe Pure Inventory -> existing InventoryService owner
     -> Generic non-inventory -> existing FinanceService owner
     -> Mixed / ambiguous / unresolved protected linkage -> FAIL CLOSED
```

## Owner table

| Domain | Canonical/approved owner | Duplicate active authority |
|---|---|---|
| Auth context | verified auth context owner | NO |
| Tuition lane | `TuitionCommandBoundary.profileMutationLanes` | NO |
| Tuition settlement | `TuitionDebtCanonical` | NO |
| QuickPay write | `FinanceService.commitAtomicWritePlan` via TCB | NO |
| Transaction Form write | existing `js/modules/finance.js` + FinanceService | NO |
| Family Combo write | existing `js/modules/finance.js` + FinanceService | NO |
| MultiItem write | protected existing `app.js processMultiItem` batch | NO second writer |
| Delete classification | `TransactionDeleteIntegrity` | NO |
| Transaction delete coordination | canonical Finance coordinator | NO |
| Inventory mutation/rollback | existing `InventoryService` | NO |
| Receipt | existing `exportReceipt` + serialized receipt queue | NO |

Legacy app Transaction Form/Combo are zero-write bootstrap stubs. No alternate active financial writer arrow remains in the audited critical paths.
