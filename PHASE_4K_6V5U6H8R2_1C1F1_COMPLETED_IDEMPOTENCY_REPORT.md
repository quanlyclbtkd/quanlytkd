# C1F1 — COMPLETED QUICKPAY IDEMPOTENCY REPORT

## Root cause
`TuitionCommandBoundary` previously protected only the **in-flight** interval. After a successful command, `.finally()` removed the key from `inFlight`, so an immediate sequential replay of the same QuickPay command could execute the canonical atomic writer again.

## Patch
The existing `TuitionCommandBoundary` remains the sole command owner. It now contains a **short-lived completed replay guard** in the same owner:

- TTL: 30,000 ms.
- Successful canonical results only.
- No Firestore/localStorage/global data authority.
- No new writer/reader/listener.
- Expired entries are pruned opportunistically; no scheduler/polling.
- Guard is bounded to at most 120 retained entries.

Canonical fingerprint uses:

`operation + club + canonical profile identity + branch + normalized target months + amount`

The replay result reuses the original canonical result and adds:

`deduped: true, completedReplay: true`

## Business semantics frozen
Custom amount semantics and `paidUntil = max(previous, candidate)` remain unchanged. The replay guard does not infer payment from `paidUntil` or `paidMonths`.

## Dynamic ID matrix
| Case | Expected primary delta | Actual synthetic delta | Result |
|---|---:|---:|---|
| ID01 concurrent A + A | +1 | +1 | PASS |
| ID02 sequential A then A (within TTL) | 0 after first | 0 | PASS |
| ID03 same student, different month | +1 | +1 | PASS |
| ID04 same month, different student | +1 | +1 | PASS |
| ID05 same command identity, different club | +1 | +1 | PASS |
| ID06 receipt failure then same QuickPay replay (within TTL) | 0 | 0 | PASS by same completed-result mechanism |
| ID07 stale Debt-card replay (within TTL) | 0 | 0 | PASS by same completed-result mechanism |
| ID08 page rerender then identical replay (within TTL) | 0 | 0 | PASS by same completed-result mechanism |

## Important scope
This is intentionally a **very short command replay guard**, not a durable payment truth. C1F1 does not add a persisted idempotency collection/field. The authenticated production matrix remains required before release closure.
