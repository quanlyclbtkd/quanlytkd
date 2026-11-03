# A9R18 Finance ↔ Students bStats Ownership R1.1 — Final Report

**Final classification:** `FINANCE_STUDENTS_BSTATS_OWNERSHIP_CLOSED`  
**Candidate:** `TEST_CANDIDATE`

Runtime is frozen at canonical runtime SHA-256 `8dc0ff78ece749202db1189bce4ddccd4f1cd755cafa21118e6fd5d75d926dc6` pending packaging hash.

## Final questions

### 1. Does Students still mutate Finance bStats?
NO.

### 2. Can repeated Students recompute accumulate active/debt?
NO.

### 3. Can Finance recompute + Students cache-hit zero active/debt?
NO.

### 4. Does Mặc định/CS01 map to CS1 for branch stats?
YES.

### 5. What exact helper owns branch-stat normalization?
`normalizeBranchCodeForStats`.

### 6. Who owns active/debt branch counts?
The existing Students computation cache (`branchMemberStats`).

### 7. Who owns financial branch values?
Finance computation cache.

### 8. Who combines them?
Pure Dashboard composition (`composeDashboardBranchStats`).

### 9. Is Finance input mutated?
NO.

### 10. Is Students input mutated by composer?
NO.

### 11. In FRESH, is branch debt current verified?
YES.

### 12. In TRANSIENT_LOCAL_WRITE, is branch debt last-server-verified?
YES, only when context + authority key match.

### 13. In NOT_READY, is branch debt prevented from becoming false zero?
YES; debt is unavailable/null with pending state.

### 14. Is lastVerifiedBranchDebtStats bound to the same Debt context and authority key?
YES.

### 15. Does Search recompute Finance only to repair bStats?
NO.

### 16. Does Finance-only update force Students O(N) recompute?
NO.

### 17. Is refreshDashboardBranchStatsFullMonth reachable from normal runtime?
NO normal-runtime caller found; definition + diagnostic export only.

### 18. If not reachable, was it left unchanged?
YES, its business logic was not patched.

### 19. Did app.js business bytes change?
NO; SHA-256 remains `c3b240ac…f4eb13`.

### 20. Did transactionCanonicalBoundary business bytes change?
NO; SHA-256 remains `01db7c3b…2608f`.

### 21. Did DebtProfileReadBoundary change?
NO; SHA-256 remains `92d22f37…6fa08`.

### 22. New reader/listener/writer?
0 / 0 / 0.

### 23. Rules changed?
NO.

### 24. indexes changed?
NO.

### 25. Does explicit canonical rollback still pass?
YES; dedicated QA gate passes.

## Next phase

`A9R18-FINANCE-1200-COVERAGE-ACCEPTANCE-R1`.

Performance optimization remains out of scope until that phase is closed.
