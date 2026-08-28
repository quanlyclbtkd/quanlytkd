# PHASE 4K-6V5U6H2 — Production Smoke Matrix

Build: `4K-6V5U6H2-parent-portal-hard-disable-release-verification-20260818`

| Case | Role | Environment | Action | Expected | Actual | Status | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| Fresh login UI | Public | Source/build | Inspect canonical `index.html` | Only Admin login; no Parent tab/pane/inputs/results | All six Parent Portal DOM IDs absent | PASS | H2 security master 37/37 | Static source/build evidence |
| Settings UI | Admin | Source/build | Inspect Settings DOM | No Parent Code field/copy action | `cfg_parentCode` absent | PASS | H2 security master | Fresh UI only |
| Legacy tab cache safety | Public | Runtime harness | Call `switchLoginTab('parent')` against old-HTML mock | Admin remains visible; parent pane hidden | PASS | `PHASE_4K_6V5U6H2_PARENT_COMPAT_SMOKE_OUTPUT.txt` | Zero new state/router |
| Legacy Parent lookup | Public | Runtime harness | Call `ppLookupLogin()` with Firebase spies | 0 Auth/Firestore calls; safe return | `firebaseCalls=0` | PASS | Parent compatibility smoke | No lookup fallback |
| Legacy Parent copy | Admin | Runtime harness | Call `copyParentCode()` | No clipboard/read of removed field | `clipboardCalls=0` | PASS | Parent compatibility smoke | Toast-only compatibility |
| Parent anonymous Auth | Public | Static/runtime harness | Search active calls + invoke no-op | No `signInAnonymously()` runtime call | 0 active calls | PASS | source search + H2 master | Import cleanup intentionally not required |
| Parent Firestore query | Public | Static/runtime harness | Search active app | No `where('parentCode')`, Parent `getDoc/getDocs` path | Absent | PASS | H2 master | Read counts fell 31/56 → 29/51 |
| Admin parentCode writer | Admin | Static source | Inspect settings save path | No main_config/root parentCode write | Absent | PASS | H2 master | Legacy stored data preserved |
| Admin parentCode Rules | Admin | Static Rules | Inspect whitelist | `parentCode` excluded | Excluded | PASS (STATIC) | club-root gate 30/30 | Emulator semantic execution blocked |
| Rules actor matrix | Admin/Coach/Viewer/SuperAdmin | Firestore Emulator | Execute canonical Rules suite | H/H2 matrix succeeds | Firebase CLI unavailable | BLOCKED | H2 Rules Emulator Result | Dependency DNS `EAI_AGAIN` |
| Admin authenticated smoke | Admin | Deployed staging/test club | Login → modules → Settings save | Parent UI absent; normal save works | Not available | NOT EXECUTED | — | Requires deployed candidate + safe account |
| Coach authenticated smoke | Coach | Deployed staging/test club | Branch profiles/shifts/attendance/note/logout | Unchanged | Not available | NOT EXECUTED | — | Canonical automated gates PASS |
| Viewer authenticated smoke | Viewer | Deployed staging/test club | Read-only allowed views | Unchanged/read-only | Not available | NOT EXECUTED | — | Requires deployed candidate |
| SuperAdmin authenticated smoke | SuperAdmin | Deployed staging/test club | Club list/lock/expiry/exam/admin workflows | Unchanged privileged workflows | Not available | NOT EXECUTED | — | Requires safe remote environment |
| Attendance G1 | Admin/Coach | Automated runtime gates | Offline/multi-shift/context sync matrix | 39/39 unchanged | 39/39 PASS | PASS | canonical G1 gate | H2 does not touch Attendance modules |
| Root/public mirror | Build | Local build | SHA-256 canonical runtime scope | 0 missing/extra/mismatch | 123/123 exact | PASS | H2 hash JSON | `build:public` only |
| Remote Functions | Ops | Remote read-only | `functions:list --project quanly-tst` | Known inventory | CLI unavailable | BLOCKED | Remote Functions Status | No deploy/delete performed |

## Smoke classification

**PARTIAL** — Parent Portal retirement behavior is verified by static/runtime harness and all canonical automated regressions pass; authenticated deployed-role smoke is **NOT EXECUTED** because this environment has no safe deployed candidate/test accounts.
