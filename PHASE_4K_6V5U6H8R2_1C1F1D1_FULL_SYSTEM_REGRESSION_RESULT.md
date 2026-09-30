# PHASE 4K-6V5U6H8R2.1C1F1D1 — Full System Regression Result

## Aggregates
- `npm run check` — **PASS / exit 0**
- `npm run check:all` — **PASS / exit 0**
- `npm run check:all:critical` — **PASS / exit 0**
- `npm run check:release` — **PASS / exit 0**
- Deploy Package — **12/12 PASS**

## Phase gates
- F1D1 — **46/46 PASS**
- F1D — **42/42 PASS**
- F1C — **46/46 PASS**
- F1B — **65/65 PASS**
- F1A — **30/30 PASS**
- F1 — **32/32 PASS**
- C1F — **24/24 PASS**
- C1E UI — **28/28 PASS**
- C1D — **16/16 PASS**

`check:release` contains the F1D1 closure gate exactly **once**.

## Representative hard baselines re-run
- Production Authority Closure — exit 0 (established 64/64)
- Auth Context Single Writer — PASS
- Club Bootstrap Single Read — **20/20 PASS**
- Profile Canonical Store — PASS
- Tuition Command behavior — PASS
- Tuition/Debt Source of Truth — PASS
- Canonical Transaction — **27/27 PASS**
- Payment Accounts — PASS
- Inventory Ledger Reconciliation — **33/33 PASS**
- Attendance Explicit Shift — PASS (established 60/60)
- Attendance Daily Single Refresh — PASS (established 73/73)
- Coach Branch Runtime Repair — **25/25 PASS**
- Dashboard Single Read — **38/38 PASS**
- Dashboard Cache Freshness — **49/49 PASS**
- Dashboard Hydration Guard — **44/44 PASS**
- SuperAdmin Principal Alignment — PASS
- Exam Upgrade Finance Separation — PASS
- Exam Canonical Ledger — PASS
- Production Stability — PASS (established 22/22)
- Long-Term Stability — **39/39 PASS**
- Root/Public parity — **124/124 PASS**

## STOP-rule corrections during F1D1
No thresholds were raised. `finance.js` was reduced below the existing 72,000-byte ceiling and `app.js` below the existing 11,300-line ceiling. Legacy gates were realigned only where they encoded superseded implementation details while preserving or strengthening ownership/correctness assertions.
