# PHASE 4K-6V5U6H8R2.1C1D — FULL REGRESSION RESULT

## Final command results

| Command / gate | Result |
|---|---|
| `npm run check` | PASS — exit 0 |
| `npm run check:all` | PASS — exit 0 on final full run |
| `npm run check:all:critical` | PASS — exit 0 |
| `npm run check:release` | PASS — 36/36 |
| `npm run check:deploy-package` | PASS — 12/12 |
| `npm run check:root-public-parity` | PASS — 124/124 |
| `npm run check:ui-mobile-app-shell` | PASS — 80/80 |
| `npm run check:canonical-transaction-safe-cutover` | PASS — 27/27 |
| `npm run check:financial-action-audit-guard` | PASS |
| `npm run check:production-stability-gate` | PASS — 22/22 |
| `npm run check:long-term-production-stability` | PASS — 39/39 |
| `npm run check:production-residual-defect-closure` | PASS — 66/66 |
| `npm run check:h8r2-1c1d` | PASS — 16/16 |

Syntax remains PASS (246 items) through the normal `npm run check` pipeline.

## Six formerly failing gates

All now PASS without production behavior changes:

- `check:multiitem-tuition-package-fix`
- `check:inventory-multiitem-readonly-ui`
- `check:global-ownership-adoption-cleanup`
- `check:inventory-dynamic-size-catalog`
- `check:v5r-quit-single-source-lock`
- `check:v5t-command-boundary-write-freeze`

## Execution note

Two early `check:all` attempts were terminated by the execution time window before npm returned. Neither showed an assertion failure. A later complete `npm run check:all` run finished with **exit code 0**, ending at Dashboard Hydration/Mutation Guard **44/44 PASS**. Only the completed exit-0 run is used for final status.

## Regression conclusion

Static regression closure is PASS. No existing PASS boundary became FAIL after the gate-only patches.
