# C1F1 — CHANGED PRODUCTION FILES

Full production-tree hash comparison shows exactly four production source files changed:

1. `app.js` — receipt preview/visibility success contract and stage-specific failure classification.
2. `js/core/lazyAssetsBootstrap.js` — terminal failed-flight reset + generation protection, no auto retry.
3. `js/core/tuitionCommandBoundary.js` — short completed replay protection inside the existing command owner.
4. `js/modules/finance.js` — completed-replay user message and receipt date from canonical command result.

Root mirrors were synchronized to `/public` and parity is 124/124 PASS.

Non-production tooling changes:
- `package.json` — adds `check:h8r2-1c1f1` and wires it once into `check:release`.
- `tools/check-h8r2-1c1f1-idempotency-receipt-recovery.mjs` — new 32-assertion gate.

No change to Firestore Rules, schema, services writer authority, Debt source of truth, Inventory, Attendance, Auth context or listener authority.
