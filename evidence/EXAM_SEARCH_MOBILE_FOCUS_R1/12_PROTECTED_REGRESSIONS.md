# 12 — Protected regressions

All 16 requested current gates PASS on pristine baseline and final candidate. No old checker or expected value was modified. No BASELINE_PREEXISTING_RED was observed among these gates, and no final NEW failure remains.

| Gate | Baseline | Candidate | Raw evidence |
|---|---|---|---|
| `check:search-bindings` | PASS | PASS | [baseline](logs/protected-baseline/search-bindings.log) / [candidate](logs/protected-candidate/search-bindings.log) |
| `check:search-v2` | PASS | PASS | [baseline](logs/protected-baseline/search-v2.log) / [candidate](logs/protected-candidate/search-v2.log) |
| `check:cross-tab-search-replay` | PASS | PASS | [baseline](logs/protected-baseline/cross-tab-search-replay.log) / [candidate](logs/protected-candidate/cross-tab-search-replay.log) |
| `check:student-search-index` | PASS | PASS | [baseline](logs/protected-baseline/student-search-index.log) / [candidate](logs/protected-candidate/student-search-index.log) |
| `check:student-name-search-priority` | PASS | PASS | [baseline](logs/protected-baseline/student-name-search-priority.log) / [candidate](logs/protected-candidate/student-name-search-priority.log) |
| `check:search-latency-optimization` | PASS | PASS | [baseline](logs/protected-baseline/search-latency-optimization.log) / [candidate](logs/protected-candidate/search-latency-optimization.log) |
| `check:exam-payment-identity` | PASS | PASS | [baseline](logs/protected-baseline/exam-payment-identity.log) / [candidate](logs/protected-candidate/exam-payment-identity.log) |
| `check:exam-cancel-fee` | PASS | PASS | [baseline](logs/protected-baseline/exam-cancel-fee.log) / [candidate](logs/protected-candidate/exam-cancel-fee.log) |
| `check:exam-canonical-ledger` | PASS | PASS | [baseline](logs/protected-baseline/exam-canonical-ledger.log) / [candidate](logs/protected-candidate/exam-canonical-ledger.log) |
| `check:exam-auto-select-paid` | PASS | PASS | [baseline](logs/protected-baseline/exam-auto-select-paid.log) / [candidate](logs/protected-candidate/exam-auto-select-paid.log) |
| `check:exam-registration-count` | PASS | PASS | [baseline](logs/protected-baseline/exam-registration-count.log) / [candidate](logs/protected-candidate/exam-registration-count.log) |
| `check:exam-upgrade-finance-separation` | PASS | PASS | [baseline](logs/protected-baseline/exam-upgrade-finance-separation.log) / [candidate](logs/protected-candidate/exam-upgrade-finance-separation.log) |
| `check:exam-fee-ui-cleanup` | PASS | PASS | [baseline](logs/protected-baseline/exam-fee-ui-cleanup.log) / [candidate](logs/protected-candidate/exam-fee-ui-cleanup.log) |
| `check:ui-mobile-app-shell` | PASS | PASS | [baseline](logs/protected-baseline/ui-mobile-app-shell.log) / [candidate](logs/protected-candidate/ui-mobile-app-shell.log) |
| `check:production-security-trust-boundary` | PASS | PASS | [baseline](logs/protected-baseline/production-security-trust-boundary.log) / [candidate](logs/protected-candidate/production-security-trust-boundary.log) |
| `check:production-authority-closure` | PASS | PASS | [baseline](logs/protected-baseline/production-authority-closure.log) / [candidate](logs/protected-candidate/production-authority-closure.log) |

Coverage includes existing search bindings/index/ranking/latency/replay, exam identity/cancel/canonical ledger/paid selection/registration/Finance separation, mobile shell, production security and authority closure. The mobile-shell gate remains 81/81; its GREEN does not substitute for native browser focus proof.

Phase-specific behavioral checker: baseline 22 PASS / 66 RED; candidate 88 PASS / 0 FAIL. It executes actual render/search/scheduler/menu implementations with synthetic RAM/DOM/SDK guards. Blank roster output is compared byte-for-byte; private focus helper equivalence and existing callback routing are checked dynamically.

Chromium focus acceptance is separately BROWSER_FOCUS_PROOF_ENV_BLOCKED. No full-system stability, production release, physical-device mobile acceptance or real transaction claim is made.
