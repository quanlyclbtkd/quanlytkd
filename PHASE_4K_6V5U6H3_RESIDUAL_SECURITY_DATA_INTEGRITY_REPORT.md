# PHASE 4K-6V5U6H3 — Residual Security Trust Boundary + Data Integrity + Release Verification Closure

**Build:** `4K-6V5U6H3-residual-security-data-integrity-release-verification-20260818`  
**Baseline:** H2 Parent Portal Hard Disable  
**Timestamp:** 2026-08-18T23:40:00+07:00

## 1. Executive classification

- **SOURCE VERIFIED: YES**
- **RULES VERIFIED: NO — BLOCKED BY DEPENDENCY/DNS ENVIRONMENT**
- **REMOTE FUNCTIONS: UNKNOWN**
- **DEPLOYED/ROLE SMOKE: PARTIAL / NOT EXECUTED**
- **PILOT READY: NO**

H3 closes the five verified source defects with narrow patches and does not add a client Firestore reader, listener, writer authority, polling loop, scheduler, fallback authority, migration, or source of truth.

## 2. Verified defect closure

### A. login_history stored-XSS — CLOSED at source boundary
`loadLoginHistory()` escapes email, clubId, deviceName, OS, browser and filterClub with the existing canonical `window.escapeHtml`. `_showLoginHistoryRulesGuide()` also uses the canonical escape boundary for error/uid/email. XSS gate: **38/38 PASS**.

### A2. login_history audit identity — CLOSED at Rules source / semantic verification BLOCKED
Rules now require exact keys, string/int types, bounded lengths, runtime browser/OS/device enums, own auth email, and server-bound role/club identity. Normal enabled users must write canonical role + `myClubId`; canonical SuperAdmin writes `role=super_admin`, `clubId=''`. Spoof role/club/email, unknown fields and malformed device values are represented in the Emulator test matrix. **Rules Emulator could not execute**, so server semantic status is not marked verified.

### B. SuperAdmin revenue residual XSS — CLOSED
`loadSARevenue` now escapes Firestore-derived club name/id and caught error text. Query/stats/fallback/concurrency semantics are unchanged.

### C. SuperAdmin enabled principal — CLOSED in source
- Rules: a `super_admins/{uid}` doc grants that branch only when `enabled == true`.
- Custom claim `super_admin` and `users/{uid}.role == super_admin` remain supported.
- Client: existing enabled principal passes; existing disabled principal throws `auth/superadmin-principal-disabled`; **0 setDoc** in dynamic disabled harness.
- ROOT bootstrap can still GET own principal to detect disabled state.
- Functions source uses the same `enabled === true` semantics. **No Functions deployment occurred.**

### D. Student search-index-on-edit — CLOSED
Active `students.js` reuses `window.buildStudentSearchIndex`, merges RAM current profile + `updateData`, and adds index fields to the **same existing `StudentStatusCommandBoundary.updateProfile` write**. No Firestore read/listener is added. Phone/memberId/nickname dynamic fixtures pass; primary rename remains fail-closed.

### E. Inventory legacy primary-empty overwrite — CLOSED
The existing Inventory page loader preserves non-empty legacy RAM only when all are true: reset, primary snapshot empty, `activeDataSource == legacy-root`, and legacy inventory exists. Primary pagination/metrics still complete before return. Primary non-empty and primary-mode empty semantics remain unchanged. No second query/retry is added.

### F. Diagnostic checkers — CORRECTED WITHOUT LOWERING STANDARD
- `check:pilot`: function-local `runRuntimeDataRecovery` guards + actual Inventory H3 guard semantics. **68/68 PASS**.
- `check:scale`: current transaction snapshot attribution, current lazy Inventory read/snapshot authorities, active `students.js`, rename fail-closed, targeted Tuition reconciliation. **68/68 PASS**.
- One V5U1 mirror assertion was modernized after a reproducible pre-build false-negative: H3 source `students.js` differs from intentionally unbuilt H2 `public/`. It permits only the explicit bounded pre-build marker and returns to exact mirror after `build:public`. Legacy write baselines/ceilings were not changed.

