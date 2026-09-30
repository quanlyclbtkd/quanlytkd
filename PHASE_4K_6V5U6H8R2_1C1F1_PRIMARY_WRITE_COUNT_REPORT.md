# C1F1 — PRIMARY WRITE COUNT REPORT

Primary authority remains exactly one:

`finance.quickPay → TuitionCommandBoundary.collectTuition → FinanceService.commitAtomicWritePlan`

No Firestore read-back or secondary payment writer was added.

## Synthetic authoritative counts
| Case | Transaction/profile primary command delta |
|---|---:|
| ID01 concurrent duplicate | +1 total |
| ID02 sequential replay within completed TTL | +0 after original |
| ID03 different month | +1 |
| ID04 different student | +1 |
| ID05 different club | +1 |
| ID06 receipt failure replay within TTL | +0 |
| ID07 stale-card replay within TTL | +0 |
| ID08 rerender replay within TTL | +0 |

## Authenticated AQ counts
Not measured because AQ01–AQ10 were not executed on a deployed authenticated candidate. No production transaction was created for evidence in this environment.
