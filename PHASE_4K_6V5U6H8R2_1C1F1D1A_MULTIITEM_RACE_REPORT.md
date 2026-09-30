# PHASE_4K_6V5U6H8R2_1C1F1D1A — MultiItem Race Report

Behavioral deferred-promise tests use the actual MultiItem handler plus the existing Tuition lane contract.

| Case | Result | Evidence |
|---|---|---|
| MultiItem Sep pending → same-profile QuickPay Oct | PASS | QuickPay-side mutation waits the same lane; no simultaneous Tuition profile mutation |
| QuickPay Oct pending → MultiItem Sep | PASS | MultiItem waits lane, re-resolves latest profile, and cannot regress `paidUntil` |
| QuickPay Sep settles while stale MultiItem Sep waits | PASS | MultiItem settlement recheck returns no duplicate Tuition write |
| same month / different amount | PASS | second Tuition effect prevented after latest settlement recheck |
| stale mixed bundle | PASS | fail-closed before primary write instead of silently dropping Tuition component |
| different profiles | PASS | parallelism preserved; no global mutex |
| failed MultiItem primary mutation | PASS | lane released; future mutation is not poisoned |
| receipt failure after committed payment | PASS source contract | payment preserved; receipt work occurs after lane release |

Same-runtime Tuition concurrency: **CLOSED**.
Cross-device simultaneous Admin mutation: **OUT OF SCOPE / NOT VERIFIED**.
