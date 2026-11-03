# ATT_HISTORY_R1.1 — UI call graph

## Daily normal member history

`Attendance daily card` → `window.showAttMemberHistory(profile)` → **NO_EXPLICIT_SCOPE** for Admin/SuperAdmin → `AttendanceService.loadMemberHistory(profileId, quarterMonths, authorityScope=recorded, branch='')` → same captured request scope → `Mở toàn bộ lịch sử` → same `loadMemberHistory(..., page=true, branch='', authorityScope=recorded)`.

The Daily operational selector `att_branch` is **not** an owner of lifetime member-history scope after R1.1.

## Monthly explicit member history

`Monthly mobile/desktop row` → `showAttMemberHistory(profile, selMonth, r.branch)` → **EXPLICIT_BRANCH_SCOPE** → service historical branch policy. For Admin CS1 historical scope, the existing canonical alias semantics include legacy `Mặc định`; Coach is still forced to canonical assigned branch/current authority.

## Coach

Caller intent never broadens Coach. `_resolveAttendanceHistoryReadPolicy()` remains the authority and forces server-required/current-authority-only + assigned branch.

## Pagination

The modal captures `profileId + branch scope + authority scope + club/session context`. Load-more uses the captured scope; it does not re-read `att_branch` or `att_month_branch`. Service cursor scope includes profile/branch/authority/page-size/context and rejects cross-scope reuse.

## Past-day historical reopen

Admin historical reopen → existing `AttendanceService.loadByDate()` → one broader `date + historical branch` query (no server-side shift filter) → in-RAM partition: selected shift rows / other explicit shift rows / legacy unassigned-shift evidence. Only selected-shift rows enter editable/CAS state. Today and Coach retain exact selected-shift query.
