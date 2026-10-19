# PHASE 4K-6V5U6H6 — Exam Export State Purity Test

Generated: 2026-08-28T22:02:37Z

## Root cause

H5 `exportExamPaidList()` temporarily replaced `window.__store.transactions` with the export transaction subset before invoking the existing canonical Exam ledger. If the ledger threw before restoration, the global transaction runtime state could remain poisoned. The ledger already supports `options.transactions`, so global mutation was unnecessary.

## Patch

Canonical owner remains **`window.buildCanonicalExamPaymentLedger()`**. H6 calls it as:

```js
window.buildCanonicalExamPaymentLedger({
    month: selMonth,
    transactions: allTransactions
});
```

Removed from export runtime: `_prevTxs`, assignment to `window.__store.transactions`, restore/delete logic. No cloned store, second ledger, Firestore read, listener, or writer was introduced.

## Results

- `check:exam-export-state-purity` — **9/9 PASS**.
- Forced ledger failure: original `window.__store.transactions` object reference remains identical after failure — **PASS**.
- Canonical ledger receives the loaded export subset via `options.transactions` — **PASS**.
- Static export source contains no assignment/delete of `window.__store.transactions` — **PASS**.
- One canonical Exam ledger call remains — **PASS**.
- No direct profile Firestore reader/listener in export — **PASS**.
- `check:exam-export-full-roster` — **21/21 PASS**.
- `check:exam-export-belt-sort` — **13/13 PASS**.
- `check:exam-export-download` — **10/10 PASS**.
- `check:exam-upgrade-finance-separation` — **PASS**.
- `check:report-export-lazy-isolation` — **115 assertions PASS**.

Full-roster semantics remain intact: zero-paid export does not abort; cancelled payment is unpaid; combo uses `examAmount`; branch sheets and `BELT_NEXT` remain canonical.
