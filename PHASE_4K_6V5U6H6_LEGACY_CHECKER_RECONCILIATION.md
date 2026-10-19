# PHASE 4K-6V5U6H6 — Legacy Checker Reconciliation

Rule: production source is never changed merely to satisfy an obsolete regex. Each checker is classified against the current canonical owner first.

## 1. `check:runtime-bootstrap`

**CHECKER_EXPECTATION**  
`initSaaSDatabase()` directly writes `window.currentClubId`, `window.__store.currentClubId`, and `window.__store.currentUser`; logout directly writes the old aliases.

**CURRENT_SOURCE_ARCHITECTURE**  
Phase V5U5 moved normal authenticated writes into the single writer `_commitVerifiedAuthContext()`. It writes `currentClubId`, `window.currentClubId`, `window.userRole`, `window.coachBranch`, all matching `window.__store` mirrors, and `window.__store.currentUser`. Logout calls `_resetVerifiedAuthContext('logout')`, which clears the same mirrors.

**WHICH ONE IS CANONICAL?**  
Current source architecture. `check:auth-context-single-writer` verifies it.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Planned checker fix: extract `_commitVerifiedAuthContext` and `_resetVerifiedAuthContext` local scopes and assert the one-writer/reset contract. Do not restore direct writes in `initSaaSDatabase()`.

---

## 2. `check:payment-accounts`

**CHECKER_EXPECTATION**  
Debt QR must reconstruct an obsolete `_debtBranch`; `quickPay` must directly pass its input branch to receipt generation.

**CURRENT_SOURCE_ARCHITECTURE**  
Debt rows already pass canonical `safeBranch` into `generateMultiMonthPaymentRequest()`, and the current students bridge passes that branch into `exportReceipt()`. `quickPay()` sends branch into `TuitionCommandBoundary.collectTuition()` and prints the receipt using canonical `result.branch` returned by that command.

**WHICH ONE IS CANONICAL?**  
Current command-boundary/receipt flow.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Planned checker fix: verify debt QR `safeBranch → generateMultiMonthPaymentRequest → exportReceipt` and `quickPay → collectTuition(branch) → exportReceipt(result.branch)`.

---

## 3. `check:search-bindings`

**CHECKER_EXPECTATION**  
Parent Portal must retain a server-side profile search; Attendance shift filter must be discoverable through old app-level assumptions.

**CURRENT_SOURCE_ARCHITECTURE**  
Parent Portal is hard-disabled by H2 and its Firestore/Auth path must remain absent. Attendance shift filtering is canonical in `js/services/attendance.service.js`: `if (shiftId) ... where('shiftId','==',shiftId)`, with `js/modules/attendance.js` supplying the selected shift.

**WHICH ONE IS CANONICAL?**  
H2 Parent Portal retirement + Attendance service authority.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Planned checker fix: assert retired Parent Portal reader remains absent and inspect the Attendance service/module boundary directly. Do not add Parent search or a second Attendance query.

---

## 4. `check:profile-hydration`

**CHECKER_EXPECTATION**  
Literal `status === 'active'` is required for active-profile compatibility.

**CURRENT_SOURCE_ARCHITECTURE**  
Canonical classification is `classifyProfileStatus(profile)`, with legacy `active/isActive/status` compatibility. Profile listeners and render paths use it.

**WHICH ONE IS CANONICAL?**  
`classifyProfileStatus` compatibility classifier.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Planned checker fix: require classifier-based active/quit hydration, not literal schema narrowing.

---

## 5. `check:student-pagination-controls-dom`

**CHECKER_EXPECTATION**  
Quit list must always create old shared server-pagination controls using `students_quit` prefix.

**CURRENT_SOURCE_ARCHITECTURE**  
Quit authority is the complete authoritative quit dataset. Mobile renders it completely; desktop uses bounded load-more over that authoritative data. Shared server pagination is only a fallback before authoritative coverage is ready. Compatibility handler aliases remain.

**WHICH ONE IS CANONICAL?**  
Quit authoritative completeness/mobile parity pipeline.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Planned checker fix: verify authoritative quit branch, mobile complete render, desktop `_loadMore('quit')`, fallback loading state, and handler aliases. Do not force old pagination markup back into runtime.

---

## 6. `check:modal-close-compat`

**CHECKER_EXPECTATION**  
`registerModalGlobals()` manually snapshots `window.closeModal` into a local `legacyClose` and overwrites `window.closeModal` with an argument wrapper.

