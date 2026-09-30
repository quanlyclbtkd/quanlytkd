# PHASE 4K-6V5U6H8R2.1C1F1A — Changed Files

Production/root changes relative to C1F1 baseline:
- `js/core/tuitionDebtCanonical.js` — canonical month settlement helper.
- `js/core/tuitionCommandBoundary.js` — Layer-2 settled precondition, replay metadata/context cleanup, narrow reversal invalidation.
- `js/main.js` — local profile reversal state sync only after confirmed reconciliation write.
- `js/modules/finance.js` — honest UX for already-settled result without txId (no synthetic receipt/date).
- `package.json` — F1A gate + release wiring.

Mirrored `/public` copies were rebuilt through the existing packaging procedure.

Test/tool changes:
- `tools/check-h8r2-1c1f1a-reversal-stale-duplicate.mjs` (new)
- C1F/C1F1/V5U2 behavior harnesses updated only to supply the newly required canonical settlement dependency / strengthened context semantics.

No `firestore.rules`, `firebase.json`, schema, Cloud Function, new reader, new writer or new listener was added.
