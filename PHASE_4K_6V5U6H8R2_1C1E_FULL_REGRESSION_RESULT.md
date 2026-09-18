# PHASE 4K-6V5U6H8R2.1C1E — FULL REGRESSION RESULT

## Aggregate gates

| Command | Result |
|---|---|
| `npm run check` | PASS, exit 0 |
| `npm run check:all` | PASS, exit 0 |
| `npm run check:all:critical` | PASS, exit 0 |
| `npm run check:release` | PASS, exit 0; Release Gate 36/36 then C1D 16/16 |
| `npm run check:h8r2-1c1d` | PASS 16/16 |
| `npm run check:h8r2-1c1e-ui` | PASS 20/20 |

One earlier combined shell invocation reached the execution-window limit after `check:all:critical` had already completed with exit 0 while continuing to the next command. `check:release` was then rerun independently and returned exit 0. This is an execution-wrapper timeout, not a gate failure.

## Canonical boundary gates

| Boundary | Result |
|---|---|
| Syntax | PASS — 246 items |
| Mobile UI Shell | PASS 80/80 |
| Canonical Transaction | PASS 27/27 |
| Tuition Command Cutover | PASS |
| Tuition Command Behavior | PASS |
| Tuition/Debt Source of Truth | PASS |
| Inventory Ledger | PASS 33/33 |
| Quit Single Source | PASS 18/18 |
| Quit Behavior | PASS 5/5 |
| Attendance Explicit Shift | PASS 60/60 |
| Attendance Daily | PASS 73/73 |
| Attendance Canonical | PASS — 141 assertions |
| Coach Attendance-only Boundary | PASS 30/30 |
| Coach Branch Security | PASS 35/35 |
| Coach Branch Repair | PASS 25/25 |
| Production Stability | PASS 22/22 |
| Long-Term Production Stability | PASS 39/39 |
| Residual Defect Closure | PASS 66/66 |
| Financial Action Audit | PASS |
| Deploy Package | PASS 12/12 |
| Root/Public parity | PASS 124/124 |

Note: the residual-defect test intentionally prints a simulated failure stack as part of a negative-path scenario; its final result is 66/66 PASS.

## C1D invariants retained

- `paidUntil` monotonic semantic tests remain PASS (previous<candidate, equal, previous>candidate, older back-payment does not move paidUntil backward).
- Quit remains event-driven dirty/completeness authority; no 60-second mandatory refresh/polling was restored.
- Mobile canonical owner remains `js/ui/legacyUiShell.js`.
- No production `js/**` file changed in C1E.

## Final static decision

**STATIC REGRESSION: PASS.**

Authenticated browser acceptance and Rules Emulator runtime are separate evidence dimensions and are not converted to PASS by this static result.
