# F1B Changed Files

Compared with the F1A source baseline:

Production/source changes:
- `js/core/tuitionCommandBoundary.js`
- `js/core/tuitionDebtCanonical.js`
- `js/main.js`
- `package.json` (gate/release wiring only)

Test/gate realignment/additions:
- `tools/check-h8r2-1c1f1b-tuition-serialization-gap-reversal.mjs` (new)
- `tools/check-v5u2-tuition-command-behavior.mjs` (stale mock contract updated)
- `tools/check-tuition-debt-source-of-truth-v4c.mjs` (gap semantics realigned)
- `tools/check-h8r2-1c1f-quickpay-receipt.mjs` (stale canonical mock updated)
- `tools/check-h8r2-1c1f1-idempotency-receipt-recovery.mjs` (stale canonical mock updated)

`/public` contains the mirrored production build. No Firestore Rules, firebase.json, receipt owner, finance service writer, or CSS/UI source was changed by F1B.
