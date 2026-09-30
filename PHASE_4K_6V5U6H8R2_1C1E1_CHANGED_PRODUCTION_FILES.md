# PHASE 4K-6V5U6H8R2.1C1E1 — CHANGED PRODUCTION FILES

Full production tree hash scope: `index.html`, `app.js`, `style.css`, `css/**`, `js/**`, `firestore.rules`, `firebase.json` (125 files). Test/tool/report/node_modules/log artifacts are excluded.

## Production runtime files changed

1. `index.html`
   - Added `data-ui-empty-shell="collapse"` to the existing `#transactionForm` only.
   - No ID, handler, form control, calculation, transaction write, or business branch changed.
   - Mirrored exactly to `/public/index.html`.

2. `css/ui-mobile-shell.css`
   - Search icon changed from transform-based vertical centering to box-axis centering inside the existing relative search wrapper.
   - Mobile app-bar More trigger hidden so Bottom Nav `Khác` is the sole mobile More presentation trigger.
   - Added a conditional presentation-only collapse rule for an empty legacy `#transactionForm` shell.
   - No `!important` added by C1E1; C1 Mobile Shell gate remains 80/80.
   - Mirrored exactly to `/public/css/ui-mobile-shell.css`.

## Tooling/report files changed outside production runtime tree

- `package.json`: canonical `check:release` now runs C1D and C1E UI exactly once each.
- `tools/check-h8r2-1c1e-ui-precision.mjs`: extended from 20 to 23 assertions for Search anchoring, mobile More trigger dedup, and empty transaction shell contract.
- C1E1 reports/hashes.

## Explicitly unchanged production authorities

`app.js`, `style.css`, all `js/**` runtime modules/services/listeners, `firestore.rules`, and `firebase.json` are unchanged from the C1E input tree.
