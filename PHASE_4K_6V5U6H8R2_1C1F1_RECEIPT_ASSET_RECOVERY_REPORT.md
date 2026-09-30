# C1F1 — RECEIPT ASSET RECOVERY REPORT

## Root cause
`_loadScriptOnce()` retained `asset.promise` after terminal rejection. After CDN/network failure or timeout, later calls joined the same rejected promise and could not recover until page reload.

## Patch
The existing `js/core/lazyAssetsBootstrap.js` remains the only lazy asset owner. Terminal failure now:

1. settles the current flight once;
2. classifies error (`asset-load-failed`, `asset-load-timeout`, `asset-load-invalid`);
3. sets `asset.promise = null`;
4. clears loading/loaded state appropriately;
5. detaches/removes failed script node;
6. uses an in-owner generation token so old late callbacks cannot mutate a newer flight.

There is **no automatic retry**. A new flight starts only after a new explicit request such as receipt reprint/QuickPay receipt request.

## AR matrix
| Case | Result |
|---|---|
| AR01 already loaded fast path | PASS |
| AR02 first load success | PASS |
| AR03 first network failure | PASS — rejected flight reset |
| AR04 explicit request after AR03 | PASS — new flight succeeds |
| AR05 timeout | PASS — terminal state reset |
| AR06 explicit request after timeout | PASS — new flight succeeds |
| AR07 two callers during one flight | PASS — one script/one promise |
| AR08 two callers after terminal failure | PASS — one new retry flight |
| AR09 timeout then old late-onload | PASS — old generation cannot corrupt new flight |

No new Firestore activity is involved.
