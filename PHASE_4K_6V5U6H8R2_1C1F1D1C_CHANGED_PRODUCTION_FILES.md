# D1C — Changed Production Files

Baseline hash inventory: 151 runtime/config files.

Changed vs D1B input:
1. `app.js` — guard callers consume the canonical structured-result normalizer.
2. `js/core/financialActionAuditGuard.js` — one `isFinancialWriteAllowed` contract, new known Tuition Form/Combo actions, finite/positive payment amount policy.
3. `js/core/tuitionCommandBoundary.js` — canonical guard interpretation uses owner normalizer.
4. `js/modules/finance.js` — Form invariants, Combo validated intents, Form/Combo guard enforcement, detached secondary audit.
5. `package.json` — D1C gate/release DAG wiring only.

Unexpected changed production files: 0.
Missing baseline files: 0.

`js/services/finance.service.js` hash is unchanged from D1B input.
Public mirrors were rebuilt from the canonical root source.
