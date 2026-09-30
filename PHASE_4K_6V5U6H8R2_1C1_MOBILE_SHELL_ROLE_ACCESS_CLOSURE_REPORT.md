# PHASE 4K-6V5U6H8R2.1C1 — MOBILE SHELL ROLE/ACCESS + UI CONTRACT CLOSURE REPORT

## 1. Executive result

**H8R2.1C1 UI SOURCE = PASS**

This is a presentation-only micro hotfix on top of H8R2.1C. No Firebase/business authority was changed or duplicated.

Source acceptance passed with:

- UI mobile shell role/access gate: **57/57 PASS**
- Firestore static budget: **getDoc 29 / getDocs 51 / onSnapshot 16**
- Root/public parity: **124 / 124**, missing 0, extra 0, hashMismatch 0
- Business runtime hash proof: **119 files checked, 0 changed** (`app.js` + all `js/**/*.js`)
- Release gate: **36/36 PASS**

Manual authenticated mobile smoke is still required after source acceptance; it was not claimed as completed by this source-only environment.

---

## 2. Exact residual defects and root causes

### C1-A — Tenant Bottom Navigation eligibility was too broad

Before C1, the mobile shell used the presentation predicate:

```css
body:has(#mainApp[style*="display: block"]) .ui-bottom-nav { display: grid; }
```

That predicate was incorrect because existing business owners intentionally make `mainApp` visible in three different contexts:

1. accepted normal tenant runtime;
2. SuperAdmin root runtime (`#superAdminView` visible);
3. fail-closed tenant access screen (`#clubAccessBlockBanner` inserted).

Therefore `mainApp visible` was not equivalent to `tenant access accepted`.

### C1-B — More tenant-module section had no role/context presentation wrapper

The H8R2.1C More sheet exposed Debt / Inventory / Exam / Expense / Quit in one unscoped block. Existing Coach security already hides all non-Attendance desktop tabs, but the mobile module block did not mirror that state.

### C1-C — Mobile utility visibility could diverge from desktop controls

Settings / Tax / Excel mobile actions had no stable presentation IDs. Desktop controls already carried current role/context visibility through `#btnSettings`, `#exportTaxBtn`, and `#exportBtn`, but the mobile sheet did not mirror those owners.

### C1-D/E — Filter and More sheet accessibility state was incomplete

- Filter toggle had `aria-controls` but no `aria-expanded` contract.
- Filter sheet had no open-only dialog semantics.
- More sheet had no dialog label/state contract and More triggers did not expose expanded state.

### C1-F — Bottom Navigation label was too small

H8R2.1C used `font-size: 0.68rem` (~10.9px). C1 raises this to `0.75rem` (~12px), while keeping five columns at mobile widths.

---

## 3. Files changed

### Runtime/presentation files

1. `index.html`
   - Added stable utility IDs: `mmsSettingsAction`, `mmsTaxAction`, `mmsExcelAction`.
   - Added semantic wrapper: `mobileMoreModuleSection`.
   - Added Filter trigger ID/state contract: `uiFilterToggle`, `aria-expanded`.
   - Filter controls remain a normal `role="group"` when closed/desktop, switch to `role="dialog" aria-modal="true"` only while the mobile sheet is open, then restore on close.
   - Added More sheet dialog labeling: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-hidden`.
   - Added `aria-controls="mobileMenuSheet"` and `aria-expanded` to all three existing More triggers.
   - Extended the existing DOM-only `openMobileMenu()` / `closeMobileMenu()` functions only to mirror ARIA state. No business/data call was added.

2. `css/ui-mobile-shell.css`
   - Replaced broad `mainApp visible` Bottom Navigation rule with accepted-tenant DOM predicate.
   - Added explicit SuperAdmin/access-block Bottom Navigation suppression.
   - Added access-block suppression for tenant mobile chrome/menu.
   - Added Coach/SuperAdmin/access-block More module parity derived only from existing DOM markers.
   - Added desktop-to-mobile utility visibility mirror selectors.
   - Raised Bottom Navigation label from `0.68rem` to `0.75rem`.
   - New `!important`: **0**.

3. `tools/check-ui-mobile-app-shell.mjs`
   - Replaced false-positive assertion #30.
   - Extended gate to role/access assertions 33–49.
   - Added lightweight pure state scenarios S1–S8 (assertions 50–57) without adding a browser/DOM dependency.

### Documentation/evidence files added

- `PHASE_4K_6V5U6H8R2_1C1_UI_RESIDUAL_AUDIT.md`
- `PHASE_4K_6V5U6H8R2_1C1_BUSINESS_JS_HASH_PROOF.json`
- `PHASE_4K_6V5U6H8R2_1C1_FULL_REGRESSION_OUTPUT.txt`
- `PHASE_4K_6V5U6H8R2_1C1_FINAL_REGRESSION_OUTPUT.txt`
- build/parity/UI-gate evidence files
- this final report

### Explicitly unchanged

- `package.json`: unchanged.
- `app.js`: unchanged.
- every `js/**/*.js`: unchanged.

SHA-256 comparison against H8R2.1C verified **119 business runtime files, changed = 0, missing = 0**.

---

## 4. Proof no business JS changed

Evidence file:

`PHASE_4K_6V5U6H8R2_1C1_BUSINESS_JS_HASH_PROOF.json`

Result:

```text
businessRuntimeFileCount = 119
changedBusinessRuntimeFiles = []
missingBusinessRuntimeFiles = []
status = PASS
```

Therefore C1 did not modify:

- Auth Context
- Club Access Gate
- SuperAdmin implementation
- `switchTab()`
- `enforceRoleTab()`
- Attendance
- Tuition/Debt
- Inventory
- Transaction
- Exam
- SearchRuntime
- Profile/DisplayName logic

---

## 5. Admin mobile result

Source/pure-state proof:

- `mainApp` visible
- `#superAdminView` not active
- no `#clubAccessBlockBanner`

