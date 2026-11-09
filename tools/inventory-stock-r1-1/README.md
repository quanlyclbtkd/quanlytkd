# Inventory stock integrity R1.1 — acceptance tooling only

Run from the repository root after installing the already-declared dev dependencies:

```bash
npm ci
npx playwright install chromium
npm run test:inventory-stock-emulator-r1-1
```

The launcher uses the unchanged `firebase.json`, Firestore 127.0.0.1:8180, and
`demo-a9r18-inventory-r11`. Emulator and browser tests run under one process tree.
Never substitute a production Firebase project.

Existing compatible Chromium may be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
For an isolated dependency installation, set `INVENTORY_R11_DEPENDENCY_ROOT` to the
directory containing its package.json and node_modules. `INVENTORY_R11_OUTPUT`
optionally selects the evidence directory (default: evidence/INVENTORY_R1_1).

For an already-running Emulator in the SAME network namespace:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 npm run check:inventory-stock-emulator-r1-1
```

The browser imports the vendored SDK10.7.1 and the actual InventoryService module.
Test proxies delegate get/set/update/delete and runTransaction to the real SDK;
they never implement commit, conflict detection, stock arithmetic or retries.
The two-client barrier waits only after a real server transaction read.

Node Firebase12 is used for fixture seeding, test environment administration and
authorized before/after evidence reads. Rules-disabled context is confined to
fixture seeding/cleanup. Business calls execute in isolated browser contexts with
Rules enabled. The cross-domain envelope contains representative fixture writes,
not a replacement Finance/Admission/MultiItem business implementation.

This handoff is **BLOCKED_TEST_DEPENDENCY**, not Emulator acceptance. The current
environment starts Emulator and uploads Rules but denies Chromium's Unix socket
creation before the browser SDK or any business operation can run. The fallback
Playwright Headless Shell download did not yield a valid archive. All30 mandatory
browser rows are NOT_RUN. The complete scenario tooling has syntax validation;
its unexecuted assertions must still pass in a browser-capable environment.

R1's actual-source49/49 and focused protected gates remain separate evidence.
Read the root `12_FINAL_DECISION.md`; inherited R1 PASS reports are historical
and must not be interpreted as R1.1 acceptance.
