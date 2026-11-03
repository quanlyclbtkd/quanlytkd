# ATTENDANCE HISTORY R1.1 — Final Answers

- Runtime SHA-256: `0693e6a10ea6ab6239df8ee287d6ad4f004175074f60dc892a49157f64618296`
- Classification: `ATTENDANCE_HISTORY_PARITY_CLOSED`
- Candidate: `TEST_CANDIDATE`

## 1. Tất cả showAttMemberHistory() callsite đã được kiểm chưa?
YES — 3 runtime callsites: 1 Daily normal, 2 Monthly explicit branch.

## 2. Normal Admin Daily click có còn đọc att_branch để quyết định history scope không?
NO.

## 3. Normal Admin history branch scope đến từ đâu?
NO_EXPLICIT_SCOPE → all recorded historical branches; Coach remains role-forced.

## 4. Monthly explicit branch call còn scoped không?
YES.

## 5. Coach có thể được caller broaden thành all branches không?
NO.

## 6. Daily Admin P_MOVE đang ở CS2 có nhìn CS1 history không?
YES.

## 7. Quarter và all-time có cùng scope không?
YES.

## 8. Pagination có re-read att_branch DOM không?
NO.

## 9. Scope thay đổi có reset cursor không?
YES — service scope/context mismatch rejects old cursor.

## 10. Profile thay đổi có reset cursor không?
YES.

## 11. Page boundary có duplicate row không?
NO in deterministic R1.1 pagination test.

## 12. Page boundary có missing row không?
NO in deterministic R1.1 pagination test.

## 13. Legacy no-shift defect có RED reproduce không?
YES — PAST_DAY_LEGACY_NO_SHIFT_REPRODUCED.

## 14. Nếu không reproduce, source có được sửa không?
Rule remains NO; this phase did reproduce, so the conditional patch was allowed.

## 15. Nếu reproduce, historical Admin reopen dùng mấy query?
1 query.

## 16. Legacy no-shift có bị gán selectedShift không?
NO.

## 17. Có vào editable map không?
NO.

## 18. Có làm CAS base không?
NO.

## 19. Có phát sinh write không?
NO.

## 20. User có nhìn thấy existence của legacy row không?
YES — concise read-only evidence warning for valid status 1/2/3.

## 21. Multi-shift collapse có RED reproduce không?
YES.

## 22. Nếu không reproduce, có patch presentation không?
Rule remains NO; this phase did reproduce, so view-only patch was allowed.

## 23. Nếu reproduce, một ngày 2 ca có thể thấy đủ 2 session không?
YES.

## 24. Attendance totals có thay đổi không?
NO.

## 25. Service data rows có bị mutate để phục vụ UI không?
NO.

## 26. Coach current authority giữ nguyên?
YES.

## 27. Coach legacy visible?
NO.

## 28. Coach cross-branch visible?
NO.

## 29. Rules changed?
NO.

## 30. indexes changed?
NO.

## 31. CAS changed?
NO.

## 32. Journal changed?
NO.

## 33. New reader owner?
0.

## 34. New listener owner?
0.

## 35. New writer owner?
0.

## 36. N+1 introduced?
NO.

## 37. Historical reopen query count before/after?
1 → 1. Query is broader only for Admin historical reopen; selected-shift partition moves to RAM.

## 38. Member quarter query count?
1 → 1 canonical read path for the request; no second legacy query.

## 39. Member all-time query/page count?
1 query per page before/after.

## 40. Documents returned delta?
Deterministic no-shift fixture: 0 → 2 for historical reopen because the shift server-filter no longer drops legacy evidence. Production volume/billable reads were not measured. Current-day exact shift read is unchanged.

## 41. Exact NEW token là gì?
att-history-r1-1-20261031

## 42. index → main active edge đã NEW chưa?
YES.

## 43. main → attendance active edge đã NEW chưa?
YES.

## 44. attendance → service active edge đã NEW chưa?
YES.

## 45. report parent → attendanceExcel active edge đã NEW chưa?
YES.

## 46. Có OLD active import token còn sót trên Attendance graph không?
NO on the five R1.1 changed active cache-lineage edges. Unchanged Attendance dependencies intentionally retain the existing global build token; unrelated assets were not mass-bumped.

## 47. Root/public cache graph giống nhau?
YES.

## 48. app.js business bytes thay đổi?
NO — byte-identical SHA c3b240ac9c7e9fd28403926f09b8ab71043774d8b0ada7e886da6ce9adf4eb13.
