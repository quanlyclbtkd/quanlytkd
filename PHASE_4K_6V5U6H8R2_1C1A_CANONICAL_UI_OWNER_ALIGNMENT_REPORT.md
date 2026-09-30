# PHASE 4K-6V5U6H8R2.1C1A — CANONICAL UI OWNER ALIGNMENT REPORT

## 1. Executive result

**Source acceptance: PASS.**

H8R2.1C1A closes the More Sheet ownership mismatch without changing data flow, business logic, navigation semantics, Firestore authority, role authority, or access authority.

The runtime owner remains exactly:

`js/ui/legacyUiShell.js`

The inline `index.html` implementation and `js/legacy/legacyUiFallbacks.js` remain rollback/emergency fallbacks only and now expose the same presentation semantics as the canonical owner.

Manual authenticated mobile smoke has **not** been executed in this container and remains required before Production UI PASS.

---

## 2. Exact ownership root cause

H8R2.1C1 placed More Sheet accessibility/body-scroll behavior in the inline fallback in `index.html`:

- `aria-hidden=false/true`
- trigger `aria-expanded=true/false`
- `document.body.style.overflow='hidden' / ''`

However, `GlobalOwnershipRegistry` declares `openMobileMenu` and `closeMobileMenu` as `module-primary` globals owned by `js/ui/legacyUiShell.js`.

After `initLegacyUiShell()` runs, the module implementation replaces the pre-existing inline global. Therefore the C1 gate could validate fallback semantics while the real post-bootstrap owner did not perform the same accessibility/body-scroll updates.

This was a **UI ownership correctness defect**, not a business/data defect.

---

## 3. GlobalOwnershipRegistry proof

`js/core/globalOwnershipRegistry.js` remains unchanged.

Manifest lines 26–27:

- `openMobileMenu` → owner `js/ui/legacyUiShell.js`
- `closeMobileMenu` → owner `js/ui/legacyUiShell.js`
- policy remains `module-primary`
- registration remains required

No second More-menu controller, router, state authority, or global owner was introduced.

---

## 4. Files changed

Runtime/source changes relative to H8R2.1C1:

1. `js/ui/legacyUiShell.js` — canonical UI owner alignment only.
2. `js/legacy/legacyUiFallbacks.js` — emergency fallback presentation parity only.
3. `index.html` — existing rollback fallback parity; SuperAdmin `mmsAdminBtn` no longer forced hidden.
4. `tools/check-ui-mobile-app-shell.mjs` — gate corrected to test canonical runtime owner and dynamic ownership handoff.

`package.json` unchanged.

`css/ui-mobile-shell.css` unchanged.

No changes to `app.js`, `js/modules/**`, `js/services/**`, data boundaries, auth boundaries, or role/access business owners.

Hash proof: `PHASE_4K_6V5U6H8R2_1C1A_BUSINESS_JS_HASH_PROOF.json` confirms **123 JS files outside the two explicitly allowed UI owner/fallback files are unchanged** compared with H8R2.1C1.

---

## 5. Canonical runtime owner — before / after OPEN

### Before

`js/ui/legacyUiShell.js::openMobileMenu()`:

- resolved `mobileMenuSheet`;
- preserved SuperAdmin `mmsAdminBtn` visibility;
- added `.open`;
- returned `true`.

It did **not** set `aria-hidden`, trigger `aria-expanded`, or lock body scroll.

### After

`js/ui/legacyUiShell.js`, lines 35–54:

- same sheet lookup;
- same `window.isSuperAdminRole()` behavior;
- same `.open` class;
- `aria-hidden='false'`;
- every `[aria-controls="mobileMenuSheet"]` gets `aria-expanded='true'`;
- `document.body.style.overflow='hidden'`;
- returns `true`.

No Firebase or business call exists in the function.

---

## 6. Canonical runtime owner — before / after CLOSE

### Before

`closeMobileMenu()` only removed `.open` and returned `true`.

### After

`js/ui/legacyUiShell.js`, lines 56–66:

- removes `.open`;
- `aria-hidden='true'`;
- every More trigger receives `aria-expanded='false'`;
- restores `document.body.style.overflow=''`;
- returns `true`.

No new event listener, timer, observer, state store, or data call was added.

---

## 7. Legacy inline fallback parity

The existing inline fallback in `index.html` remains intentionally present so `GlobalOwnershipRegistry` can retain a rollback reference.

C1A keeps the same presentation contract as the canonical owner:

OPEN:

- sheet open;
- `aria-hidden=false`;
- all triggers expanded;
- body scroll locked;
- `mmsAdminBtn` uses existing `window.isSuperAdminRole()` when available.

CLOSE:

- sheet closed;
- `aria-hidden=true`;
- all triggers collapsed;
- body scroll restored.

The former unconditional `mmsAdminBtn.style.display='none'` fallback behavior was removed because it conflicted with the canonical SuperAdmin presentation.

---

## 8. Emergency `legacyUiFallbacks.js` parity

`js/legacy/legacyUiFallbacks.js`, lines 67–104 now mirrors the same presentation semantics and retains its existing safe guards.

It performs zero Firestore reads/writes/listeners.

No shared data module or new controller was created.

---

## 9. SuperAdmin behavior

Preserved.

Canonical OPEN still derives `mmsAdminBtn` visibility from the existing helper:

`window.isSuperAdminRole()`

Dynamic test result:

