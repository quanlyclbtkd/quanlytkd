# A9R5R1 — Auth/Firestore Emulator isolation QA (TEST ONLY)

**Scope:** Isolate seven failing integrated tests from A9R5. **NO DEPLOY.** This is a test-harness repair; no website runtime or Firebase Rules have been changed.

## Ground truth

The uploaded real demo Emulator result was 2 PASS / 7 FAIL. First GREEN test returned only `ERR_ASSERTION` without the failed assertion/message. Following tests reused a `coachUid` assigned only after that GREEN assertion succeeded. This can cascade to Firestore `invalid-argument` and auth `permission-denied`.

Additional confirmed test defect: the original repair test called `win.repairCoachMirror(uid)`, but this private function is not exported globally. The actual interface binds `repairCoachMirror` through `loadCoachAccounts()` and the `[data-coach-repair]` button.

## Repair

- Added `tools/a9r5/coach-auth-firestore-isolated.test.mjs`: nine **business assertions**, each with its own demo Auth/Firestore fixture and stage-aware sanitized failure diagnostics. No shared empty UID dependency.
- Restores the Admin Auth session between cases to stop cascading failures from a Coach sign-in.
- Tests repair through the actual registered UI button handler instead of calling a nonexistent global API.
- Retains the original A9R5 test and raw results unchanged for audit.
- Added `tools/a9r5/Run-A9R5R1-Isolated-Auth.ps1` to execute exclusively against demo Auth and Firestore Emulators at 127.0.0.1.
- Added `tools/a9r5/r1-harness-regression.test.mjs` to demonstrate the harness fixes without Firebase dependencies.

## Results in this environment

| Gate | Status |
|---|---|
| `node tools/a9r5/r1-harness-regression.test.mjs` | PASS 5/5 (static) |
| `node tools/a9r4/coach-create-orphan-source.test.mjs` | PASS 6/6 (mock) |
| Syntax of new integration test | PASS |
| Root/public parity | PASS 128/128 |
| Rules SHA compared with A9R3 baseline | UNCHANGED, `23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad` |
| A9R5R1 real Auth+Firestore Emulator integrated suite | **ENV_BLOCKED** (Firebase SDK/CLI modules not installable here due npm registry DNS error EAI_AGAIN) |
| Original A9R5 real integration result | **2 PASS / 7 FAIL**; remains historically valid |

**Important:** It is not yet established whether the first GREEN failure comes from app runtime, Rules, auth session, or an incorrect harness expectation. Do not claim seven runtime defects fixed or relax authorization rules. The isolated rerun provides authoritative per-case evidence.

## Windows drive D run

1. Keep your existing `D:\\A9R5\\source` untouched. Extract A9R5R1 full-source ZIP to `D:\\A9R5R1\\source` (ensure `package.json` directly inside `source`).
2. Open PowerShell and run:

```powershell
cd D:\A9R5R1\source
npm.cmd ci --no-audit --no-fund
node tools\a9r5\r1-harness-regression.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\a9r5\Run-A9R5R1-Isolated-Auth.ps1
```

3. Whether PASS or FAIL, collect both `qa_emulator_results_a9r5r1\isolated-auth-firestore.json` and `.raw.log` into:

```powershell
Compress-Archive -Path .\qa_emulator_results_a9r5r1\* -DestinationPath D:\A9R5R1\A9R5R1_RESULTS.zip -Force
```

4. Upload `A9R5R1_RESULTS.zip`. A nonzero exit code is a real FAIL, not an instruction to loosen Rules or fabricate a green result.

## Release

`RELEASE_HOLD / NO_DEPLOY`. QR provider-pixel mismatch and Coach Attendance maintenance remain unresolved independently. No production data or user credentials needed for these demo tests.