**CURRENT_SOURCE_ARCHITECTURE**  
`GlobalOwnershipRegistry` is the single owner. `registerModalGlobals()` registers canonical `closeModal` from `js/ui/modal.js`, retrieves the legacy fallback via registry, and canonical `closeModal(modalId = 'profileModal')` already supports both zero-argument and explicit modal ID calls.

**WHICH ONE IS CANONICAL?**  
GlobalOwnershipRegistry + `js/ui/modal.js`.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Planned checker fix: verify one registry owner, legacy fallback preservation, default parameter, and explicit-ID support. Do not create a second `window.closeModal` owner.

---

## 7. `check:runtime-month-admission-hydration`

**CHECKER_EXPECTATION**  
Admission must directly call/capture `StudentService.addTuitionTransaction()`, and reports must be eagerly `initReports()`-initialized. It also treats membership in historical `check:all` as the release contract.

**CURRENT_SOURCE_ARCHITECTURE**  
Admission builds one canonical bundle with `buildPaymentBundleTransaction()`, writes via `StudentService.addGenericTransaction()` with compatible tuition fallback, captures `tuitionTx`, then calls `mergeTransactionIntoRuntimeStore(tuitionTx, 'admission-bundle-created')`. Reports are owned by `reportExportFacade` and lazy-import `reports.js`. H6 introduces `check:release` as the release authority.

**WHICH ONE IS CANONICAL?**  
Canonical bundle transaction + lazy report facade + H6 release gate.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Planned checker fix: verify current bundle transaction path and lazy report isolation; require `check:release` to include reports syntax/runtime-month validation rather than demanding eager reports or direct tuition writer.

---

## Summary

All seven observed failures are **tooling compatibility defects**, not evidence that the current production source should restore deprecated behavior. Runtime source changes for these failures are therefore prohibited in H6.

## 8. Supplemental release-contract checker: `check:db-ready-guards`

**CHECKER_EXPECTATION**  
The guard had to be listed specifically in historical `check:all`.

**CURRENT_SOURCE_ARCHITECTURE**  
H6 makes `check:release` the single production release contract, and `check:release` explicitly executes `check:db-ready-guards`.

**WHICH ONE IS CANONICAL?**  
H6 `check:release` for production release authority; historical `check:all` remains backward-compatible development coverage.

**SOURCE WRONG?** NO.  
**CHECKER STALE?** YES.

Checker-only reconciliation: require `check:release` membership without reducing any DB-ready runtime assertion.

---

## Final reconciliation results

| Checker | Before H6 | H6 action | Corresponding canonical proof | Final |
|---|---|---|---|---|
| `check:runtime-bootstrap` | FAIL — direct auth-write assumptions | Checker only: verify `_commitVerifiedAuthContext` / `_resetVerifiedAuthContext` local scopes | `check:auth-context-single-writer` 40/40; Club Bootstrap 20/20 | PASS |
| `check:payment-accounts` | FAIL — obsolete `_debtBranch` patterns | Checker only: verify canonical branch through Tuition Command/result receipt | `check:v5u2-tuition-command-behavior` PASS | PASS |
| `check:search-bindings` | FAIL — Parent reader + old Attendance location | Checker only: verify Parent Portal reader absent + Attendance service shift query | Search priority 43/43; Attendance explicit 60/60 | PASS 26/26 |
| `check:profile-hydration` | FAIL — literal `status === active` | Checker only: verify `classifyProfileStatus` | Profile canonical store 27/27; rename guard 9/9 | PASS 17/17 |
| `check:student-pagination-controls-dom` | FAIL — obsolete quit server pagination | Checker only: verify authoritative quit + mobile full + desktop bounded load-more | Quit completeness 9/9; mobile parity 17/17; V5R 16/16 | PASS 21/21 |
| `check:modal-close-compat` | FAIL — manual `window.closeModal` ownership assumption | Checker only: verify one GlobalOwnershipRegistry owner + registry fallback | Global Ownership 105 assertions; legacy freeze 20/20 | PASS 9/9 |
| `check:runtime-month-admission-hydration` | FAIL — direct tuition/eager report assumptions | Checker only: canonical bundle + runtime merge + lazy facade + release contract | Payment bundle 20/20; lazy reports 115; transaction cutover 27/27 | PASS 38/38 |
| `check:db-ready-guards` | FAIL inside first `check:release` — historical `check:all` membership | Checker only: require current `check:release` membership | All DB-ready runtime assertions retained | PASS 14/14 |

No production business authority was restored or modified to satisfy these historical regex checks.
