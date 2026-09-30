# PHASE_4K_6V5U6H8R2_1C1F1D1A — Whole-System Regression

## Aggregate gates

- `npm run check` — **PASS / exit 0**
- `npm run check:all` — **PASS / exit 0**
- `npm run check:all:critical` — **PASS / exit 0**
- `npm run check:release` — **PASS / exit 0**

## Phase chain exact results

- C1D: **16/16**
- C1E UI: **28/28**
- C1F: **24/24**
- F1: **32/32**
- F1A: **30/30**
- F1B: **65/65**
- F1C: **46/46**
- F1D: **42/42**
- F1D1: **46/46**
- F1D1A: **48/48**

## Canonical/hard baselines independently rerun

| Domain/gate | Result |
|---|---|
| Production Authority Closure | **64/64 PASS** |
| Auth Context Single Writer | PASS |
| Club Bootstrap | **20/20 PASS** |
| Profile Canonical Store | PASS |
| Quit Authoritative Completeness | PASS |
| Tuition Command Behavior | PASS |
| Tuition/Debt Source of Truth | PASS |
| Canonical Transaction | **27/27 PASS** |
| Payment Accounts | PASS |
| Inventory Ledger | **33/33 PASS** |
| Attendance Explicit Shift | **60/60 PASS** |
| Attendance Daily | **73/73 PASS** |
| Attendance Offline Canonical Sync | **39/39 PASS** |
| Dashboard Single Read | **38/38 PASS** |
| Dashboard Cache Freshness | **49/49 PASS** |
| Dashboard Hydration Guard | **44/44 PASS** |
| Coach Branch Runtime Repair | **25/25 PASS** |
| SuperAdmin Principal Alignment | **24/24 PASS** |
| Exam Finance Separation | PASS |
| Production Stability | **22/22 PASS** |
| Long-Term Stability | **39/39 PASS** |
| Production Residual Defect Closure | **66/66 PASS** |
| Syntax | **246 items OK** |
| Deploy Package | **12/12 PASS** |
| Root/Public Parity | **124/124 PASS** |

No threshold was increased. Legacy checker realignments only replaced stale source-text assumptions (`id` vs normalized `txId`, comment marker dependence, and `const profile` expectation) with checks against the current canonical owner/runtime contract.
