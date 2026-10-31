# Attendance History R1 rollback

Preferred rollback: restore exact baseline archive SHA-256 `a960b47e3a17c523bcdcfacb55e132153560e175f76b9332956c79abf477811c`.

Patch-series rollback (reverse order):
1. `ATT_HISTORY_R1_TRUST_PRESENTATION.patch`
2. `ATT_HISTORY_R1_MONTHLY_REPORT_PARITY.patch`
3. `ATT_HISTORY_R1_MEMBER_HISTORY.patch`
4. `ATT_HISTORY_R1_POLICY.patch`

The four forward patches were applied sequentially to an independent baseline copy and reproduced the six modified root/public runtime files byte-for-byte.

Do not rollback Rules/indexes/CAS/Journal: they were never changed in R1.
