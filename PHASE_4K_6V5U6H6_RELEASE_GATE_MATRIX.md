# PHASE 4K-6V5U6H6 — Canonical Release Gate Matrix

Generated: 2026-08-28T22:02:37Z

## Single release authority

Exactly one production source-release decision command exists: **`npm run check:release`**. It orchestrates existing checkers and contains no business/runtime authority. `check`, `check:all`, and `check:all:critical` remain development/backward-compatible suites.

Final result: **36/36 canonical checks PASS, EXIT 0**.

| # | Gate | Ownership | Final |
|---:|---|---|---|
| 1 | `check:syntax` | Existing canonical checker | PASS |
| 2 | `check:production-authority-closure` | Existing canonical checker | PASS |
| 3 | `check:production-security-trust-boundary` | Existing canonical checker | PASS |
| 4 | `check:auth-context-single-writer` | Existing canonical checker | PASS |
| 5 | `check:club-bootstrap-single-read-authority` | Existing canonical checker | PASS |
| 6 | `check:club-initial-snapshot-access-gate` | Existing canonical checker | PASS |
| 7 | `check:club-listener-bootstrap-readiness` | Existing canonical checker | PASS |
| 8 | `check:club-root-field-authority` | Existing canonical checker | PASS |
| 9 | `check:parallel-read-authority` | Existing canonical checker | PASS |
| 10 | `check:startup-read-budget-freeze` | Existing canonical checker | PASS |
| 11 | `check:dashboard-single-read-authority` | Existing canonical checker | PASS |
| 12 | `check:dashboard-cache-freshness-guard` | Existing canonical checker | PASS |
| 13 | `check:dashboard-hydration-mutation-guard` | Existing canonical checker | PASS |
| 14 | `check:attendance-explicit-shift-authority` | Existing canonical checker | PASS |
| 15 | `check:attendance-daily-single-refresh-authority` | Existing canonical checker | PASS |
| 16 | `check:attendance-offline-canonical-sync-guard` | Existing canonical checker | PASS |
| 17 | `check:attendance-canonical-ownership` | Existing canonical checker | PASS |
| 18 | `check:canonical-transaction-safe-cutover` | Existing canonical checker | PASS |
| 19 | `check:debt-authoritative-tuition-coverage` | Existing canonical checker | PASS |
| 20 | `check:inventory-ledger-reconciliation` | Existing canonical checker | PASS |
| 21 | `check:coach-attendance-only-read-boundary` | Existing canonical checker | PASS |
| 22 | `check:security-coach-branch-boundary` | Existing canonical checker | PASS |
| 23 | `check:coach-sensitive-config-closure` | Existing canonical checker | PASS |
| 24 | `check:exam-upgrade-finance-separation` | Existing canonical checker | PASS |
| 25 | `check:exam-export-belt-sort` | Existing canonical checker | PASS |
| 26 | `check:exam-export-download` | Existing canonical checker | PASS |
| 27 | `check:exam-export-full-roster` | Existing canonical checker | PASS |
| 28 | `check:exam-export-state-purity` | Existing canonical checker | PASS |
| 29 | `check:reports-module-syntax` | Existing canonical checker | PASS |
| 30 | `check:report-export-lazy-isolation` | Existing canonical checker | PASS |
| 31 | `check:stored-xss-trust-boundary` | Existing canonical checker | PASS |
| 32 | `check:profile-rename-referential-guard` | Existing canonical checker | PASS |
| 33 | `check:production-residual-defect-closure` | Existing canonical checker | PASS |
| 34 | `check:db-ready-guards` | Existing canonical checker | PASS |
| 35 | `check:runtime-month-admission-hydration` | Existing canonical checker | PASS |
| 36 | `check:deploy-package` | Existing canonical checker | PASS |

## Deploy orchestration

`deploy:hosting` now requires:

```text
check:release
→ build:public
→ check:root-public-parity
→ check:deploy-package
→ firebase deploy --only hosting --project quanly-tst
```

Rules and Functions are **not** part of this deploy command. No deployment was executed in H6.

## First-run evidence

The first H6 release-gate attempt stopped at the stale Production Residual event budget; after structural reconciliation it later stopped once at stale `check:db-ready-guards` historical-suite membership. Both were checker-only defects. Final release run is PASS.
