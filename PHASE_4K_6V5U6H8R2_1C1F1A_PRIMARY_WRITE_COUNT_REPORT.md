# PHASE 4K-6V5U6H8R2.1C1F1A — Primary Write Count Report

Primary writer remains exactly one authority:
`finance.js → TuitionCommandBoundary.collectTuition() → FinanceService.commitAtomicWritePlan()`.

| Case | Expected primary delta | Observed static/dynamic evidence |
|---|---:|---:|
| Normal collect | +1 | +1 |
| Concurrent duplicate | total +1 | total +1 |
| Immediate sequential replay | 0 additional | 0 |
| >30s replay | 0 additional | 0 |
| Completed-map/context empty but already settled | 0 | 0 |
| Fresh boundary with canonical paid profile | 0 | 0 |
| Receipt reprint | 0 | 0 by receipt-only call path |
| Receipt-failure stale collect | 0 additional | 0 |
| Delete failed → recollect | 0 additional | 0 |
| Delete success → recollect | +1 | +1 |
| Different unpaid month | +1 | +1 |
| Different student | +1 | +1 |
| Different club | +1 | +1 |
| Multi-month reversal → recollect | +1 | +1 |

The master F1A gate reports 30/30 PASS. Authenticated production transaction deltas were not measured because candidate deployment/authenticated sessions were unavailable in this environment.
