# PHASE A9R5R2 — Coach Auth/Firestore integrated QA realm isolation

**Decision: TEST ONLY / RELEASE_HOLD / NO DEPLOY** — October 23, 2026.

## Evidence received (unmodified input)

`A9R5R1_RESULTS.zip` contains:
- `isolated-auth-firestore.json`: 5/9 PASS, four failures.
- `isolated-auth-firestore.raw.log`: both emulators started, test exited 1.
- Demo project: `demo-a9r5-coach-auth`, original Rules hash `23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad`.

### Four failures, exact evidence

1. New Coach: `invalid-argument` after Auth identity created, before verified 3-document readback.
2. Revoke CS2: expected `['CS1']`, observed `['CS1','CS2']`; test had no assertion checking UI error messages.
3. Reviewed mirror repair: expected mirror `assignmentPreviousVersion='DEMO_STALE_MIRROR_VERSION_2026'`, observed pre-repair `baseline-repair-version-000001`.
4. Recovery of orphaned Auth: `invalid-argument`; Auth credential step had already passed.

### Root-cause at the test harness boundary

`tools/a9r5/coach-auth-firestore-isolated.test.mjs` executed the *unchanged* browser source via `vm.runInNewContext(source, ...)`. JavaScript literals/arrays from this context have different `Object.prototype` and `Array.prototype` identities from the realm that imported the Firebase SDK. Firebase `writeBatch.set()` and `Transaction.set()` validate document data. The cross-realm boundary provides a consistent explanation for `invalid-argument`; downstream unchanged ACL/epoch results are compatible with a write rejected before commit. Exact SDK rejection details require rerunning the real emulators; this is not yet a proven production runtime defect.

### Targeted correction

- Changed **only the QA owner loader**: `new Function('window', 'document', 'console', 'setTimeout', 'crypto', 'Blob', 'URL', source)` executed in the Node host realm, with explicit injected dependencies.
- Browser source remains byte-identical. No new writer or listener and no Firestore Rules change.
- Both revoke and repair now require an explicit success toast before asserting Firestore readback; future errors show their original dialog rather than only an unchanged document.
- Added a strict-argument offline RED/GREEN fixture that reproduces the original realm failure, then exercises create, branch revoke, CAS repair, and orphan recovery using the exact owner.

### Tests in execution environment

| Gate | Result |
|---|---|
| `r2-owner-realm-contract.test.mjs` | **7/7 PASS**, offline strict SDK-shaped mock |
| `r1-harness-regression.test.mjs` | **5/5 PASS**, static |
| `coach-create-orphan-source.test.mjs` | **6/6 PASS**, mock |
| `qr-provider-mismatch.test.mjs` | **3/3 PASS**, synthetic only |
| `qr-evidence-synthetic.test.mjs` | **5/5 PASS**, synthetic only |
| `check-syntax.mjs` | **276/276**, JS/inline syntax |
| Rules SHA | Unchanged |
| `coachBranchRuntimeRepair.js` SHA | Unchanged: `3c5d5d7a95390ce8438552d48947b293a2878dd480c399c4964effce82012068` |
| Real integrated Auth + Firestore Emulator for A9R5R2 | **NOT RUN HERE** (npm SDK/CLI dependencies absent) |

### Gates still open

- Run the real 9-case suite on Windows and establish actual 9/9 PASS; otherwise retain failed case details.
- The QR provider-pixels `QR_EMV_MISMATCH` for named students remains NOT CLOSED; sanitized `fieldsMatch`/`memoTransform` and real final QR evidence are still required. Do not weaken bank/account/amount/memo/CRC verification.
- Coach Attendance remains intentionally locked pending S01/history/Journal/cutover acceptance.
- `app.js` size gate remains over 700,000 bytes in inherited source; not waived.
- No production deployment or live Firebase write testing authorized.

## Windows D drive

Extract source to `D:\A9R5R2\source`, verify `package.json` and `firestore.rules` are in that directory.

```powershell
cd D:\A9R5R2\source
npm.cmd ci --no-audit --no-fund
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\a9r5\Run-A9R5R2-Verify.ps1
Compress-Archive -Path .\qa_emulator_results_a9r5r1\* -DestinationPath D:\A9R5R2\A9R5R2_RESULTS.zip -Force
```

Return `A9R5R2_RESULTS.zip`; no changes to `quanly-tst`.
