# PHASE 4K-6V5U6H8R2.1C1E — UI PATCH REPORT

## Scope

UI/presentation-only micro patch on top of C1D. No business/data-flow source was changed.

## Patch A — Search/Icon precision

**Root cause:** `.ui-search-icon` was absolutely positioned on desktop/tablet with a horizontal offset only. Its vertical position therefore depended on inline/emoji font metrics. On mobile `top:50%` existed, but the emoji itself still had no deterministic box/line-height. The input also relied on inherited line-height.

**Patch:** in `css/ui-mobile-shell.css` only:

- `.ui-context-search { min-width: 0; }`
- `.ui-search-icon` now has a deterministic 20×20 inline-flex box, centered content, `line-height:1`.
- desktop/tablet icon now uses `top:50%; transform:translateY(-50%); pointer-events:none`.
- `.ui-search-input` gets predictable `box-sizing` and line-height.

The existing `#searchInput`, ID, placeholder, filter button, handlers and Search runtime owner were not changed or duplicated.

Supplementary Chromium presentation smoke measured **0 px icon/input center delta** at 320, 360, 390, 430, 768 and 1024 widths.

## Patch B — Debt presentation order

Before:

`Search/Filter → Debt title/actions → Debt KPI → Debt local filter → Debt list`

After:

`Debt title/actions → Debt KPI → Search/Filter → Debt local filter → Debt list`

The existing Debt title/action/KPI nodes were moved, not copied. They are wrapped in a presentation-only sibling `#debtPrimaryActions` before `#filterArea` and shown only while `#tab_debt.active` under the existing tenant-role presentation guard.

Existing action strings remain unchanged:

- Zalo: `onclick="openBulkZaloModal()"`
- Group invoice: `onclick="openComboModal()"`

No new event listener or event wrapper was added. The C1E static gate proves each existing Debt action appears exactly once in the priority block and the handlers remain unchanged.

## Patch C — Tuition compact panel

The existing `#tuitionPrimaryActions` received the semantic presentation class `ui-tuition-payment-panel`. No action/data field was removed.

At <=767px:

- outer padding reduced to 8px 10px;
- gaps and heading spacing reduced;
- three existing action buttons are laid out in a 3-column grid instead of three `w-full` rows;
- buttons retain `min-height: var(--ui-touch-min)` = 44px;
- labels may wrap without clipping.

Supplementary Chromium presentation smoke:

- 320/360/390/430: panel height ≈ **86.8px**;
- mobile action height: **44px** minimum;
- document overflow: **0px** at all tested widths.

## Production source changed

Only:

1. `index.html`
2. `css/ui-mobile-shell.css`

`app.js`, `style.css`, all `js/**`, `firestore.rules`, `firebase.json`, service/core/listener source are unchanged.

## Tooling changed

- `package.json`: `check:release` now runs C1D master exactly once after the existing release gate; adds `check:h8r2-1c1e-ui`.
- `tools/check-h8r2-1c1e-ui-precision.mjs`: new 20-assertion UI/static ownership gate.

## Business / Firestore impact

- Business logic change: **0**.
- New Firestore reader: **0**.
- New Firestore writer authority: **0**.
- New listener: **0**.
- New timer/polling authority: **0**.
- Static Firestore budget remains **29 / 51 / 16**.
