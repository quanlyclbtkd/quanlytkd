# D1B — Changed Production Files

Before/after hash audit covered **129 production/runtime/config files** from the D1B pre-implementation baseline. Missing files: **0**.

Runtime source files changed intentionally:
1. `app.js` — hard-disable legacy Transaction Form/Family Combo writer implementations.
2. `js/modules/finance.js` — inside-lane Form/Combo freshness, plan construction, local commits.
3. `js/core/tuitionCommandBoundary.js` — canonical Tuition delete owner self-guard.
4. `js/core/transactionDeleteIntegrity.js` — classifier correction for actual Inventory refs.
5. `js/services/finance.service.js` — secondary fee-audit failure becomes observable without rollback/retry.

Tooling metadata:
6. `package.json` — D1B master gate + release DAG wiring.

`package-lock.json` unchanged. No unrelated production file changed relative to the D1B before-hash baseline.
