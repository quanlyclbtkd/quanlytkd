# Phase 4K-6V5B — Coach Reminder Guard + Attendance Tap Stability

## Scope

Fix two Coach-role issues without changing Admin/SuperAdmin financial/export workflows:

1. Coach accounts were shown the monthly reminder banner: `Nhắc nhở: Tải file tổng kết Tháng ...`.
2. Coach attendance cards could appear to jump/change unpredictably when selecting `Có mặt`, `Nghỉ có phép`, or `Nghỉ không phép`.

## Root cause analysis

### Monthly reminder visible for Coach

`app.js` scheduled `_checkMonthlyReminder()` for every non-root login path after app context readiness. `legacyUiShell.checkMonthlyReminder()` only checked the date and dismissal key; it did not check role. Because Coach UI still contains the shared banner DOM, Coach accounts could receive an Admin-oriented monthly export reminder.

### Attendance status jumping

The attendance UI used a full-card `onclick="window.toggleAttendance(idx)"` interaction. This cycles through 4 states: pending → present → absent → excused → pending. On mobile, a tap on a card or repeated taps while an async Firestore write is still pending can advance more than once, which looks like the status is jumping. The old code had no per-record save lock and no explicit status setter.

## Changes made

### Coach monthly reminder guard

Files changed:

- `js/ui/legacyUiShell.js`
- `app.js`
- `public/js/ui/legacyUiShell.js`
- `public/app.js`

Changes:

- Added role detection helper for Coach/HLV aliases.
- `checkMonthlyReminder()` now returns false and hides `#monthlyReminder` for Coach.
- `_openMonthlyExport()` is guarded for Coach, so even if called manually it will not open the Admin export modal.
- `app.js` no longer schedules `_checkMonthlyReminder()` when `window.userRole === 'coach'`.

### Attendance exact status selection

Files changed:

- `js/modules/attendance.js`
- `js/core/globalOwnershipRegistry.js`
- `public/js/modules/attendance.js`
- `public/js/core/globalOwnershipRegistry.js`

Changes:

- Added `window.setAttendanceStatus(idxOrName, status)` as the canonical exact setter.
- Added explicit per-card buttons:
  - `✅ Có mặt` → status `1`
  - `📝 Nghỉ phép` → status `3`
  - `❌ Nghỉ KP` → status `2`
  - `— Bỏ chọn` → status `0`
- Removed full-card status cycling from the attendance card UI.
- Kept `window.toggleAttendance()` as a backward-compatible legacy API, but it now uses the same guarded setter.
- Added per-record save guard `_attendanceSaveState` so the same student/date/shift cannot receive overlapping writes.
- Buttons are disabled while that record is being saved.
- Attendance records now write both `branch` and `branchCode` from the canonical branch extractor.

## Build/version

- Cache-bust marker updated to `coach-attendance-ui-reminder-guard-20260701-v5b`.
- `window.APP_PATCH_VERSION` updated to `4K-6V5B-coach-attendance-ui-reminder-guard-20260701`.
- `public/` rebuilt from source using `npm run build:public`.

## Validation run

Passed:

- `npm run check:syntax`
- `npm run check:v5b-coach-reminder-attendance-stability` — 11/11
- `npm run check:v5a-canonical-read-adoption-legacy-fallback-gate` — 14/14
- `npm run check:v5-canonical-profile-status-branch-boundary` — 18/18
- `npm run check:quit-tab-mobile-parity` — 17/17
- `npm run check:debt-authoritative-tuition-coverage` — 32/32
- `npm run check:coach-attendance-only-read-boundary` — 30/30
- `npm run check:security-coach-branch-boundary` — 35/35
- `npm run check:global-ownership-adoption-cleanup` — 105 assertions
- `npm run check:attendance-canonical-ownership` — 141 assertions
- `npm run check:report-export-lazy-isolation` — 115 assertions
- `npm run check:coach-branch-runtime-repair` — 25/25
- `npm run check:v4d8-coach-attendance-auth-roster-final-recovery` — 18/18
- `npm run check:v4d9-coach-warning-cleanup` — 12/12
- `npm run check:v4d10-admin-tx-quit-authoritative` — 11/11
- `npm run check:v4d11-attendance-excel-tx-delete-reconcile` — 12/12
- `npm run check:v4d12-superadmin-access-recovery` — 14/14

`npm run check` was also started. It progressed through multiple suites without failing but timed out before completing the full long pipeline, so the final validation above is based on the focused and regression suites listed.

## Deployment notes

This phase mainly changes Hosting/source runtime. Firestore Rules are not structurally changed for this fix, but the package still includes the current rules. Deploy Hosting/source. Deploy Rules too if production is behind the V4D7+/V5 line.