=> accepted-tenant selector allows Bottom Navigation.

Exactly five primary items remain:

1. Tổng quan → existing `switchTab('dashboard')`
2. Học phí → existing `switchTab('tx')`
3. Điểm danh → existing `switchTab('attendance')`
4. Võ sinh → existing `switchTab('active')`
5. Khác → existing `openMobileMenu()`

No new navigation authority exists.

---

## 6. Viewer result

Existing Viewer business presentation does not hide the tenant tab strip; it hides write forms/actions instead. C1 copies no Viewer role table and introduces no Viewer-specific state.

The normal accepted tenant predicate therefore leaves the same five mobile navigation entries available, matching existing tenant navigation authority. Existing business guards remain responsible for write restrictions.

Gate assertion #39 and scenario S3 PASS.

---

## 7. Coach result

Coach authority remains unchanged in `app.js` / RoleReadBoundary:

- all legacy `.tab-btn` except Attendance are hidden;
- Attendance is active;
- full tenant/admin data flows remain restricted by existing boundaries.

C1 derives presentation from those existing DOM results only.

Expected/verified source behavior:

- Bottom Navigation grid collapses to one item.
- Dashboard / Học phí / Võ sinh / Khác are hidden.
- Điểm danh remains visible.
- `#mobileMoreModuleSection` is hidden.
- No mobile route exists to Debt / Inventory / Exam / Expense / Quit.

No role check was copied into a new state store.

Gate assertions #36 and #40 plus scenario S4 PASS.

---

## 8. SuperAdmin result

When existing SuperAdmin owner sets:

```text
mainApp = visible
superAdminView = visible
```

C1 explicitly suppresses tenant Bottom Navigation and tenant More module section.

SuperAdmin root implementation and controls are untouched. No tenant `switchTab()` route is introduced from C1 shell.

Gate assertions #33/#37 and scenario S5 PASS.

---

## 9. Access-block result

Existing `_renderClubAccessBlocked()` remains the only access owner. It:

- hides protected tenant UI;
- makes `mainApp` visible;
- inserts `#clubAccessBlockBanner` with logout action.

C1 now mirrors that DOM state and hides:

- tenant Bottom Navigation;
- tenant context/filter area;
- mobile tenant header/menu trigger;
- `#mobileMenuSheet`;
- `#mobileMoreModuleSection`.

Thus locked, expired, missing, permission-denied and listener-failure states do not gain a mobile presentation path into protected tenant modules.

Gate assertions #34/#35 and scenarios S6–S8 PASS.

---

## 10. Utility visibility parity

New stable presentation IDs:

- `mmsSettingsAction`
- `mmsTaxAction`
- `mmsExcelAction`

Mobile visibility is derived from existing desktop/current controls:

```text
#btnSettings   hidden => #mmsSettingsAction hidden
#exportTaxBtn  hidden => #mmsTaxAction hidden
#exportBtn     hidden => #mmsExcelAction hidden
```

`#mmsChangePasswordBtn` also remains aligned with the existing `#btnChangePassword` presentation state.

