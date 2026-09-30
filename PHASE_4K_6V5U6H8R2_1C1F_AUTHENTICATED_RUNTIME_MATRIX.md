# C1F Authenticated Runtime Matrix

Status: **NOT EXECUTED / BLOCKED BY ENVIRONMENT**.

The C1F candidate could not be deployed from this environment because Firebase CLI is unavailable. No Admin/Coach/SuperAdmin/Access-Blocked credentials or authenticated browser session are available here. Static/mock evidence is not promoted to authenticated PASS.

| Case group | Status | Evidence |
|---|---|---|
| Admin Debt QuickPay real primary commit + receipt | NOT EXECUTED | requires deployed candidate + controlled test data |
| Coach Attendance / unauthorized Tuition-Debt | NOT EXECUTED | requires authenticated Coach role |
| SuperAdmin context + Debt/Tuition | NOT EXECUTED | requires authenticated SuperAdmin role |
| Access Blocked bootstrap/direct activation | NOT EXECUTED | requires blocked auth context |
| 320/360/390/430/768 layout | NOT EXECUTED authenticated | static UI gates PASS only |
| B01–B08 branch behavior | NOT EXECUTED authenticated | one DOM authority statically proven; no new handler added |
| QP01–QP04 real normal/multi-month/branch writes | NOT EXECUTED | production-like Firestore write evidence required |
| QP05 slow fee_audit | MOCK PASS | C1F dynamic gate proves primary result is not blocked |
| QP06 failed fee_audit | MOCK PASS | C1F dynamic gate preserves payment success + diagnostic |
| QP07 already loaded html2canvas | STATIC CONTRACT PASS | fast path in lazy owner |
| QP08 slow html2canvas | STATIC CONTRACT PASS | one shared promise + timeout |
| QP09/QP10 asset error/timeout | STATIC CONTRACT PASS | structured reason mapping |
| QP11 render failure | STATIC CONTRACT PASS | structured `render-failed` result |
| QP12 double submit | MOCK PASS authoritative layer | identical concurrent command commits once; UI guard also present |
| QP13 concurrent receipt | DESIGN TEST PASS | race reproduced pre-patch; serialization present post-patch |
| QP14 Debt rerender during receipt | NOT EXECUTED authenticated | serialization isolates receipt template but browser evidence pending |
| QP15 finance-not-ready bootstrap | STATIC PASS | legacy modal fails closed in http-module |
| QP16 re-export existing transaction | STATIC PASS | receipt callers do not route through `collectTuition` |

Authenticated error budget therefore remains **NOT MEASURED**, not zero.
