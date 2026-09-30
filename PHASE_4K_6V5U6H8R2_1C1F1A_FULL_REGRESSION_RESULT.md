# PHASE 4K-6V5U6H8R2.1C1F1A — Full Regression Result

## Aggregates
- `npm run check` — PASS, exit 0
- `npm run check:all` — PASS, exit 0
- `npm run check:all:critical` — PASS, exit 0
- `npm run check:release` — PASS, exit 0

## Phase gates
- C1D — PASS 16/16
- C1E UI — PASS 28/28
- C1F QuickPay/Receipt — PASS 24/24
- C1F1 Idempotency/Asset Recovery — PASS 32/32
- C1F1A Reversal/Stale Duplicate — PASS 30/30

## Canonical gates rerun individually
All returned exit 0:
- Tuition Command Cutover
- Tuition Command Behavior
- Canonical Transaction Safe Cutover
- Tuition/Debt Source of Truth
- Payment Accounts
- Financial Action Audit Guard
- Coach Branch Security
- Coach Branch Runtime Repair
- Production Stability
- Long-Term Production Stability
- Production Residual Defect Closure
- Deploy Package
- Root/Public Parity

Release DAG invokes F1A exactly once after C1F1 and has no recursion.
