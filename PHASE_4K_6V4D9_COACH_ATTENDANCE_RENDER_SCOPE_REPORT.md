# Phase 4K-6V4D9 — Coach Attendance Render Scope + Permission Probe Repair

## User-facing bug

Coach accounts could log in, but the Attendance tab did not show the full list of students in the assigned branch. Console could also show:

- `[resolveActiveDataSource] Permission denied — không mở Firestore Rules public`
- `[ProfilesFallback] Coach branch load failed: permission-denied`

## Root cause

The previous fixes focused on Firestore query scope. They made Coach profile loading query `branch`, `branchCode`, and `coachBranch`, and added branch-name aliases. However the Attendance renderer still filtered profiles only with:

```js
_sameBranch(p.branch, selBranch)
```

So profiles loaded through `branchCode`, `coachBranch`, or other legacy branch fields were present in memory but were discarded during render.

A second issue was that runtime diagnostics treated denied legacy alias probes as a hard permission error for Coach accounts. Coach is attendance-only, so denied aliases should be skipped without blocking render.

## Fix

### Attendance render

- Added `_profileBranchValues(profile)`.
- Added `_profileMatchesBranch(profile, selectedBranch)`.
- Added `_profileDisplayBranch(profile)`.
- Replaced direct `p.branch` filtering in daily and monthly Attendance views.
- Offline save, single attendance save, and bulk attendance save now use the resolved profile branch mirror.

### Coach profile hydration

- Live Coach listeners now use canonical branch-only specs for `branch`, `branchCode`, and `coachBranch` to avoid noisy denied alias watch errors.
- Settings-ready alias reconciliation still runs as a tolerant one-time read.
- Added `_safeReadCoachProfileSpec()` so one denied alias can never fail the entire fallback/hydration pass.

### Runtime diagnostics

- `resolveActiveDataSource()` no longer converts denied Coach alias probes into a global `permission-error`.
- Denied Coach aliases are logged as skipped diagnostic probes only.

### Firestore Rules

- `isCoach()` accepts a non-empty Coach branch mirror, including legacy human branch names.
- Actual profile/attendance reads remain restricted by `resourceBranchMatchesCoach()` and branch equivalence.
- No public read rule was added.

## Cache bust

`coach-attendance-render-scope-20260630-v4d9`

## Validation

- `npm run build:public`
- `npm run check:syntax`
- `node tools/check-coach-attendance-render-scope-v4d9.mjs`

