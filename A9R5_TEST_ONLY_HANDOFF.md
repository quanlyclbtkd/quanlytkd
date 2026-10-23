# PHASE QR V11R6 A9R5 — Independent Auth/Firestore Acceptance + QR Evidence Closure

**STATUS: TEST ONLY / RELEASE_HOLD / NO_DEPLOY**

## Baseline and exact scope

- Exact A9R4 source ZIP: `QR_V11R6_A9R4_COACH_ORPHAN_QR_DIAGNOSTICS_ATTENDANCE_TEST_ONLY_FULL_SOURCE.zip`.
- SHA-256 baseline: `13079e3ec4230370f98c56209e1835ba175b230daa72e3cb16718d400a5dbce2`.
- A9R3 Firestore Rules hash retained: `23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad`.
- **Runtime `app.js`, `js/core/coachBranchRuntimeRepair.js`, QR helper, attendance code and Rules are byte-for-byte unchanged from A9R4.** The A9R5 additions are isolated QA utilities and evidence documents only.
- No deployment; no financial read/write; no Cloud Functions; no additional app readers, writers or listeners.

## Root cause and remediation of each issue

### A. Coach Authentication / orphan identity

Evidence from A9R4 Firestore-only Emulator: 5/5 PASS, including RED Admin `getDoc(users/{newUid})` denied when both ACL docs are missing, GREEN A9R4 `creating:true` without the denied preliminary read; existing User, cross-club, and replay DENY.

**A9R5 action:** Add a real Firebase Auth Emulator + Firestore Emulator integration runner. Uses the **same unmodified canonical `coachBranchRuntimeRepair.js` owner** in a VM with real modular Web SDK primitives, and verifies: create Auth, 3-document atomic ACL, secondary identity, full Coach login/authority resolution, CS2 revocation, Admin-reviewed mismatched mirror CAS, orphan Auth recovery after verified Auth login, recovery replay DENY, maintenance lock. These cases are **NOT CLAIMED PASS** until the user's Windows run returns an actual JSON report and exit code 0. Dedicated demo project and both loopback emulator hosts are mandatory before any Firebase initialization.

Because no reliable server-side UID/email account inventory from actual staging/production has been provided, there is **no approved automated migration/repair of the previously orphaned real Auth UID**. Only authorized operator review can reconcile it.

### B. VietQR transfer memo mismatch

Observed safe diagnostic in conversation: HTTP 200; `QR_EMV_MISMATCH`, provider-pixels, `INTENT_FIELD_MISMATCH`, expected memo 42 characters and decoded memo 40. No raw EMV, pixel data, or sanitized `fieldsMatch`+`memoTransform` complete record has been furnished for this case. **This establishes mismatch but does not identify the changed characters**. At present there is no evidentiary basis to shorten memo or accept provider output.

**A9R5 action:** independent sanitized evidence classifier for QA comparing `fieldsMatch` bankBin/accountNo/amount/memo and memoTransform booleans; rejects incomplete evidence, has zero financial writes/remote requests, never authorizes a QR. Synthetic tests 5/5 PASS. Retain canonical exact PIXEL+EMV+CRC+amount/account/memo guards and the current transaction-free REPORT operation. Live provider must be verified on a anonymized PASS/FAIL pair and rendered final image before proposing a memo policy change.

### C. Attendance readiness

`HISTORY_COACH_ACCESS = false`, `coachAttendanceCutoverOpen() { return false; }` unchanged. HLV does not load shifts/roster or write attendance by design until S01 history provenance, Journal migration and CAS/replay/rollback, Emulator, mobile/IndexedDB, READS approval all pass. NO activation or temporary bypass.

## Gates

| Test | Result | Scope |
|---|---|---|
| A9R4 coach creation source mock | PASS 6/6 | Source VM mock only |
| A9R4 QR provider diagnostic synthetic | PASS 3/3 | Synthetic only |
| A9R5 sanitized QR evidence classifier | PASS 5/5 | Synthetic only |
| JS syntax A9R5 QA | PASS | node --check |
| Root/Public exact parity | PASS 128/128 | Unchanged static tree |
| Previous A9R3 Rules Emulator | PASS 34/34 | Prior supplied evidence; not rerun in this session |
| Previous A9R4 Firestore onboarding | PASS 5/5 | Prior supplied evidence; not Auth Emulator |
| **A9R5 real Auth + Firestore Emulator** | **ENV_BLOCKED** | npm packages/Firebase CLI unavailable here, Windows QA kit provided |
| Live iOS/Android QR provider pixel and transfer memo | **RELEASE_BLOCKED** | Missing final anonymized real PASS/FAIL evidence |
| Coach Attendance active | **RELEASE_BLOCKED** | Cutover not approved |
| `app.js` size gate | **FAIL (inherited A9R4)** | 701232 bytes vs 700000 budget; untouched |

## Windows installation and execution on drive D

1. Keep production website and `D:\A9R4\source` unchanged.
2. Unzip this A9R5 Full Source into `D:\A9R5\source` (must contain `firestore.rules`, `package.json`, `tools\a9r5`).
3. PowerShell: `cd D:\A9R5\source` then `npm.cmd ci --no-audit --no-fund`.
4. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\a9r5\Run-A9R5-Auth-Firestore.ps1`.
5. Expected demo project `demo-a9r5-coach-auth`, Auth 127.0.0.1:9099, Firestore 127.0.0.1:8180; no real Firebase credentials.
6. Check `qa_emulator_results_a9r5\coach-auth-firestore.json` and `.raw.log`. All cases must be PASS and process exit code 0; do not treat DENY console noise as failure if expected.
7. Send ZIP: `Compress-Archive -Path .\qa_emulator_results_a9r5\* -DestinationPath D:\A9R5\A9R5_AUTH_EMULATOR_RESULTS.zip -Force`.
8. To inspect QR mismatches without PII, manually create sanitized JSON objects containing only `stage`, `reason`, `kind`, `httpStatus`, `qrPixelAudit.failure`, four `fieldsMatch` booleans, `expectedMemoLength`, `qrMemoLength`, and safe `memoTransform` flags. Run `node .\tools\a9r5\qr-evidence-analyzer.mjs .\qa_emulator_results_a9r5\qr_fail_sanitized.json`. Do **not** upload raw `addInfo`, email, UID, phone or bank account.

## Release decision

**RELEASE_HOLD / NO_DEPLOY.** The existing A9R4 security patch has passed specific previous Firestore Emulator gates. A9R5 is a QA-only candidate, not a product runtime fix. To legitimately close the requested A9R5 runtime work, require Auth+Firestore integration evidence, sanitised actual pixel evidence to select/test a memo strategy, staging browser/mobile and S01/READS approvals. Do not push `public` to production GitHub Pages.
