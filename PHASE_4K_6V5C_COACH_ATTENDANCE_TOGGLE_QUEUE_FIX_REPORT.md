# Phase 4K-6V5C — Coach Attendance Toggle Queue Fix

## Scope
Fix the HLV attendance interaction where tapping a student's attendance card two or three times on web/mobile could return to or remain at `✅ Có mặt` instead of advancing to `📝 Nghỉ có phép` or `❌ Nghỉ không phép`.

This patch does not replace the Attendance feature and does not change the stored attendance codes:

- `1` = Có mặt
- `2` = Nghỉ không phép
- `3` = Nghỉ có phép

The user-facing cycle remains:

`Chưa điểm danh → Có mặt → Nghỉ có phép → Nghỉ không phép → Chưa điểm danh`

## Root cause
The bug was specific to Coach/HLV more than Admin because HLV attendance writes are more likely to be delayed by branch-scoped rules/network timing.

In V5B, the card was marked as saving and the UI disabled pointer interactions while the write was in flight. If the Coach tapped quickly again to reach the second or third state, those taps could be ignored before the first write completed. The result was that the card stayed at the first saved state: `✅ Có mặt`.

There was also a secondary stability risk: UI updates still had index-based fallback IDs. If the attendance list re-rendered or reordered while a write was pending, an index could point to a different rendered card.

## Options considered

### Option 1 — Revert V5B attendance lock
Not chosen. It would restore multi-tap behavior but could reintroduce overlapping writes where an older request finishes after a newer request and overwrites the latest status.

### Option 2 — Disable multi-tap and force separate buttons for each state
Not chosen. This changes the existing Attendance UX and does not match the user request to fix the existing feature instead of replacing it.

### Option 3 — Queue the latest tap per student and persist sequentially
Chosen. This keeps the existing card-tap workflow while preventing write races. Taps are no longer ignored during saving; the latest requested status is queued and persisted after the current write completes.

## Changes made

### `js/modules/attendance.js` and `public/js/modules/attendance.js`

- Added `_attQueuedStatusByDocId` to store the latest requested status while a write is in flight.
- Added local-status helpers so the next tap reads pending/queued status before computing the next state.
- Kept optimistic UI: the card immediately reflects the user's latest tap.
- Reworked `toggleAttendance()` so it drains queued changes sequentially.
- Card identity now uses stable `data-att-docid` / `data-att-label-docid`, with name/index fallback only for compatibility.
- Saving state no longer disables pointer events, so rapid HLV taps are captured.
- Rollback on write failure restores the last confirmed state.

### Cache-bust/version

- Updated runtime marker to `4K-6V5C-coach-attendance-toggle-queue-fix-20260701`.
- Updated source/public cache-bust to `coach-attendance-toggle-queue-fix-20260701-v5c`.

### Test tooling

- Added `tools/check-v5c-coach-attendance-toggle-queue-fix.mjs`.
- Added `check:v5c-coach-attendance-toggle-queue-fix` to `package.json`.
- Added the V5C gate into `npm run check`.
- Updated older cache-bust regression gates to accept the V5C successor build.

## Safety notes

- No Firestore Rules changes were required.
- No full-club Coach reads were introduced.
- No Cloud Functions, Blaze, or data migration was introduced.
- Existing Admin attendance behavior is preserved.
- HLV branch-scoped read/write boundaries remain unchanged.

## Test results

The following checks were run and passed:

- `npm run check:syntax`
- `npm run check:attendance-canonical-ownership`
- `npm run check:coach-attendance-only-read-boundary`
- `npm run check:security-coach-branch-boundary`
- `npm run check:v5c-coach-attendance-toggle-queue-fix`
- `npm run check:v5b-coach-reminder-attendance-stability`
- `npm run check:v5a-canonical-read-adoption-legacy-fallback-gate`
- `npm run check:v5-canonical-profile-status-branch-boundary`
- `npm run check:v4d11-attendance-excel-tx-delete-reconcile`
- `npm run check:v4d12-superadmin-access-recovery`
- `npm run check`

`npm run check` completed successfully.

## Deployment note

This is a source/runtime UI patch. Deploy Hosting/source. Firestore Rules do not need to change for this specific V5C fix. After deployment, test HLV attendance in an incognito tab or clear site cache once to avoid the browser retaining V5B/V5A bundles.
