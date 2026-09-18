# PHASE 4K-6V5U6H8R2.1C1D — GATE REALIGNMENT REPORT

## Scope result

**Gate realignment: PASS. Production source change: NONE.**

All six reported failures were reproduced from the supplied C1C package and classified as stale test/fixture/normalizer behavior. No production JS/CSS/HTML/Rules file was changed to satisfy a stale assertion.

## Gate-by-gate result

| Gate | Baseline | Root cause | Test-only action | Final |
|---|---:|---|---|---:|
| `check:multiitem-tuition-package-fix` | FAIL | Required obsolete literal `paidUntil: lastMonth` | Added semantic evaluator that extracts and executes the exact production monotonic block; verifies T1–T4, profile update, canonical payment bundle and Debt consumption | PASS |
| `check:inventory-multiitem-readonly-ui` | FAIL | Same obsolete paidUntil literal expectation | Reused semantic monotonic gate; keeps read-only UI ownership assertions intact | PASS |
| `check:global-ownership-adoption-cleanup` | FAIL | Mock element lacked `setAttribute()` required by current ARIA contract | Extended fixture with minimal DOM attribute/event APIs and added ARIA/body-scroll/idempotence assertions | PASS — 112 assertions |
| `check:inventory-dynamic-size-catalog` | FAIL 27/28 | Expected local `summaryPatch` call shape | Gate now verifies prepare → `prepared.summaryPatch` → same batch commit, increment provenance, no duplicate writer | PASS 29/29 |
| `check:v5r-quit-single-source-lock` | FAIL 13/16 | Required removed 60-second TTL refresh and obsolete mutation reason strings | Gate now verifies event-driven dirty/completeness invalidation, current-tab authoritative refresh, same-club complete-cache short-circuit, single getDocs flight, Coach fail-closed | PASS 18/18 |
| `check:v5t-command-boundary-write-freeze` | FAIL | Signature normalizer treated bounded existing `fee_audit` loop as new writer | Added a semantic equivalence class only for the approved Class-2 combo fee-audit loop; frozen total/per-op limits remain unchanged | PASS |

## paidUntil semantic cases

The gate executes the extracted production expressions, not a copied replacement implementation:

- T1 `previous < candidate` → candidate: PASS
- T2 `previous == candidate` → candidate: PASS
- T3 `previous > candidate` → previous: PASS
- T4 future `paidUntil` + older back-payment → future boundary preserved: PASS
- T5 canonical tuition component + payment bundle still committed: PASS
- T6 Debt canonical logic consumes the final profile `paidUntil`: PASS

The stale requirement `paidUntil: lastMonth` is no longer accepted as evidence of correctness.

## Quit authority

The production authority remains event-driven:

- no `ageMs > 60000` mandatory refresh;
- no `setInterval` polling in the Quit authoritative loader;
- membership changes mark the existing authority dirty;
- active Quit tab requests the existing authoritative completeness flow;
- clean same-club complete state short-circuits without a new read;
- `_quitAuthorityPromise` preserves single-flight;
- Coach returns before full-profile Quit read authority.

## V5T fee_audit classification

The approved current flow remains:

`canonical primary commit → bounded secondary fee_audit projection → classified consistency diagnostic on projection failure`.

The normalizer does **not** increase the frozen total/per-operation write thresholds. It only maps the historical two unrolled fee-audit signatures and the current bounded loop shape into one semantic equivalence class.

## Files changed in this phase

Test/gate layer only:

- `tools/check-multiitem-tuition-package-fix.mjs`
- `tools/check-inventory-multiitem-readonly-ui.mjs`
- `tools/check-global-ownership-adoption-cleanup.mjs`
- `tools/check-inventory-dynamic-size-catalog.mjs`
- `tools/check-v5r-quit-single-source-lock.mjs`
- `tools/check-v5t-canonical-command-boundary-write-freeze.mjs`
- `tools/helpers/paidUntilMonotonicGate.mjs` (new test helper)
- `tools/check-h8r2-1c1d-regression-gate-runtime-readiness.mjs` (new master gate)
- `package.json` (`check:h8r2-1c1d` wiring only)

Production runtime source hashes before/after are identical; see the Firestore/parity/final reports and `_c1d_evidence/*/production_hashes.sha256`.
