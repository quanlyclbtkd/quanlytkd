# D1B — Whole-System Regression Result

Final aggregate results:
- `npm run check` — **PASS / exit 0**
- `npm run check:all` — **PASS / exit 0**
- `npm run check:all:critical` — **PASS / exit 0**
- `npm run check:release` — **PASS / exit 0**

Phase gates:
- C1D 16/16 PASS
- C1E 28/28 PASS
- C1F 24/24 PASS
- F1 32/32 PASS
- F1A 30/30 PASS
- F1B 65/65 PASS
- F1C 46/46 PASS
- F1D 42/42 PASS
- F1D1 46/46 PASS
- F1D1A 48/48 PASS
- F1D1B **54/54 PASS**

Independent hard baselines:
- Production Authority Closure 64/64 PASS
- Auth Context Single Writer 40/40 PASS
- Club Bootstrap 20/20 PASS
- Profile Canonical Store 27/27 PASS
- Canonical Transaction 27/27 PASS
- Inventory Ledger 33/33 PASS
- Attendance Explicit Shift 60/60 PASS
- Attendance Daily 73/73 PASS
- Attendance Offline Canonical Sync 39/39 PASS
- Dashboard 38/38 + 49/49 + 44/44 PASS
- Coach Branch 25/25 PASS
- SuperAdmin Principal 24/24 PASS
- Exam Finance Separation 41 checks PASS
- Production Stability 22/22 PASS
- Long-Term Stability 39/39 PASS
- Production Residual Closure 66/66 PASS
- Syntax 246 items OK
- Deploy Package 12/12 PASS
- Root/Public 124/124 PASS

Legacy checkers were realigned only where their assertions encoded superseded legacy implementation shapes. Production safety assertions were not weakened: legacy Finance writers are now required to be zero-write, canonical fee audit must remain secondary/observable, and canonical Combo must decide/commit inside the existing lanes.
