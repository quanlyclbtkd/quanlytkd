# PHASE 4K-6V5U6H6 — Full Regression Result

Generated: 2026-08-28T22:02:37Z

- `npm run check:release` → **EXIT 0 — 36/36 release checks PASS**.
- `npm run check` → **EXIT 0**.
- `npm run check:all:critical` → **EXIT 0**.
- `npm run check:all` → **EXIT 0**.
- `npm run build:public` → **EXIT 0**.
- `npm run check:root-public-parity` → **PASS 123/123**.
- `npm run check:startup-read-budget-freeze` → **8/8 PASS, 29/51/16**.

The release gate was intentionally fail-fast during development: its first run exposed H6-C stale residual event accounting; a later run exposed the stale historical-suite membership assertion in `check:db-ready-guards`. Both were reconciled in tooling only before the final PASS.
