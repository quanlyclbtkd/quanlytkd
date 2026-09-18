# PHASE 4K-6V5U6H8R2.1C — UI/UX MOBILE APP SHELL REPORT

## 1. Executive status

**Source acceptance: PASS. Production/manual visual acceptance: PENDING.**

H8R2.1C changes presentation only. The existing business/data JavaScript was byte-compared against the H8R2.1A input: `app.js` plus all 118 files under `js/**/*.js` were checked (119 business JS files total) and **0 files changed**. No Firestore reader/writer/listener authority, business service, schema, Rules, Cloud Function, navigation router, polling loop, or data cache was added.

The new mobile presentation is:

`TOP APP BAR → CONTEXT/SEARCH → EXISTING CONTENT → 5-ITEM BOTTOM NAV`

Desktop presentation remains based on the existing desktop tabs and current module DOM.

## 2. UI baseline audit

The pre-implementation audit is in `PHASE_4K_6V5U6H8R2_1C_UI_PRE_IMPLEMENTATION_AUDIT.md`.

The highest-value baseline findings were:

- mobile navigation depended on the long horizontal legacy tab strip;
- the mobile header included KPI density that consumed excessive above-the-fold space;
- filter controls could stack vertically and consume several rows;
- several existing custom overlays were centered with inline presentation styles, preventing a consistent mobile-sheet presentation;
- the current page contained many legacy inline presentation rules, so adding another large override block to `index.html` would increase CSS ownership ambiguity;
- icon-only close/add controls were not uniformly named for assistive technology;
- `style.css` existed but was not part of the browser's active stylesheet chain.

No audited UI defect required a data-flow or business-logic change.

## 3. CSS source-of-truth map

Browser CSS order before H8R2.1C:

1. existing Google Fonts stylesheet (pre-existing dependency; unchanged);
2. `css/tailwind-static.css`;
3. the large existing inline `<style>` block in `index.html`.

`style.css` is **not linked** and was not made active by this phase.

H8R2.1C adds exactly one presentation layer after the existing inline block:

`css/ui-mobile-shell.css?v=ui-mobile-shell-20260918-h8r2_1c`

CSS ownership evidence:

| Metric | H8R2.1A baseline | H8R2.1C |
|---|---:|---:|
| `!important` in active inline `<style>` | 365 | 365 |
| `!important` in `tailwind-static.css` | 1 | 1 |
| `!important` in new H8R2.1C CSS | — | 0 |
| Inline `style=` attributes | 504 | 502 |
| H8R2.1C stylesheet references | 0 | exactly 1 |

Therefore this phase does **not** increase the active `!important` count.

## 4. DOM contract

The pre-change DOM contract is captured in `UI_DOM_CONTRACT.json`.

Baseline IDs: 513. Final IDs: 525. Missing baseline IDs after patch: **0**. The 12 added IDs are presentation-only:

`mobileBottomNav`, `mobileNavDashboard`, `mobileNavTuition`, `mobileNavAttendance`, `mobileNavStudents`, `mobileNavMore`, `mobileMoreDebt`, `mobileMoreInventory`, `mobileMoreExam`, `mobileMoreExpense`, `mobileMoreQuit`, `uiFilterControls`.

No existing ID was renamed or deleted.

## 5. Before/after mobile architecture

Before:

`mobile header/KPI → horizontal legacy tabs → stacked filters → module content`

After:

`compact mobile app bar → search/context/filter presentation → existing module content → fixed bottom navigation`

The legacy tab DOM remains present. At `<=767px` it is hidden by presentation CSS after the bottom nav has been installed; at `>=768px` the existing desktop navigation remains the presentation.

The canonical breakpoint strategy for the new layer is:

- mobile shell: `max-width: 767px`;
- tablet/desktop: `min-width: 768px`.

## 6. Files changed / added

Runtime/source files changed relative to H8R2.1A:

- `index.html` — presentation markup, viewport accessibility, semantic/ARIA metadata, mobile shell/nav/filter wrappers; no business owner changes;
- `package.json` — adds only `check:ui-mobile-app-shell` script;
- `css/ui-mobile-shell.css` — new single canonical H8R2.1C presentation layer;
- `tools/check-ui-mobile-app-shell.mjs` — UI architecture/static-budget regression gate.

Audit/evidence files added:

- `PHASE_4K_6V5U6H8R2_1C_UI_PRE_IMPLEMENTATION_AUDIT.md`;
- `UI_DOM_CONTRACT.json`;
- this final report.

Business/data JS proof: 119 files (`app.js` + `js/**/*.js`) compared against H8R2.1A, **0 changed**.

## 7. Selectors/classes added

