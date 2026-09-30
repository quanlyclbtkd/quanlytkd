# C1F1 — FULL REGRESSION RESULT

Final run after all patches and STOP-rule corrections:

- `npm run check` — PASS, exit 0
- `npm run check:all` — PASS, exit 0
- `npm run check:all:critical` — PASS, exit 0
- `npm run check:release` — PASS, exit 0
- `npm run check:h8r2-1c1d` — 16/16 PASS
- `npm run check:h8r2-1c1e-ui` — 28/28 PASS
- `npm run check:h8r2-1c1f-quickpay` — 24/24 PASS
- `npm run check:h8r2-1c1f1` — 32/32 PASS
- Syntax — 246 items PASS
- Canonical Transaction — 27/27 PASS
- Payment Accounts — 33 checks PASS
- Tuition/Debt Source of Truth — PASS
- Financial Action Audit — PASS
- Coach Branch — 35/35 PASS
- Production Stability — 22/22 PASS
- Long-Term Stability — 39/39 PASS
- Residual Defect Closure — 66/66 PASS
- Deploy Package — 12/12 PASS
- Root/Public parity — 124/124 PASS

Release DAG executes C1D, C1E UI, C1F and C1F1 exactly once each; no recursion.

## STOP-rule history
1. Initial final `npm run check` detected `app.js` line ceiling regression. The C1F1 receipt visibility code was compacted without changing semantics; threshold was not raised.
2. First release attempt detected +2 event-listener and +1 timer delta from preview readiness. The patch was corrected to use `img.decode()` / element `onload`-`onerror` properties with no new listener/timer authority. Residual Closure returned to 66/66.
3. All required aggregates were rerun after the final correction and PASS.