No new `if(role === ...)` table or permission store was introduced in the mobile shell.

Gate #41 PASS.

---

## 11. Accessibility residual closure

### Filter

- trigger has `aria-controls="uiFilterControls"`;
- initial `aria-expanded="false"`;
- opening sets `aria-expanded="true"`;
- while open, the existing filter container switches to `role="dialog" aria-modal="true"`;
- closing restores `role="group"` and removes `aria-modal`;
- accessible title: `uiFilterTitle`.

This keeps desktop semantics correct while making the mobile sheet modal only while actually open.

### More

- `mobileMenuSheet` has `role="dialog"`, `aria-modal="true"`, `aria-labelledby="mobileMenuTitle"`;
- initial `aria-hidden="true"`;
- all three existing More triggers have `aria-controls="mobileMenuSheet"` and `aria-expanded="false"`;
- existing `openMobileMenu()` / `closeMobileMenu()` only update DOM class/ARIA state and body overflow; no new listener or business call was added.

### Typography

Bottom Navigation label = **0.75rem (~12px)**.

Gate #46–#48 PASS.

---

## 12. Firestore budget

Before C1:

```text
getDoc      = 29
getDocs     = 51
onSnapshot  = 16
```

After C1:

```text
getDoc      = 29
delta       = 0

getDocs     = 51
delta       = 0

onSnapshot  = 16
delta       = 0
```

UI wrappers contain no new:

- getDoc/getDocs/onSnapshot
- setDoc/updateDoc/addDoc/writeBatch/runTransaction
- `ensureTabModule()` call
- `switchTab()` implementation
- router/store/cache/polling authority

---

## 13. Full gate results

Final source regression after the last ARIA change:

| Gate | Result |
|---|---:|
| UI Mobile App Shell C1 | **57/57 PASS** |
| Runtime Stability | **29/29 PASS** |
| Long-Term Production Stability | **39/39 PASS** |
| Profile Display Name Safe Edit | **28/28 PASS** |
| Production Security Trust Boundary | **41/41 PASS** |
| Production Authority Closure | **64/64 PASS** |
| Attendance Daily Single Refresh | **73/73 PASS** |
| Attendance Explicit Shift | **60/60 PASS** |
| Canonical Transaction Safe Cutover | **27/27 PASS** |
| Inventory Ledger Reconciliation | **33/33 PASS** |
| Financial Action Audit Guard | **PASS** |
| Exam Payment Identity | **20/20 PASS** |
| precheck:all:critical | **PASS / EXIT 0** |
| Release | **36/36 PASS** |
| Deploy Package | **12/12 PASS** |

The Attendance error lines seen inside release regression are deliberate failure-injection cases from existing tests and finish with PASS; they are not new C1 runtime errors.

---

## 14. Root/public parity

Final build used only the existing build pipeline:

```text
npm run build:public
npm run check:root-public-parity
```

Final result:

```text
rootFileCount   = 124
publicFileCount = 124
missing         = 0
extra           = 0
hashMismatch    = 0
status          = PASS
```

`/public` was not manually patched.

---

## 15. Remaining UI debt / runtime validation

### Manual authenticated smoke — pending

Required after source PASS on a real browser/device:

- 390×844
- 430×932
- 320×568
- 768×1024

Validate Admin, Coach, SuperAdmin and a blocked account, especially actual CSS `:has()` behavior, touch ergonomics, More/Filter ARIA state, and role/context presentation.

This report does **not** claim that authenticated manual smoke was executed in the source container.

### C2 explicitly deferred

**MODULE CARD SEMANTIC MIGRATION = DEFERRED TO C2.**

H8R2.1C still contains legacy mobile table-card presentation rules using `nth-child()` / `nth-last-child()` and historical `!important` declarations. C1 intentionally did not mass-refactor those renderers because its scope is only Role/Access/UI Contract closure.

SearchRuntime behavior is also unchanged; no tab-specific search redesign was introduced.

---

## 16. Final source decision

**H8R2.1C1 UI SOURCE = PASS**

Reason:

- role/access presentation now mirrors existing Auth/Role/Club Access DOM authority;
- SuperAdmin and access-block states cannot expose tenant Bottom Navigation;
- Coach mobile tenant navigation exposes only Attendance;
- utility visibility mirrors desktop controls;
- Filter/More accessibility contracts are closed;
- no business JS changed;
- no reader/writer/listener/router/state authority was added;
- Firestore budget remains 29/51/16;
- all mandatory critical/release gates PASS;
- root/public parity PASS.