The new layer uses semantic presentation classes including:

`.ui-mobile-shell`, `.ui-bottom-nav`, `.ui-bottom-nav-item`, `.ui-context-bar`, `.ui-context-search`, `.ui-filter-toggle`, `.ui-filter-controls`, `.ui-filter-control`, `.ui-filter-field`, `.ui-filter-sheet-head`, `.ui-filter-done`, `.ui-more-grid`, `.ui-more-module`, `.ui-more-section`, `.ui-icon-button`, `.ui-shell-overlay`, `.ui-visually-hidden`, `.ui-nav-icon`.

New tokens include spacing, radii, font sizes, `--ui-touch-min: 44px`, app-bar/bottom-nav height, shadow, and z-index layers. No random parallel breakpoint system was introduced.

## 8. Legacy selectors removed/deactivated

No legacy business DOM or desktop navigation was deleted.

Within touched presentation scope only:

- the old horizontal tab strip is presentation-hidden on mobile, preserved on desktop;
- inline `align-items:center` ownership was removed from the touched custom overlays so the canonical mobile layer can render them as bottom sheets;
- no mass removal of inline styles was performed;
- existing legacy `nth-child` mobile presentation outside the touched scope was not expanded or used as the new shell architecture.

## 9. Navigation mapping

| Mobile item | Existing authority invoked |
|---|---|
| Tổng quan | `switchTab('dashboard')` |
| Học phí | `switchTab('tx')` |
| Điểm danh | `switchTab('attendance')` |
| Võ sinh | `switchTab('active')` |
| Khác | existing `openMobileMenu()` presentation sheet |

The More sheet reuses `switchTab(...)` for Báo nợ, Kho, Thi đai, Chi phí/Thu Chi and Đã nghỉ. Existing utility actions remain the original handlers.

Active styling is derived from existing active-tab DOM state with CSS selectors; there is no `mobileRouter`, navigation store, route table, history/hash router, observer, timer, or local/session storage authority.

## 10. Proof `switchTab()` remains the sole navigation authority

The mobile shell contains no Firestore or module loader call. Primary module buttons only invoke existing `switchTab(...)`. No new JavaScript router/state module was added. `app.js` and `js/**` are byte-identical to H8R2.1A, which is additional proof that navigation/business owners were not rewritten.

## 11. Proof no reader/writer/listener was added

H8R2.1C UI gate validates the shell/filter/navigation wrappers contain zero direct calls to `getDoc`, `getDocs`, `onSnapshot`, `setDoc`, `updateDoc`, `addDoc`, `writeBatch`, or `runTransaction`.

Static Firestore budget before/after:

| API | H8R2.1A | H8R2.1C | Delta |
|---|---:|---:|---:|
| `getDoc` | 29 | 29 | 0 |
| `getDocs` | 51 | 51 | 0 |
| `onSnapshot` | 16 | 16 | 0 |

No new business writer/service/cache authority exists.

## 12. Filter/search behavior

Mobile filter UI reuses the existing `filterMonth`, `filterBranch` and `searchInput` controls. Presentation wrappers do not directly load data. The shell does not implement a second search engine, server query or filter state store.

The existing transaction hidden-tab optimization remains protected by both the H8R2.1C gate and H8R2.1 long-term stability gate.

## 13. Module-by-module source results

| Module | H8R2.1C presentation result | Business/data owner result |
|---|---|---|
| Dashboard | compact shell/header; existing content retained | unchanged |
| Học phí | bottom-nav entry and responsive presentation | existing Finance/Tuition flow unchanged |
| Báo nợ | More-sheet navigation + responsive card readability | Debt Source of Truth unchanged |
| Điểm danh | existing Attendance presentation retained, shell spacing/touch integration | Attendance gates PASS |
| Võ sinh | mobile navigation/card readability integration | profile/displayName flows unchanged |
| Kho đồ | More-sheet navigation and responsive presentation | Inventory Ledger unchanged |
| Thi đai | More-sheet navigation and current UI polish only | Exam business flow unchanged |
| Thu Chi/Chi phí | More-sheet navigation; no hidden-tab eager load | canonical Transaction flow unchanged |
| Đã nghỉ | More-sheet navigation/card presentation | Quit authority unchanged |
| Search | existing input/index retained | canonical local search unchanged |

## 14. Modal/sheet results

Existing modal IDs and callbacks are retained. H8R2.1C standardizes touched custom overlays through `.ui-shell-overlay`:

- mobile: bottom-aligned sheet presentation with safe-area support;
- desktop: centered dialog presentation;
- mobile inputs/selects/textareas: minimum 16px typography;
- modal buttons in touched layer: minimum touch target token;
- no keyboard polling, observer or new close/business callback was added.

