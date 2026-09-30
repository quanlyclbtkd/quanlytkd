# PHASE 4K-6V5U6H8R2.1C1F1D1 — MultiItem Race Matrix

| Case | Operation order | Required observation | Primary Tuition effect | Status |
|---|---|---|---:|---|
| MT03 | QuickPay Oct → MultiItem Sep | MultiItem waits same profile lane; re-resolves latest profile | legitimate serialized effects only | PASS |
| MT04 | MultiItem Sep → QuickPay Oct | QuickPay waits same profile lane | legitimate serialized effects only | PASS |
| MT05 | QuickPay Sep settles while stale MultiItem Sep waits | MultiItem sees settled month after lane entry | +0 duplicate | PASS |
| MT06 | Same profile / same month / different amount | second mutation rechecks settled state | +0 duplicate after first settlement | PASS |
| MT07 | Sep/Oct bundle becomes partially settled while waiting | no silent bundle reconstruction | 0 stale bundle write | PASS |
| MT08 | different profiles | both lanes may be active | independent | PASS |
| MT09 | first lane task rejects | next task executes | no lane poison | PASS |
| MT10 | no Tuition | tuition lane not acquired | unchanged business flow | PASS |
| MT11 | receipt failure after primary commit | lane already released | +0 retry payment | PASS |
| MT12 | F1C replay/delete interaction | lane-aware replay retained | +0 stale replay | PASS |

Behavioral deferred-Promise tests in `tools/check-h8r2-1c1f1d1-multiitem-inventory-closure.mjs` prove both wait directions and non-regressing final `paidUntil`.
