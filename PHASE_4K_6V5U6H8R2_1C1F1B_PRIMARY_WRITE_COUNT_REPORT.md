# F1B Primary Write Count Report

| Case | Expected primary delta | Verified result |
|---|---:|---|
| Normal collect | +1 | +1 |
| Same-profile Sep+Oct | +2 legitimate total | +2 total |
| Same month / same amount concurrent | +1 total | +1 total |
| Same month / different amount concurrent | +1 total if first settles month | +1 total |
| stale replay > TTL | 0 additional | 0 (C1F1A retained) |
| gap later-month already paid | 0 | 0 settlement write |
| delete success → recollect after profile unpaid | +1 | +1 with new txId |
| delete success + reconcile fail while profile still paid | 0 | 0, txId=null |
| receipt reprint | 0 | 0 by static owner boundary |

Same-runtime exactly-once/serialization evidence is dynamic and local-process only. Cross-device concurrency is not claimed.
