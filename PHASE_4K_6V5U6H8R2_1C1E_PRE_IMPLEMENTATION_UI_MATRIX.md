# PHASE 4K-6V5U6H8R2.1C1E — PRE-IMPLEMENTATION UI MATRIX

Baseline source: `PHASE_4K_6V5U6H8R2_1C1D_REGRESSION_GATE_REALIGNMENT_SOURCE`  
Audit rule: presentation-only; no business/data-flow changes; no new Firestore authority.

## Baseline evidence captured before source change

- `check:h8r2-1c1d`: PASS 16/16, reported Firestore static budget **29/51/16**.
- `check:release`: PASS 36/36.
- `check:ui-mobile-app-shell`: PASS 80/80, reported Firestore static budget **29/51/16**.
- Full root production tree hash recorded in `PHASE_4K_6V5U6H8R2_1C1E_PRODUCTION_TREE_BEFORE.sha256` (125 files).
- No production file has been edited before this matrix was completed.

## Audit matrix

| ID | module | current markup | current CSS owner | current event owner | symptom | root cause | affected viewport | affected role | planned presentation patch | business impact | Firestore impact | risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UI-01 | Global Search / Context | Existing single `#searchInput` inside `.ui-context-search`; existing `.ui-search-icon`; existing `#uiFilterToggle` | `css/ui-mobile-shell.css`; legacy inline/style rules remain underneath but mobile-shell CSS loads later | Search semantics remain owned by `js/modules/searchRuntime.js` in module runtime; `app.js` keeps only the approved legacy fallback handler | Search icon/text can look vertically offset; desktop/tablet icon alignment is less deterministic | Desktop rule positions icon absolutely with `left` only, without explicit vertical centering; emoji line box has no fixed box/line-height. Mobile centers by `top:50%` but still relies on emoji font metrics | 320/360/390/430; also 768 desktop/tablet transition | Admin; any authorized tenant role that sees Search | Keep same node/ID/handlers. Add predictable icon box (`inline-flex`, fixed box, `line-height:1`) and explicit `top:50%/translateY(-50%)` on desktop; normalize input line-height/padding only | None | 0 reads / 0 writes / 0 listeners | Low |
| UI-02 | Debt presentation | `#filterArea` is a sibling before all tab contents. Debt title/actions (`openBulkZaloModal`, `openComboModal`) and debt KPI block currently live inside `#tab_debt`, therefore appear after Search/Filter | `css/ui-mobile-shell.css` + existing utility classes | Zalo button retains inline `onclick="openBulkZaloModal()"` (module implementation in `js/modules/students.js`; legacy fallback remains in `app.js`). Group invoice retains inline `onclick="openComboModal()"`, canonical global owned by `js/modules/finance.js` | On Debt, Search/Filter visually precedes the debt title/actions, contrary to requested priority | DOM order, not handler logic. Existing elements are correctly wired but are nested after the shared context bar | Primarily <=767; desktop should remain coherent after static reorder | Admin; SuperAdmin/Coach remain governed by existing role/tab guards | Move the **existing** debt priority nodes (title/actions + KPI summary) out as one `#debtPrimaryActions` sibling immediately before `#filterArea`. Show it only when `#tab_debt.active`; do not clone any button/search/filter. `#tab_debt` keeps local overdue filter + list | None; same IDs, onclick, data state | 0 reads / 0 writes / 0 listeners | Low-Medium (DOM order only) |
| UI-03 | Tuition priority/payment action panel | Existing `#tuitionPrimaryActions` is already before Search. On mobile it is a column; its child action group is flex and all three buttons carry `w-full` | `css/ui-mobile-shell.css` | Existing inline handlers: `openMultiItemModal()`, `openComboModal()`, `openAddModal()`; untouched | Panel occupies excessive vertical height/white space on 320–430px | `w-full` buttons force three separate mobile rows plus generous panel padding/gaps | 320/360/390/430 | Admin tenant context | Add semantic compact class to existing panel; reduce only panel padding/gap; override action group to compact grid while preserving min 44px touch target and readable wrapping; no field/data removal | None | 0 reads / 0 writes / 0 listeners | Low |
| VER-01 | Production integrity | C1D hashes selected critical files only | N/A | N/A | Need evidence that unrelated production files did not change | Evidence scope too narrow for C1E requirement | All | All | Hash root production tree before/after: `index.html`, `app.js`, `style.css`, `css/**`, `js/**`, `firestore.rules`, `firebase.json`; compare exact changed set | None | None | Low |
| VER-02 | Release gate wiring | `check:h8r2-1c1d` exists as a standalone script; `check:release` currently invokes only `tools/check-release.mjs` | `package.json` | N/A | C1D master is not part of canonical release command | Missing DAG edge, not source defect | N/A | N/A | Add one non-recursive invocation of C1D master to `check:release`; verify no path from C1D back to `check:release` | None | None | Low |

## Files allowed to change after this matrix

Primary expected production changes:

- `index.html`
- `public/index.html` only through canonical public build/parity workflow
- `css/ui-mobile-shell.css`
- `public/css/ui-mobile-shell.css` only through canonical public build/parity workflow

Verification/tooling changes:

- `package.json`
- `tools/check-h8r2-1c1e-ui-precision.mjs`
- C1E reports/evidence files

Production code explicitly kept read-only unless a reproducible defect disproves this audit:

- `app.js`
- `js/services/**`
- `js/core/**`
- `js/listeners/**`
- `firestore.rules`
- `functions/**`

## Audit decision

All three requested UI defects are presentation defects. **No business-logic or Firestore source change is justified.**
