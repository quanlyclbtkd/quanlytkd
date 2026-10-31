# ATTENDANCE HISTORY R1 — Final answers

## Root cause
1. **Physical-delete Attendance history?** No physical delete path was found in current source. Attendance removal remains `status=0` versioned tombstone semantics. This does **not** prove production rows still exist because production was not read.
2. **Legacy dates disappear in which queries?** Baseline `loadMemberHistory(... verified:true)`, `loadByMonth(... verified:true)`, and all-time paginated member history because they imposed current `historyAuthority`; baseline all-time also imposed one current branch.
3. **`verified:true` did how many jobs before patch?** Two: server/session consistency and current-history-authority scope (with scope validation/branch consequences).
4. **Exact regression boundary?** A9R13 historical behavior explicitly tested “Admin quarter history retains unfiltered authority access”; current R2R5.2B normal Admin calls used `verified:true`, while the service interpreted it as `historyAuthority == current`. R1 restores the earlier Admin-visibility contract without weakening server verification.
5. **Attendance contract?** Historical rows from earlier builds remain Admin-visible but are not promoted into Coach authority.

## Policy
6. Server consistency and history authority still coupled? **NO.**
7. Coach always CURRENT_AUTHORITY_ONLY? **YES.**
8. Caller can override Coach to RECORDED? **NO.**
9. Admin normal history uses RECORDED? **YES.**
10. RECORDED means legacy becomes verified? **NO.**

## Complete history
11. Admin sees pre-cutover rows in quarter history? **YES.**
12. Admin sees legacy older than current quarter? **YES**, via the same paginated `loadMemberHistory(...,{page:true})` reader.
13. New all-time reader? **NO.**
14. Verified-only history remains current-authority-only? **YES.**
15. Mixed recorded UI called “đã xác minh”? **NO.** It reports recorded/verified/legacy counts.

## Branch
16. CS1→CS2 member loses CS1 rows in full history? **NO.**
17. Admin CS1 historical scope receives legacy `Mặc định`? **YES**; existing branch identity contract confirms the alias.
18. Coach receives `Mặc định` as current authority? **NO.**
19. CS1 alias fix uses how many Firestore queries? **ONE** per page/action. Monthly/past-day use a single indexed `branch in [CS1, Mặc định]`; member quarter uses one bounded broader profile+months query then canonical post-filter.
20. Parallel current+legacy query? **NO.**

## Consumer parity
21. Monthly and Excel same eligible set? **YES**; Excel calls the canonical monthly owner.
22. Monthly and Branch Report same eligible set? **YES**; Branch Report calls the same canonical monthly owner.
23. Admin Audit and normal Admin history same visibility contract? **YES for valid recorded rows**; Audit keeps separate raw diagnostics/attestation and can inspect status=0 tombstones that normal business views exclude.
24. Daily/historical contradiction remains for equivalent valid context? **NO** in tested historical reopen/member/monthly contexts; current-day operational behavior is intentionally not broadened.

## Security
25. Coach legacy visible? **NO.**
26. Coach other branch visible? **NO.**
27. Cross-club row visible? **NO.**
28. Cache-only accepted as final server history? **NO.**
29. Stale session result applied? **NO.** Logout, club/role/branch/assignment/session/auth-generation changes are stale-dropped.
30. `status=0` counted? **NO.**

## Firestore / cost
31. New reader owner? **0.**
32. New listener owner? **0.**
33. New writer owner? **0.**
34. Rules changed? **NO.**
35. Indexes changed? **NO.**
36. Member quarter query count before/after? **1 → 1**. Fixture returned docs **4 → 8**, visible valid rows **3 → 6**, because legacy/alias rows are no longer server-filtered out.
37. Member all-time page/query count? **1 query per page before and after**. Fixture current-branch/current-authority **1 row → recorded cross-branch 2 rows**.
38. Monthly query count before/after? **1 page-query → 1 page-query**.
39. CS1 query count before/after? **1 → 1**. After uses one indexed alias-IN query, not two queries. Fixture returned docs **4 → 8**, visible rows **3 → 7**.
40. Excel query/page count? Same canonical monthly pagination. In the 10,500-row fixture: **11 pages**, no truncation, no separate Excel reader.
41. Document volume delta? Synthetic fixture: quarter CS1 +4 docs; all-time moved profile +1; monthly-all +4; monthly-CS1 +4; monthly-CS2 +0; Admin Audit +0. This is `CORRECTNESS_READ_COST_DELTA`, not a production billing measurement.
42. N+1 introduced? **NO.**

## Legacy profile ID
43. Evidence of real old-profileId→new-profileId fragmentation? **NO production evidence. AUDIT_ONLY / NO PATCH.** R1 does not fuzzy-merge by name/phone/display name.

## Final classification
**ATTENDANCE_HISTORY_PARITY_CLOSED**  
Candidate: **TEST_CANDIDATE**
