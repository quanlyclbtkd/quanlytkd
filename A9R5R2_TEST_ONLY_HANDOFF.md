# A9R5R2 TEST ONLY — Auth/Firestore test-loader realm correction

READ `evidence/A9R5R2/A9R5R2_INDEPENDENT_AUDIT.md` for the 4 failing cases, source-level root-cause analysis, raw-results grounding, and follow-up.

**No change to production runtime:** `app.js`, `js/core/coachBranchRuntimeRepair.js`, `firestore.rules`, finance, QR, and Coach attendance sources are unchanged from A9R5R1. Only QA harness / offline regression / runner were added or modified.

**Windows execution:**

```powershell
cd D:\A9R5R2\source
npm.cmd ci --no-audit --no-fund
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\a9r5\Run-A9R5R2-Verify.ps1
```

Afterward send the exact `qa_emulator_results_a9r5r1/isolated-auth-firestore.json` and `.raw.log` (or zip directory). Do not deploy this test-only source to production.
