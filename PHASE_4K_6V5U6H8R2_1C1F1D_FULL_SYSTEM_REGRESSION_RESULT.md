# F1D — FULL SYSTEM REGRESSION

Aggregate gates:
- `npm run check` — PASS / exit 0
- `npm run check:all` — PASS / exit 0
- `npm run check:all:critical` — PASS / exit 0
- `npm run check:release` — PASS / exit 0

| Module / Gate | Status | Evidence | Regression? | Notes |
|---|---|---|---|---|
| Auth/Security | PASS | Production Authority Closure 64/64; Auth Context gate exit 0 | No | authority unchanged |
| Profiles | PASS | Profile Canonical Store + Quit authoritative gates exit 0 | No | tuition-field generic updates lane-aware |
| Tuition | PASS | V5U2 + F1/F1A/F1B/F1C/F1D; F1D 42/42 | No | same-runtime tuition mutation lane closed |
| Debt | PASS | Tuition Debt Source of Truth gate exit 0 | No | settlement semantics retained |
| Transactions | PASS | Canonical Transaction 27/27; Financial Action Audit PASS | No | classifier authority remains TDI |
| Inventory | PASS | Inventory Ledger 33/33 | No | no new inventory writer; mixed unsafe delete blocked |
| Attendance | PASS | Explicit Shift, Daily Authority, Offline Sync gates exit 0 | No | untouched |
| Dashboard | PASS | Single Read 38/38; Cache 49/49; Hydration 44/44 | No | untouched |
| Coach | PASS | Coach runtime/security gates exit 0 | No | branch boundary retained |
| SuperAdmin | PASS | Auth-principal gate exit 0 | No | tenant context source unchanged |
| Mobile UI | PASS | C1D 16/16; C1E 28/28 | No | one filterBranch preserved |
| Receipt static | PASS | C1F 24/24; F1 32/32 | No | authenticated visibility still unverified |
| Firestore Budget | PASS | 29/51/16 | No | zero delta |
| Root/Public | PASS | 124/124, mismatch 0 | No | `/public` canonical |
| Deploy Package | PASS | 12/12 | No | package structure valid |
| Release | PASS | exit 0; F1D 42/42 included once | No | DAG clean |
| Runtime Errors | NOT VERIFIED | no exact deployed authenticated candidate | Unknown | do not claim zero |
| Rules Emulator | BLOCKED | firebase CLI unavailable | Unknown | R1–R11 not executed |
