# PHASE 4K-6V5U6H2 — Parent Portal Hard Disable + Production Release Verification Report

## 1. Baseline

Input: **PHASE 4K-6V5U6H1 — Production Release Evidence + Emulator Verification Closure**.

H1 critical baseline was rerun before H2 changes and passed. Initial Firestore static call-sites were `getDoc=31`, `getDocs=56`, `onSnapshot=16`.

## 2. Parent Portal retirement result

| Boundary | Result |
|---|---|
| Fresh UI entry | **REMOVED** |
| Fresh settings entry | **REMOVED** |
| `ppLookupLogin` Firestore | **DISABLED** |
| `ppLookupLogin` anonymous Auth | **DISABLED** |
| Admin `parentCode` writer | **REMOVED** |
| Admin `parentCode` Rules authority | **DENIED IN SOURCE** |
| Legacy Firestore `parentCode` data | **PRESERVED / INERT** |
| Migration | **NONE** |

Fresh `index.html` contains none of: `loginTab_parent`, `loginPane_parent`, `pp_codeInput`, `pp_nameInputLogin`, `pp_loginResults`, `cfg_parentCode`.

`switchLoginTab`, `ppLookupLogin`, and `copyParentCode` remain only as cache-safe compatibility no-ops. Runtime harness verified an old cached call to `switchLoginTab('parent')` keeps Admin visible, while `ppLookupLogin()` produces zero Firebase/Auth calls and `copyParentCode()` produces zero clipboard operations.

## 3. Client/config writer closure

The settings flow no longer reads `clubConfig.parentCode`, accesses `cfg_parentCode`, performs duplicate `where('parentCode', ...)` lookup, writes `parentCode` into `settings/main_config`, or writes `clubs/{clubId}.parentCode`.

No replacement collection, reader, listener, writer, proxy, migration, or public lookup was introduced.

## 4. Rules authority shrink

`clubAdminRootUpdateFieldsOnly()` no longer includes `parentCode`. Existing legitimate cache/stat fields remain whitelisted. SuperAdmin authority is unchanged. Historical `parentCode` may remain in existing documents and does not prevent an Admin from updating a different allowed cache field because Rules evaluate affected keys.

Rules Emulator matrix was updated so Admin `parentCode` and mixed cache+`parentCode` writes must fail, while a legacy document containing `parentCode` can still receive an allowed cache-only update.

**Important:** actual Rules semantic verification is **BLOCKED**, not PASS, because `npm ci` could not fetch the locked Firebase CLI dependencies in this environment.

## 5. Security and authority regression

Final key gates:

- Production Security Trust Boundary: **37/37 PASS**
- Club Root Field Authority: **30/30 PASS**
- Coach Branch Security: **35/35 PASS**
- Production Authority Closure: **64/64 PASS**
- Attendance Explicit Shift: **60/60 PASS**
- Attendance Daily Single Refresh: **73/73 PASS**
- Attendance Offline Canonical Sync G1: **39/39 PASS**
- Production Residual Defect Closure: **63/63 PASS**
- Auth Context Single Writer: **40/40 PASS**
- Syntax: **246/246 PASS**

One regression gate was stale because it expected a Parent Portal warning string; it was changed to assert the stronger retired state. Three legacy write-freeze gates were also updated only after they proved unable to represent the intentional source-before-public build state. No frozen baseline JSON was changed and all actual write ceilings/signatures remained enforced.

## 6. Firestore static budget

Before H2:

```text
getDoc      31
getDocs     56
onSnapshot  16
```

After H2:

```text
getDoc      29
getDocs     51
onSnapshot  16
```

Result: **no increase**. H2 removed Parent Portal reads and added zero readers/listeners.

## 7. Full high-level regression

```text
npm run check              = EXIT 0
npm run check:all:critical = EXIT 0
npm run check:all          = EXIT 0
```

The existing npm `precheck`, `precheck:all`, and `precheck:all:critical` integration remains unchanged; the H security master was not duplicated into main scripts.

## 8. Dependency and Rules Emulator

`npm ci` was attempted against the existing lockfile without version changes. It was blocked by repeated DNS `EAI_AGAIN` package-fetch errors. Local/global Firebase CLI therefore remained unavailable.

Canonical command:

```text
npm run check:rules:emulator
```

Result:

```text
EXIT 127
firebase: not found
classification: DEPENDENCY_BLOCKED
```

Therefore: **RULES NOT VERIFIED** by Emulator.

## 9. Canonical build and root/public evidence

`npm run build:public`, `check:deploy-package`, and `check:deploy` passed. Public files were not manually edited.

SHA-256 runtime mirror:

```text
rootFileCount   123
publicFileCount 123
missing         0
extra           0
hash mismatch   0
```

Status: **PASS**.

## 10. Remote Functions

Read-only inventory could not be executed because the locked Firebase CLI was unavailable. No remote deploy/delete/update was performed.

Classification: **REMOTE FUNCTIONS = UNKNOWN**.

This remains a release blocker for PILOT READY.

## 11. Smoke verification

Automated/static H2 retirement smoke: **PASS**.

Authenticated deployed Admin/Coach/Viewer/SuperAdmin smoke: **NOT EXECUTED**. No safe deployed test candidate/accounts were available in this execution environment.

Overall smoke classification: **PARTIAL**.

## 12. Authority outcome

H2 creates:

```text
new Firestore readers        0
new Firestore listeners      0
new writer authorities       0
new scheduler/polling        0
new fallback authority       0
new cache/source-of-truth    0
migration                    0
```

Parent Portal is retired rather than replaced.

## 13. Release classification

**SOURCE VERIFIED** — Parent Portal hard-disable and all source/canonical regressions pass; static budget is lower and root/public mirror is exact.

**NOT RULES VERIFIED** — Emulator execution is blocked by dependency/network environment.

**NOT PILOT READY** — Rules Emulator is not verified, Remote Functions are UNKNOWN, and authenticated deployed-role smoke is not executed.

No claim of multi-club release readiness is made.
