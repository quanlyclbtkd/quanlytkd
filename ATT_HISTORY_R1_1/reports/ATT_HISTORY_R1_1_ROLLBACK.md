# R1.1 Rollback

Baseline ZIP SHA-256: `191bc21b6b290d70bab6afb4d80c21e6dce6c948ac8283b91472de04868ed06d`  
Baseline runtime SHA-256: `88eeecac4d5f9510ec4ae59507e781bc9e790bc2d23aa5e12b0a4b2fdff53684`  
Candidate runtime SHA-256: `0693e6a10ea6ab6239df8ee287d6ad4f004175074f60dc892a49157f64618296`

Rollback is checkpointed. Apply reverse patches in this order:

1. `ATT_HISTORY_R1_1_CACHE_LINEAGE.patch`
2. `ATT_HISTORY_R1_1_MULTI_SHIFT_PRESENTATION.patch`
3. `ATT_HISTORY_R1_1_LEGACY_NO_SHIFT.patch`
4. `ATT_HISTORY_R1_1_MEMBER_SCOPE.patch`

Or restore the exact R1 baseline ZIP. Do not partially roll back CAS/Journal/Rules/indexes because R1.1 never modified them.

Checkpoint intent:
- Member scope: removes implicit `att_branch` ownership from normal Admin lifetime history.
- Legacy no-shift: Admin historical read-only evidence only; current-day and Coach shift-exact unchanged.
- Multi-shift: presentation-only; service rows/totals unchanged.
- Cache lineage: URL-token-only for the active changed Attendance chain.