- SuperAdmin mock → `mmsAdminBtn.style.display === 'block'`.
- normal tenant mock → `mmsAdminBtn.style.display === 'none'`.

C1 role/access CSS continues suppressing tenant Bottom Nav and tenant More module section in SuperAdmin root view. C1A does not change SuperAdmin business/data behavior.

---

## 10. Coach behavior

C1 role presentation remains unchanged:

- tenant Bottom Nav exposes Attendance only;
- tenant module section in More remains hidden;
- utility More Sheet may still expose allowed utilities such as password change/logout.

C1A changes only canonical More Sheet open/close presentation semantics.

`enforceRoleTab()` and Coach security are untouched.

---

## 11. Access-block behavior

C1 fail-closed CSS remains unchanged:

- blocked tenant shell does not expose Bottom Nav;
- `mobileMenuSheet` / tenant module navigation remains inaccessible when `#clubAccessBlockBanner` exists.

C1A does not alter the Club Access Gate and does not create an alternate route to tenant modules.

---

## 12. Dynamic canonical-owner test

`tools/check-ui-mobile-app-shell.mjs` no longer treats the inline fallback as proof of runtime ownership.

The dynamic fixture:

1. installs mock inline fallback functions first;
2. creates a mock sheet, three triggers, body style, and `mmsAdminBtn`;
3. imports the real `js/ui/legacyUiShell.js`;
4. calls real `initLegacyUiShell()`;
5. verifies `window.openMobileMenu === canonicalModule.openMobileMenu` and the equivalent close reference;
6. executes the installed canonical functions.

Results:

- D1 canonical module replaces inline global: PASS.
- D2 canonical OPEN class/ARIA/body-lock contract: PASS.
- D3 canonical CLOSE class/ARIA/body-restore contract: PASS.
- D4 SuperAdmin utility visibility: PASS.
- D5 normal tenant utility visibility: PASS.

Final UI gate: **75/75 PASS**.

---

## 13. Firestore / authority proof

Static budget before H8R2.1C1A:

- `getDoc = 29`
- `getDocs = 51`
- `onSnapshot = 16`

After H8R2.1C1A:

- `getDoc = 29`
- `getDocs = 51`
- `onSnapshot = 16`

Delta: **0 / 0 / 0**.

The canonical and fallback More-menu functions contain zero:

- `getDoc`
- `getDocs`
- `onSnapshot`
- `setDoc`
- `updateDoc`
- `addDoc`
- `writeBatch`
- `runTransaction`

No reader, writer, listener, cache, router, scheduler, polling, observer, role store, or auth/access store was added.

---

## 14. Regression results

Mandatory source regression:

- `check:ui-mobile-app-shell` — **75/75 PASS**
- `check:runtime-stability-gate` — **29/29 PASS**
- `check:long-term-production-stability` — **39/39 PASS**
- `check:profile-display-name-safe-edit` — **28/28 PASS**
- `check:production-security-trust-boundary` — **41/41 PASS**
- `check:production-authority-closure` — **64/64 PASS**
- `check:attendance-daily-single-refresh-authority` — **73/73 PASS**
- `check:attendance-explicit-shift-authority` — **60/60 PASS**
- `check:canonical-transaction-safe-cutover` — **27/27 PASS**
- `check:inventory-ledger-reconciliation` — **33/33 PASS**
- `check:financial-action-audit-guard` — PASS
- `check:exam-payment-identity` — **20/20 PASS**
- `precheck:all:critical` — PASS
- `check:release` — **36/36 canonical checks PASS**
- `check:deploy-package` — **12/12 PASS**

Post-build verification repeated:

- UI gate — **75/75 PASS**
- Runtime gate — **29/29 PASS**
- Release gate — **36/36 PASS**

---

## 15. Build / root-public parity

`npm run build:public` completed from root source. `/public` was not manually patched.

Final parity:

- rootFileCount = **124**
- publicFileCount = **124**
- missing = **0**
- extra = **0**
- hashMismatch = **0**
- status = **PASS**

---

## 16. Manual mobile smoke status

**PENDING — not claimed as executed.**

Required on deployed candidate at 390×844:

- Admin More OPEN/CLOSE: body scroll lock/restore and ARIA state;
- Coach utility sheet: same presentation contract, tenant modules still hidden;
- SuperAdmin More: `Mở CLB Mới` remains available while tenant modules remain hidden;
- blocked account: tenant menu remains inaccessible.

Source acceptance does not substitute for this authenticated/manual runtime proof.

---

## 17. Remaining UI debt / C2

**PHASE H8R2.1C2 — Semantic Mobile Cards + Module-by-Module UX Polish remains DEFERRED.**

C1A intentionally does not modify:

- legacy `nth-child` card conversion;
- module renderers;
- SearchRuntime;
- filter ownership;
- business forms;
- data loading behavior.

The only issue addressed here is ownership parity of the existing More Sheet presentation contract.

---

## 18. Acceptance conclusion

All source acceptance conditions for H8R2.1C1A are satisfied:

- canonical owner owns More Sheet ARIA updates;
- canonical owner owns body scroll lock/restore;
- SuperAdmin utility remains available;
- Coach/access-block C1 behavior preserved;
- inline and emergency fallback semantics aligned;
- actual runtime owner dynamically tested;
- no business/data authority changed;
- Firestore budget remains 29/51/16;
- all mandatory critical/release gates PASS;
- root/public parity PASS.

**H8R2.1C1A UI SOURCE = PASS**
