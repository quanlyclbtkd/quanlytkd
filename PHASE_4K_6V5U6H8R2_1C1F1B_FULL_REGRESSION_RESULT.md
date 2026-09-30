# F1B Full Regression Result

- `npm run check` → PASS, exit 0
- `npm run check:all` → PASS, exit 0
- `npm run check:all:critical` → PASS, exit 0
- `npm run check:release` → PASS, exit 0
- Release Gate → **36/36 PASS**
- C1D → **16/16 PASS**
- C1E UI → **28/28 PASS**
- C1F QuickPay/Receipt → **24/24 PASS**
- C1F1 Idempotency/Receipt Recovery → **32/32 PASS**
- C1F1A Reversal/Stale Duplicate → **30/30 PASS**
- C1F1B Serialization/Gap/Reversal → **65/65 PASS**
- Canonical Transaction → **27/27 PASS**
- Payment Accounts → PASS
- Financial Action Audit → PASS
- Tuition Command cutover/behavior → PASS
- Debt Source of Truth → PASS after intentional gate realignment to F1B gap semantics
- Production Stability → **22/22 PASS**
- Long-Term Stability → **39/39 PASS**
- Coach Branch Runtime Repair → **25/25 PASS**
- Deploy Package → **12/12 PASS**
- Root/Public parity → **124/124 PASS**

Two legacy test harnesses were updated because they mocked only the pre-F1B canonical contract. Production did not receive a second settlement resolver merely to satisfy stale tests.
