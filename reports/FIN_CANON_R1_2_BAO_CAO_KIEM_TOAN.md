# A9R18-FINANCE-CANONICAL-POLICY-R1.2 — Báo cáo kiểm toán

**Classification:** `FINANCE_NO_MIGRATION_POLICY_CLOSED`  
**Candidate:** `TEST_CANDIDATE`

Production RED was reproduced from the same overlap callback called by `app.js`. Baseline safe overlap could schedule a non-dry automatic cutover, mutate historical transactions, detach/restart Finance, and persist a new canonical month. Candidate blocks that automatic trigger and all exposed mutation-capable execute/schedule/run bridges before side effects.

`dryRun:true`, overlap/parity diagnostics, new-transaction canonical fields, existing persisted canonical months and the normal Finance read contract remain intact. No separate transient canonical read authority was found. Noncanonical parity-green months remain legacy until explicitly persisted by an approved future process.

Baseline and candidate `npm run check` and `npm run check:all` exit 0. Rules, indexes, `app.js`, Finance/Debt/Attendance/Inventory protected code remain unchanged. New Firestore reader/listener/writer owner delta: `0 / 0 / 0`.

Out of scope preserved: `bStats`, limit 1200, query topology, performance. Next confirmed P1: `A9R18-FINANCE-STUDENTS-BSTATS-OWNERSHIP-R1`; next scale audit: `FINANCE_1200_COVERAGE_ACCEPTANCE`.
