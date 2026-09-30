# PHASE 4K-6V5U6H8R2.1C1F1D1 — Write/Delete Count Report

| Case | Transaction write | Transaction delete | Profile write | Inventory write/delete | Additional payment |
|---|---:|---:|---:|---:|---:|
| Normal MultiItem Tuition-only | existing +1 | 0 | existing +1 | 0 | +1 legitimate |
| Normal MultiItem Tuition+Inventory | existing bundle effect | 0 | existing Tuition update | existing Inventory batch op | legitimate existing bundle |
| stale same-month MultiItem after QuickPay | 0 | 0 | 0 | 0 | **0** |
| stale partially-settled mixed MultiItem | 0 | 0 | 0 | 0 | **0** fail-closed |
| different profiles | independent | independent | independent | independent | independent |
| pure Inventory, canonical single ref + local state | 0 new tx | **1 in existing InventoryService batch** | 0 | **1 existing owner rollback/delete** | 0 |
| nested Inventory ref but missing local rollback evidence | 0 | 0 | 0 | 0 | 0 fail-closed |
| conflicting/multiple Inventory refs | 0 | 0 | 0 | 0 | 0 fail-closed |
| mixed Tuition+Inventory delete | 0 | 0 | 0 | 0 | 0 fail-closed |
| receipt reprint/retry | 0 | 0 | 0 | 0 | **0** |

Counts describe the behavioral contract verified by F1D1 mocks/source. No additional writer authority was added.
