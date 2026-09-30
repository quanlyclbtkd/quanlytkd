# PHASE 4K-6V5U6H8R2.1C1F1C — PRIMARY WRITE COUNT REPORT

Canonical primary writer remains `FinanceService.commitAtomicWritePlan()` through `TuitionCommandBoundary.collectTuition()`.

| Case | Primary payment delta |
|---|---:|
| Normal legitimate collect | +1 |
| Concurrent exact duplicate | total +1 |
| Immediate completed replay | +0 additional |
| Replay after TTL / replay entry eviction with canonical paid state | +0 additional (F1A/F1B baseline retained) |
| LR01 delete pending + recollect | waits; after successful delete/reconcile to unpaid, recollect +1 |
| LR02 delete failure + queued recollect | +0 additional |
| LR03 delete success + reconcile failure + profile still paid | +0 additional |
| Legacy future-gap delete itself | 0 unrelated tuition payment writes |
| LB10 recollect future month after successful reversal | +1 new transaction |
| Receipt reprint | +0 |
| Different profile collect | independent +1 per legitimate profile command |

Deleted txId replay after canonical delete SUCCESS: **0 occurrences in executed same-runtime race tests**.