Static ID/handler contract is PASS. Authenticated interactive keyboard/open/scroll/backdrop testing remains a runtime/manual validation item, not claimed by this source report.

## 15. Accessibility results

Source-level checks PASS for:

- viewport no longer disables zoom;
- `viewport-fit=cover` retained;
- mobile body baseline >=14px;
- mobile form controls >=16px;
- touch target token >=44px;
- top/bottom safe-area support;
- all static icon-only close/add buttons in `index.html` have `aria-label` or equivalent accessible name;
- focus-visible styling retained/available;
- reduced-motion media query added;
- status presentation continues to include text, not color alone, in existing modules.

## 16. Viewport test matrix

The source/CSS contract was verified for the requested widths. Because browser navigation is blocked in this container (`net::ERR_BLOCKED_BY_ADMINISTRATOR` for Playwright/system Chromium, and direct headless Chromium did not produce reliable page captures), visual pixel screenshots are **not claimed**.

| Viewport | Expected source presentation | Static contract |
|---|---|---|
| 320×568 | mobile shell | PASS |
| 360×800 | mobile shell | PASS |
| 375×812 | mobile shell | PASS |
| 390×844 | mobile shell | PASS |
| 412×915 | mobile shell | PASS |
| 430×932 | mobile shell | PASS |
| 768×1024 | desktop/tablet presentation | PASS |
| 1366×768 | desktop | PASS |
| 1920×1080 | desktop | PASS |

Live checks for actual data overflow, keyboard interaction, 200% browser zoom and orientation must still be performed in authenticated browser smoke.

## 17. Desktop regression

At `>=768px` the new bottom navigation is not the desktop navigation authority and the original desktop tabs remain in DOM. No desktop business JavaScript changed. All listed system/business gates passed after the UI changes and again after build.

## 18. Visual screenshots

Not captured. The environment has Chromium and Playwright tooling, but browser navigation is administratively blocked and direct headless capture was not reliable. No synthetic image is presented as production evidence.

## 19. Full regression results

Final post-change results:

- `check:ui-mobile-app-shell`: **32/32 PASS**;
- `check:runtime-stability-gate`: **29/29 PASS**;
- `check:long-term-production-stability`: **39/39 PASS**;
- `check:profile-display-name-safe-edit`: **28/28 PASS**;
- `check:production-security-trust-boundary`: **41/41 PASS**;
- `check:production-authority-closure`: **64/64 PASS**;
- `check:attendance-daily-single-refresh-authority`: **73/73 PASS**;
- `check:attendance-explicit-shift-authority`: **60/60 PASS**;
- `check:canonical-transaction-safe-cutover`: **27/27 PASS**;
- `check:inventory-ledger-reconciliation`: **33/33 PASS**;
- `check:financial-action-audit-guard`: **PASS**;
- `check:exam-payment-identity`: **20/20 PASS**;
- `precheck:all:critical`: **EXIT 0**;
- `check:release`: **36/36 PASS**;
- `check:deploy-package`: **12/12 PASS**;
- final post-build runtime gate: **29/29 PASS**;
- final post-build UI gate: **32/32 PASS**.

## 20. Build and root/public parity

`npm run build:public` completed successfully from root source-of-truth.

Final parity:

- `rootFileCount = 124`;
- `publicFileCount = 124`;
- `missing = 0`;
- `extra = 0`;
- `hashMismatch = 0`;
- status: **PASS**.

The count increased from 123 to 124 solely because `css/ui-mobile-shell.css` is a new legitimate runtime presentation file.

## 21. Remaining UI/runtime validation risks

Source architecture and regression gates are closed, but production/manual UI acceptance still requires an authenticated browser to validate real-content geometry and interaction:

- horizontal overflow with production data at all requested viewports;
- modal/sheet keyboard behavior on mobile devices;
- browser 200% zoom and portrait/landscape usability;
- Admin and Coach runtime smoke;
- 25-cycle navigation test for listener/handler/DOM stability;
- screenshot matrix if a browser-capable environment is available;
- runtime unexpected errors/unhandled rejection observation during those sessions.

These items do not indicate a known source defect; they are unexecuted runtime evidence and must not be represented as completed.

## 22. Final source conclusion

**H8R2.1C UI SOURCE = PASS**

Reason: the requested mobile shell exists as a single presentation layer, `switchTab()` remains the navigation authority, all baseline DOM IDs are preserved, business/data JS is unchanged, Firestore budget remains exactly `29/51/16`, critical/release/deploy gates pass, and root/public parity is exact. Production/manual visual acceptance remains pending authenticated browser validation.
