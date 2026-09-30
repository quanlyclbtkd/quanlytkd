# D1B — Tuition Delete Self-Guard Report

`TuitionCommandBoundary.deleteTuitionTransaction()` now enforces its own domain invariant instead of relying only on the Finance caller or top-level `relatedInvId`.

It validates transaction ID and recomputes delete impact via the canonical `TransactionDeleteIntegrity.analyzeTransactionDeleteImpact({...tx,id})`. The owner fails closed unless the result is valid pure Tuition: Tuition impact present, no Inventory impact, no Inventory rollback requirement, no mixed bundle, and `isPureTuition === true`.

Behavioral DEL01–DEL06:
- pure Tuition: allowed;
- nested Inventory component: rejected;
- mixed Tuition+Inventory: rejected;
- `requiresInventoryRollback`: rejected;
- empty/invalid transaction: rejected;
- caller-supplied fake “safe” impact cannot bypass the owner's recomputed canonical impact.

A classifier defect found during this phase was also fixed in the canonical owner: actual top-level Inventory document refs make `hasInventory=true`; payment linkage IDs remain linkage evidence and are not treated as Inventory document IDs.

Status: **PASS / fail-closed at owner boundary**.