## 3. Parent Portal H2 freeze

**STILL DISABLED.** H3 Security master retains assertions for no Parent Portal DOM entry, no anonymous lookup Firestore/Auth path, no parentCode writer, and Admin parentCode authority denied.

## 4. Security / authority gates

- Stored XSS trust boundary: **38/38 PASS**
- SuperAdmin principal alignment: **24/24 PASS**
- Production Security Trust Boundary: **41/41 PASS**
- Production Authority Closure: **64/64 PASS**
- Coach Branch Security: **35/35 PASS**
- Auth Context Single Writer: **40/40 PASS**
- Attendance Explicit Shift: **60/60 PASS**
- Attendance Daily Authority: **73/73 PASS**
- Attendance Offline G1: **39/39 PASS**
- Production Residual Defect Closure: **63/63 PASS**
- Inventory Ledger: **33/33 PASS**
- Syntax: **246 items PASS**

## 5. Firestore static budget / authority freeze

H2 baseline → H3 final:

```text
getDoc      29 → 29
getDocs     51 → 51
onSnapshot  16 → 16
```

New client reader: **0**  
New client listener: **0**  
New client writer authority: **0**  
New scheduler/polling: **0**

Independent raw runtime call-pattern comparison also shows write-call counts unchanged H2→H3 (`addDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch`, `runTransaction`).

## 6. Full regression

Final accepted executions:

```text
npm run check              = EXIT 0
npm run check:all:critical = EXIT 0
npm run check:all          = EXIT 0
npm run check:pilot        = EXIT 0 (68/68)
npm run check:scale        = EXIT 0 (68/68)
```

The evidence intentionally preserves the earlier `npm run check` pre-build mirror failure and the subsequent full rerun, rather than hiding it.

## 7. Rules Emulator

**BLOCKED.** Exact `npm ci` could not complete due environment DNS `EAI_AGAIN`; no local/global Firebase CLI was available. Canonical `npm run check:rules:emulator` exited **127** (`firebase: not found`). This is classified as dependency/environment failure, not Rules semantic failure. `firestore.rules` was not relaxed to work around it.

Therefore: **RULES VERIFIED = NO**.

## 8. Root ↔ public

`npm run build:public` completed through the existing canonical build only. `check:deploy-package` and `check:deploy` PASS. SHA-256:

```text
root files      123
public files    123
missing         0
extra           0
hash mismatches 0
status          PASS
```

## 9. Remote Functions

**UNKNOWN.** Locked/local Firebase CLI could not be installed, so `functions:list --project quanly-tst` could not be executed. Source alignment does not prove deployed code state. No deploy/delete/update was performed. This remains a release blocker.

## 10. Smoke verification

Automated/source harness PASS for XSS boundaries, disabled principal client behavior, search edit index, Inventory legacy guard, Parent Portal retirement, Attendance G1. Authenticated deployed Admin/Coach/Viewer/SuperAdmin and staging stored-XSS browser smokes were **NOT EXECUTED** because a safe deployed candidate/test accounts/browser environment were unavailable.

## 11. Deferred P2 — NOT H3 release blocker absent contrary runtime evidence

- Admin notifications listener bounding
- Attendance daily >1200 edge
- Active profiles initial read cost
- App Check
- CSP/security headers
- immutable studentId
- server-trusted SuperAdmin stats

No “tiện thể” optimization was performed.

## 12. Final release classification

**SOURCE VERIFIED** because H3 defect gates, H2 security, Attendance G1, financial/inventory regressions, Pilot/Scale, full regression, static budget and root/public mirror all pass.

**RULES NOT VERIFIED** because the Firestore Emulator did not execute.

**NOT PILOT READY** because Rules Emulator is blocked, Remote Functions state is unknown, and required deployed-role/staging smoke is not executed.
