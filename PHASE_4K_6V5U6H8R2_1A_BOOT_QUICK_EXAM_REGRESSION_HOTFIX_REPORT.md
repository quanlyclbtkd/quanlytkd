# PHASE 4K-6V5U6H8R2.1A — BOOT + QUICK EXAM REGRESSION HOTFIX REPORT

## 1. Executive status

**SOURCE ACCEPTANCE: PASS**

**PRODUCTION ACCEPTANCE: PENDING AUTHENTICATED MANUAL SMOKE**

This phase is a micro hotfix over H8R2.1. It repairs only two verified runtime reference regressions and strengthens existing regression gates. No new Firestore reader, writer, listener, service V2, polling owner, cache authority, schema, Rules change, migration, or Cloud Function was introduced.

## 2. Exact root causes

### Blocker A — bootstrap `slug` ReferenceError

`index.html` executable bootstrap assigned:

```js
s.src = './js/main.js?v=' + slug + '';
```

`slug` was not declared in the bootstrap, `app.js`, or `main.js`. The ReferenceError occurs before `document.head.appendChild(s)`, so `main.js` is never injected.

The previous `check-runtime-stability-gate.mjs` only searched for a generic `main.js?v=<slug>` string anywhere in HTML. Compatibility comments contained such strings, so the gate could pass while the actual executable `s.src` assignment was broken.

### Blocker B — quick exam `profile` ReferenceError

`app.js::window.quickCollectExam(name, branch)` contained:

```js
const _profileForExam = profile;
```

No lexical `profile` variable exists inside that legacy function. Calling the action could therefore throw `ReferenceError: profile is not defined` before the canonical exam transaction is created.

## 3. Exact production changes

### `index.html`

- Line 577: cache-bust for changed legacy `app.js` advanced to:

```html
app.js?v=boot-quick-exam-regression-hotfix-20260917-v5u6h8r2_1a
```

This is deployment-only cache invalidation so browsers that already cached H8R2.1 receive the repaired quick-exam function.

- Line 667: executable main-module URL repaired to deterministic H8R2.1 version:

```js
s.src = './js/main.js?v=residual-financial-cache-correctness-20260917-v5u6h8r2_1';
```

No `Date.now()`, `Math.random()`, undeclared variable, or global cache-version authority was added.

- Existing H8R2 bounded bootstrap remains unchanged:
  - `BOOT_TIMEOUT_MS = 15000`
  - one existing 50 ms retry path while dependencies are not ready
  - `document.head.appendChild(s)` exactly once on the ready path
  - `window.MAIN_JS_LOADED = true` only in `s.onload`

### `app.js`

- Line 5745 in legacy `quickCollectExam` changed from undefined reference to existing local profile map:

```js
const _profileForExam = allProfiles[name] || {};
```

Identity and display semantics remain H8R1/H8R2.1 compatible:

```js
profileId: name
studentName: _examDisplayName
profileName: _examDisplayName
```

No profile read, profile write, profile creation, fuzzy identity resolution, or Firestore query was introduced.

## 4. Regression gate changes

### `tools/check-runtime-stability-gate.mjs`

The existing gate was extended rather than replaced.

It now extracts the actual executable bootstrap IIFE and actual `s.src = ...` statement, so comments cannot satisfy the assertion.

New checks prove:

- executable `s.src` exists;
- executable expression contains no `slug`;
- URL is deterministic `./js/main.js?v=<non-empty-version>`;
- no `Date.now()` / `Math.random()` cache bust;
- exactly one `document.head.appendChild(s)` call;
- `MAIN_JS_LOADED` is set on `s.onload`;
- 15-second deadline remains;
- dynamic ready bootstrap executes without ReferenceError;
- script is appended exactly once;
- dependency-not-ready path schedules one existing 50 ms retry;
- deadline-expired path stops scheduling.

Final result: **29/29 PASS**.

### `tools/check-exam-payment-identity.mjs`

The existing Exam Payment Identity gate was extended rather than replaced.

New assertions prove:

- `_profileForExam` derives from `allProfiles[name]`;
- legacy quick exam does not contain `const _profileForExam = profile;`;
- no `getDoc`, `getDocs`, or `onSnapshot` was added;
- no profile `setDoc`, `updateDoc`, `deleteDoc`, or `writeBatch` was added;
- dynamic quick-exam execution has no ReferenceError;
- exactly one canonical exam transaction is created;
- payload preserves immutable `profileId` and display name semantics.

Dynamic fixture:

```text
profileKey   = Nguyen Van A
displayName  = Nguyễn Văn Anh
branch       = CS1
amount       = 250000
```

Observed payload:

```text
profileId    = Nguyen Van A
studentName  = Nguyễn Văn Anh
profileName  = Nguyễn Văn Anh
branch       = CS1
amount       = 250000
```

Final result: **20/20 PASS**.

## 5. Dynamic boot proof

The gate executes the actual bootstrap IIFE from `index.html` inside a lightweight VM harness.

### Dependencies ready

- no ReferenceError;
- appended URL contains `js/main.js?v=`;
- module append count = 1;
- invoking actual `onload` sets `MAIN_JS_LOADED = true`.

### Dependencies not ready

- no main module append;
- exactly one existing retry is scheduled;
- retry delay remains 50 ms.

### Deadline exceeded

- `window.__MAIN_BOOT_TIMEOUT = true`;
- retry scheduling stops;
- no infinite polling path is created.

## 6. Dynamic quick-exam proof

The gate executes the actual `window.quickCollectExam` function body with the H8R1-style local profile fixture.

Results:

- ReferenceError count = 0;
- canonical exam transaction writes = 1;
- profile writes = 0;
- extra Firestore profile reads = 0;
- profileKey remains `Nguyen Van A`;
- display label remains `Nguyễn Văn Anh`.

## 7. Proof H8R2.1 residual fixes remain intact

The following were not reopened and their gates still pass:

- MultiItem inventory-debt canonical paid-state preparation;
- debt-only Inventory cache invalidation;
- monotonic `paidUntil`;
- missing-profile fail-closed / `batch.update()` tuition mutation;
- Quit authority local dirty invalidation;
- Attendance pagination fail-closed;
- hidden Transaction tab read optimization;
- Attendance chunked bulk writes;
- Exam promotion chunking;
- 15-second boot timeout;
- mobile header observer model;
- immutable profileKey + displayName boundary.

## 8. Firestore static budget

Baseline H8R2.1:

```text
getDoc      = 29
getDocs     = 51
onSnapshot  = 16
```

H8R2.1A final:

```text
getDoc      = 29
getDocs     = 51
onSnapshot  = 16
```

**Delta: 0 / 0 / 0.**

No Firestore call-site was added by this hotfix.

## 9. Final regression results

Post-build final results:

```text
check:runtime-stability-gate                 29/29 PASS
check:long-term-production-stability         39/39 PASS
precheck:all:critical                        PASS
Production Security Trust Boundary           41/41 PASS
check:release                                36/36 PASS
check:deploy-package                         12/12 PASS
check:profile-display-name-safe-edit         28/28 PASS
check:financial-action-audit-guard           PASS
check:canonical-transaction-safe-cutover     27/27 PASS
check:inventory-ledger-reconciliation        33/33 PASS
check:attendance-daily-single-refresh-authority 73/73 PASS
check:attendance-explicit-shift-authority    60/60 PASS
check:exam-payment-identity                  20/20 PASS
```

## 10. Build + root/public parity

`npm run build:public` completed using the existing pipeline. `/public` was not hand-edited.

Final parity:

```text
rootFileCount   = 123
publicFileCount = 123
missing         = 0
extra           = 0
hashMismatch    = 0
status          = PASS
```

## 11. No-new-authority proof

Production changes are limited to:

1. one deterministic bootstrap URL repair;
2. one local profile-reference repair;
3. one `app.js` cache-bust update needed to ship the repaired legacy function.

No new data owner was added. Existing Finance, Inventory, Attendance, Profile, Transaction, Quit, and Exam authorities remain unchanged.

## 12. Manual authenticated smoke status

**NOT EXECUTED IN THIS SOURCE/TEST ENVIRONMENT.**

The following production/staging checks remain mandatory before declaring Production PASS:

1. Fresh browser/Incognito: confirm no `slug is not defined` and `MAIN_JS_LOADED === true`.
2. Authenticated Admin: Dashboard, Students, Attendance, Inventory, Finance load normally.
3. Exam → one student → Thu phí: confirm no `profile is not defined` and transaction uses canonical profileKey + displayName.
4. Edit displayName: H8R1 behavior remains correct.
5. MultiItem inventory-debt payment: H8R2.1 canonical paid-state behavior remains correct.

## 13. Final conclusion

**H8R2.1A SOURCE HOTFIX = PASS**

**H8R2.1A PRODUCTION PASS = NOT YET DECLARED**

Production acceptance requires the authenticated manual smoke above. The source/build artifact is regression-clean and ready for that smoke stage.
