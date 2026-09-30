# PHASE 4K-6V5U6H8R2.1C1E1 — UI RESIDUAL FIX REPORT

## Scope

UI/presentation-only micro patch. No business/data-flow authority was changed.

## E1-01 — Search icon misalignment

Root cause: the existing icon was absolutely positioned with `top: 50%` plus `transform: translateY(-50%)`. Although the wrapper was already correct, the visual position still depended on emoji glyph/line-box rendering and transform centering.

Patch:

- Kept the single existing `.ui-search-icon` and single `#searchInput`.
- Kept `.ui-context-search` as the canonical relative wrapper.
- Replaced transform centering with a fixed 20×20 icon box anchored by `top:0; bottom:0; margin-block:auto`.
- Kept left anchor 12px and input left padding 40px.
- No Search handler, debounce, oninput, keyup, filter state, ID, or owner changed.

## E1-02 — Duplicate top-right mobile More trigger

Root cause: the mobile app bar contained `.mhb-menu-btn` calling the same canonical `openMobileMenu()` used by Bottom Nav `#mobileNavMore`. This created two presentation entry points on <=767px.

Patch:

- On <=767px, `.mobile-header-bar .mhb-title-row > .mhb-menu-btn` is hidden by CSS.
- No `!important` was introduced; an initial `!important` attempt was immediately reverted after Mobile Shell gate dropped to 79/80, then reimplemented with clean selector specificity.
- Bottom Nav `Khác` remains the sole mobile More presentation trigger.
- The canonical owner remains `js/ui/legacyUiShell.js`; `openMobileMenu()` / `closeMobileMenu()` logic was not changed.
- Desktop/legacy menu handler markup was not deleted.

## E1-03 — Empty `#transactionForm` shell

Root cause: all direct canonical controls in the legacy form are baseline-hidden, but the form itself retained background, padding, border, shadow, and margin.

Patch:

- Kept `#transactionForm`, every existing child control, ID, onchange/submit path, and business lifecycle.
- Added `data-ui-empty-shell="collapse"` to the existing form.
- Added a presentation-only `:has()` rule that collapses the form only when no direct non-hidden child is visible.
- If a legitimate runtime path reveals any direct form child, the selector no longer matches and the form can render normally.

## Regression evidence

- Mobile UI Shell: 80/80 PASS.
- C1E UI precision gate: expanded 20 → 23 assertions, 23/23 PASS.
- Tuition Command cutover: PASS.
- Tuition actions: PASS.
- No production business JS modified.
- Firestore static budget unchanged: 29 / 51 / 16.
- Root/Public parity: 124/124 PASS.
