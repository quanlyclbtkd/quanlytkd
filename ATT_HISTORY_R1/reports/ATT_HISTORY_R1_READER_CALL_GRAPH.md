# ATTENDANCE HISTORY R1 — Reader call graph

## Canonical owner
`AttendanceService` remains the single Attendance read service. No V2/legacy/Admin parallel reader was added.

```text
Daily current / past-day reopen
  attendance.js -> AttendanceService.loadByDate()

Member quarter
  attendance.js -> AttendanceService.loadMemberHistory(profileId, quarterMonths, policy)

Member all-time
  attendance.js -> same loadMemberHistory(..., {page:true})

Monthly UI
  attendance.js -> AttendanceService.loadByMonth(month, policy)

Excel
  attendanceExcelReport.js -> AttendanceHistoryReadOwner.readMonth()
  -> AttendanceService.loadByMonth()

Branch report
  attendance.js -> AttendanceService.loadByMonth()

Admin Audit
  attendance.js -> AttendanceService.loadByMonth(... SERVER_REQUIRED + RECORDED)
```

`verified:true` remains compatibility syntax for **SERVER_REQUIRED only**. It no longer implies `historyAuthority == attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`.

Coach role is derived from canonical auth/session state and is forcibly resolved to `SERVER_REQUIRED + CURRENT_AUTHORITY_ONLY + assigned branch`.
