# PHASE 4K-6V5U6H8R1 — PROFILE DISPLAY NAME SAFE EDIT REPORT

Date: 2026-09-16

## Final status

**SOURCE PATCH / AUTOMATED REGRESSION: PASS.**

**FULL PRODUCTION ACCEPTANCE: NOT DECLARED YET.** This environment has no authenticated Admin production browser session against the live Firestore database, so N23 (`unexpected runtime error = 0`, `unhandled rejection = 0`) and live before/after document-count evidence cannot be independently observed. No acceptance condition is inferred.

## 1. Root cause

The previous student edit flow mixed the Firestore profile document key with the visible student name. `oldName !== newName` was blocked because the legacy rename path could create/delete profile documents and only partially rewrite references. Attendance also uses the existing profile key for identity (`profileId`, in-memory map key, and attendance document ID). Removing the guard alone would therefore break referential integrity.

H8R1 separates `profileKey` (immutable identity/document ID) from `displayName` (editable visible label).

## 2. Main files changed

Runtime/source: `app.js`, `index.html`, `js/core/profileCanonicalStore.js`, `js/core/studentSearchIndex.js`, `js/core/studentStatusCommandBoundary.js`, `js/modules/students.js`, `js/modules/attendance.js`, `js/modules/searchRuntime.js`, `js/modules/finance.js`, `js/modules/reports.js`, `js/modules/reports/reportExportFacade.js`, student renderers, and cache-version references required to load the changed modules.

Verification: new `tools/check-profile-display-name-safe-edit.mjs`, plus semantic updates to existing rename/search/security/exam/cache-scope gates.

Not changed: Firestore Rules, Cloud Functions, Attendance service identity/query contract, Tuition Command authority, Debt source-of-truth, Inventory ledger authority.

## 3. Before / after semantics

Before: `m_old_name` and `m_name_input` both represented the profile document key.

After:
- `m_old_name = profileKey`
- `m_name_input = resolveDisplayName(profileKey, profile)`
- `updateData.displayName = requestedDisplayName`
- canonical command receives `oldName: profileKey` and `newName: profileKey`

No alternate writer is introduced.

## 4. Proof profile document ID unchanged

Automated gates prove the display-edit flow has zero `renameWithBatch()` call, zero transaction lookup for rename, zero create/delete profile branch, and calls the existing `StudentStatusCommandBoundary.updateProfile()` with the same immutable key on both sides.

H8R1 safety gate: **28/28 PASS**. Referential guard: **11/11 PASS**.

Live Firestore proof for a real profile remains part of authenticated production smoke.

## 5. Attendance proof

Attendance identity remains profileKey-based:
- `currentAttendanceData[name]`
- `getAttendanceDocId(name, date, shiftId)`
- Daily toggle/bulk action identity
- Monthly `r.name` grouping/action token

Only labels resolve `displayName`. No Attendance migration or historical rewrite was added.

Attendance Explicit Shift: **60/60 PASS**. Attendance Daily: **73/73 PASS**. Residual Closure: **66/66 PASS**.

## 6. Historical transactions

The display-name edit path contains no `findTransactionsByStudent()`, no `txUpdates`, no bulk description rewrite, and no background rename repair. Historical transaction storage is untouched.

## 7. Search verification

Search precedence is `displayName -> name -> fullName -> studentName -> profileKey`. Tokens retain profileKey plus memberId, phone, nickname and legacy fields. The existing canonical profile update invalidates the in-memory search index; no Firestore search query was added.

Verified: new displayName FOUND, old profileKey remains locally searchable, memberId FOUND, phone FOUND.

## 8. Tuition / Debt verification

Tuition/Debt authorities are unchanged. Visible student/debt labels use displayName, while debt/payment/skip/quit actions retain profileKey. Static/dynamic critical gates remain PASS.

Live before/after `paidUntil`, `paidMonths` and debt totals must still be checked in authenticated smoke before final production acceptance.

## 9. Exam verification

Exam boundary was also closed safely:
- UI displays current `displayName`.
- action handlers continue to pass profileKey.
- new Exam transaction keeps `profileId = profileKey`.
- new visible `studentName`, `profileName`, and description use displayName.
- canonical Exam ledger prioritizes exact `profileId/studentId` before visible labels.
- display/legacy-name fallback uses only current RAM profile candidates and accepts a match only when unique.
- Exam exports display displayName but retain profileKey as roster identity.

Exam payment identity gate: **14/14 PASS**.

## 10. Inventory verification

Inventory authority/matching was not changed. The immutable profile identity remains stable, so existing inventory debt/payment links are not migrated or renamed. Inventory critical gates remain PASS.

## 11. Firestore static read budget

Before H8R1: `getDoc=29`, `getDocs=51`, `onSnapshot=16`.

After H8R1: `getDoc=29`, `getDocs=51`, `onSnapshot=16`.

Delta: **0 / 0 / 0**. Club Listener Bootstrap Readiness: **36/36 PASS**.

## 12. Regression results

- Syntax: **246 items valid**
- H8R1 safety: **28/28 PASS**
- Referential guard: **11/11 PASS**
- Exam payment identity: **14/14 PASS**
- Production Security Trust Boundary: **41/41 PASS**
- Production Authority Closure: **64/64 PASS**
- Attendance Explicit Shift: **60/60 PASS**
- Attendance Daily: **73/73 PASS**
- Production Residual Closure: **66/66 PASS**
- `check:all:critical`: **exit 0**
- canonical `check:release`: **36/36 PASS**

The `legacy commit failed` line emitted by Residual Closure is an intentional fake failure in test A11; the PASS verifies that a failed legacy commit preserves the pending queue.

## 13. Root/public parity

`npm run build:public` completed from root source. Parity result: root 123 files, public 123 files, missing 0, extra 0, hash mismatches 0, **PASS**.

## 14. Runtime errors

Automated Node/static/dynamic regression processes completed without a patch-attributable unhandled test-process failure. However, live browser N23 is **not verified** here because there is no authenticated production Admin session/DevTools console.

## 15. Remaining mandatory live smoke

Before declaring full production acceptance: capture one student's original profile document ID and finance/attendance baselines; edit only displayName; verify no new profile document is created; reload; verify Active/Debt/Quit/Search/Attendance Daily/Monthly/Exam labels; perform one controlled Attendance mutation and confirm the doc ID still uses the old profileKey; verify debt/paidUntil/paidMonths/history counts are unchanged; optionally make one controlled Exam payment and verify `profileId` remains old profileKey; confirm browser console `unexpected runtime error = 0` and `unhandled rejection = 0`.

## Final acceptance decision

**Do not declare H8R1 fully production-accepted yet.** All source, build, automated regression, security, read-budget, critical, release and parity evidence PASS. Only authenticated live-production smoke remains unverified.
