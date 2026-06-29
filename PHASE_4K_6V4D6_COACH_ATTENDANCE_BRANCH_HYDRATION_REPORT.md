# Phase 4K-6V4D6 — Coach Attendance Branch Hydration Repair

## Scope
Fix the remaining Coach/Huấn luyện viên login-runtime warnings and incomplete Attendance student list after V4D5.

## Root causes

1. `resolveActiveDataSource()` treated Coach permission-denied reads on finance/inventory collections as a runtime data-source failure. This was wrong because Coach accounts are attendance-only and must not read `transactions` or `inventory`.
2. `login_history` was written by all signed-in accounts, but `firestore.rules` did not explicitly allow `login_history` creation, causing non-blocking permission warnings.
3. Coach profile hydration used `where('status', 'in', ['active','trial']) + where('branch','==', coachBranch)`. Legacy profiles with missing/non-canonical `status` are treated as active by the classifier, but Firestore never returned them because the query required `status` to exist and match.
4. Rules only checked `resource.data.branch`, while some legacy/mirror records can expose `branchCode` or `coachBranch`.

## Fixes

### app.js
- Coach runtime data-source diagnostics now probe only branch-scoped profiles.
- Coach runtime no longer probes `transactions`, `inventory`, or legacy root collections in `resolveActiveDataSource()`.
- Empty Coach branch profile result is treated as safe-to-render for Attendance, not a global runtime failure.

### js/listeners/profiles.listeners.js
- Coach profile hydration now uses branch-scoped queries without `status` dependency.
- Status is classified client-side with `classifyProfileStatus()` so legacy active profiles with missing status appear in Attendance.
- Fallback remains branch-scoped and can safely query branch mirror fields (`branchCode`, `coachBranch`) if canonical branch query returns no data.
- Coach still never runs full-club profile fallback, quit full load, export load, debt coverage, finance, or inventory listeners.

### firestore.rules
- Added `login_history/{docId}` create permission for signed-in users; reads remain restricted to SuperAdmin/admin email.
- Coach branch authorization now accepts `branch`, `branchCode`, or `coachBranch`, while still requiring the assigned branch to match.
- Rules remain fail-closed and do not open any public read.

### Cache bust / public build
- Runtime cache marker advanced to `coach-attendance-branch-hydration-20260630-v4d6`.
- Rebuilt `/public` to ensure GitHub Pages uses the same patched files.

## Verification

Passed:

- `npm run check:syntax`
- `npm run check:coach-attendance-only-read-boundary`
- `npm run check:security-coach-branch-boundary`
- `npm run check:coach-branch-runtime-repair`
- `npm run check:quit-authoritative-full-sync`
- `npm run check:mobile-small-ui-recovery`

A full `npm run check` was started and progressed through many gates without failure, but the local session timed out before finishing the full chain. The direct gates for the reported Coach login/Attendance and Rules issues passed.

## Required deploy steps

1. Upload the V4D6 files to hosting/GitHub.
2. Publish the included `firestore.rules` in Firebase Console.
3. Hard refresh / open mobile in incognito to avoid using the V4D5 bundle.
4. Test one Coach account per branch:
   - login succeeds;
   - no `resolveActiveDataSource permission-denied` error;
   - no `login_history Missing or insufficient permissions` warning;
   - Attendance tab shows all active students in the assigned branch.
