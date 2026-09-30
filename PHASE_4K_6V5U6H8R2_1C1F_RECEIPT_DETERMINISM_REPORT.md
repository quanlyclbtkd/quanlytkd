# C1F Receipt Determinism Report

## Changes
- Added `ensureHtml2CanvasReady(reason)` to the existing `js/core/lazyAssetsBootstrap.js` owner using `_loadScriptOnce`.
- One shared asset promise; 20-second timeout; already-loaded fast path; error codes `asset-load-timeout` / `asset-load-failed`.
- Removed direct html2canvas script injection from `app.js`.
- `exportReceipt()` now returns:
  - success: `{ ok: true, receiptJpeg, previewOpened: true }`
  - failure: `{ ok: false, reason, error }`
- `quickPay()` inspects this result and explicitly tells the operator that payment is already successful and must not be collected again.
- Added receipt render serialization with `_receiptRenderQueue`; requests are serialized, not coalesced.

## Race evidence
Pre-patch source mutated shared `#receiptTemplate`, crossed an async boundary, then rendered. The deterministic model produced `Receipt-A` observing `Receipt-B`, proving a shared-template race. Serialization was therefore justified under the phase rule.

## Backward compatibility
Legacy callers that ignore the return value continue to work. Callers that await it can now distinguish success/failure without requiring a global throw contract.
