# Ownership Before R1.1

```text
Finance cache (bStats)
  ├─ income / tuitionMap / examFeeMap / exam registration
  └─ active=0 / debt=0 compatibility slots
          │ same object reference
          ▼
Students computation
  ├─ bStats[branch].active++
  └─ bStats[branch].debt++
          │ mutated Finance-owned cache
          ▼
Dashboard cache / __store._lastBStats / presentation
```

Consequences reproduced on the exact baseline: repeated Students recomputation accumulates counters; a Finance recompute creates fresh zero member slots that remain zero on Students cache-hit; raw legacy branch identity can miss a canonical Finance key; branch debt has no branch-level last-server-verified snapshot during `TRANSIENT_LOCAL_WRITE`.
