# Ownership After R1.1

```text
Finance computation cache
  └─ financial/exam branch fields only (active/debt compatibility slots are not authoritative)

Students existing computation cache
  ├─ branchMemberStats.active
  ├─ branchMemberStats.debt
  ├─ lastVerifiedBranchDebtStats
  └─ FRESH / TRANSIENT_LOCAL_WRITE / NOT_READY adapter

Dashboard computation cache
  └─ composeDashboardBranchStats(Finance, Students) → NEW presentation object
```

`Students` no longer accepts or mutates Finance `bStats`. `getStudentsSummary()` is the only adapter that converts Debt coverage state into branch-debt presentation semantics. The Dashboard composer is pure, O(branchCount), preserves all Finance fields by cloning rather than whitelisting, and never mutates either input.
