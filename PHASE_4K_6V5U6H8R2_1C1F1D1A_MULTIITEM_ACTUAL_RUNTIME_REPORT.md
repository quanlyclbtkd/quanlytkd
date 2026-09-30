# PHASE_4K_6V5U6H8R2_1C1F1D1A — MultiItem Actual Runtime Report

## Root cause actually reproduced

`window.processMultiItem` in `app.js` declared `profile` with `const` and later reassigned it to `latestProfile` after entering the Tuition mutation lane. The production handler therefore could throw `TypeError: Assignment to constant variable` before its primary batch committed.

## Micro patch

- `app.js :: window.processMultiItem`
- `const profile = allProfiles[name]` → `let profile = allProfiles[name]`.
- No writer, transaction schema, modal, bundle composition, receipt owner, or Firestore flow was replaced.

## Actual-handler evidence

The F1D1A master gate loads the exact `window.processMultiItem = async (action) => {...}` source block from production `app.js`, evaluates that source with controlled DOM and service/Firestore mocks, and invokes `window.processMultiItem('pay')`. The handler itself is not reimplemented by the test.

| Case | Result | Primary effect |
|---|---|---|
| ACT01 Tuition-only valid payment | PASS | No TypeError; one existing primary batch |
| ACT02 Tuition + Inventory | PASS | No runtime crash; existing atomic MultiItem business effect preserved |
| ACT03 no Tuition | PASS | No unnecessary Tuition lane / Tuition profile mutation |
| ACT04 invalid input | PASS | Visible safe failure; zero destructive writes |

## Critical ordering retained

For Tuition-bearing MultiItem: identity/inputs → SAME `TuitionCommandBoundary` profile lane → latest local canonical profile → `TuitionDebtCanonical` settlement recheck → canonical non-regressing `paidUntil` calculation → existing MultiItem `writeBatch` → local canonical Tuition state commit → release lane → receipt/UI.

Receipt rendering is outside the profile mutation lane.
