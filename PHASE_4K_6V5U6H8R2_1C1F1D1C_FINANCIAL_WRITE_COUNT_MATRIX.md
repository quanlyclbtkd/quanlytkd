# D1C — Financial Write Count Matrix

| Case | Primary tx plan | Profile write | Inventory write | Local Tuition commit | Receipt | Audit |
|---|---:|---:|---:|---:|---:|---:|
| Form valid Tuition | 1 canonical plan | 1 profile effect | 0 | 1 | existing Form UX | 1 secondary |
| Form amount 0 / negative / NaN | 0 | 0 | 0 | 0 | 0 | 0 |
| Form invalid date/package | 0 | 0 | 0 | 0 | 0 | 0 |
| Form guard blocked | 0 | 0 | 0 | 0 | 0 | guard only |
| Combo duplicate profile | 0 | 0 | 0 | 0 | 0 | 0 |
| Combo partial/invalid row | 0 | 0 | 0 | 0 | 0 | 0 |
| Combo guard blocked | 0 | 0 | 0 | 0 | 0 | guard only |
| Combo valid 2 students | 1 existing atomic plan (2 tx) | 2 profile effects | 0 | 2 | 1 | 2 secondary |
| Combo report valid | 0 | 0 | 0 | 0 | 1 report | 0 |
| Slow fee_audit | normal primary | normal | 0 | normal | Combo receipt=1 before audit settles | pending secondary |
| Failed fee_audit | unchanged success | unchanged | 0 | preserved | receipt path remains allowed | diagnostic only |
