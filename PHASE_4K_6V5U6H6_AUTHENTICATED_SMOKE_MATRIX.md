# PHASE 4K-6V5U6H6 — Authenticated Deployed Smoke Matrix

Generated: 2026-08-28T22:02:37Z

No production/staging deployment was executed in H6 because Rules Emulator and remote Firebase state prerequisites remain blocked. No credentials or production test tenant are available in this execution environment. Automated harness evidence is not relabeled as deployed smoke.

| ID | Role | Action | Expected | Status | Evidence / Notes |
|---|---|---|---|---|---|
| B1 | Admin | login; root first snapshot; tabs | Normal Club Root bootstrap | NOT EXECUTED | No authenticated deployed candidate/session available |
| B2 | Admin restored session | hard refresh | No listener-registration-failed; one root listener | NOT EXECUTED | Requires deployed H6 candidate + existing authenticated browser session |
| B3 | Coach | assigned branch Attendance | Assigned branch only; finance not mounted | NOT EXECUTED | No authorized Coach test account/browser |
| B4 | Viewer | read-only flow | No write authority | NOT EXECUTED | No authorized Viewer test account/browser |
| B5 | SuperAdmin | enabled principal | Privileged data loads under canonical authority | NOT EXECUTED | No safe authenticated SuperAdmin test session |
| B6 | All roles | logout | listeners cleaned; auth context reset | NOT EXECUTED | Requires deployed authenticated runtime |
| B7 | Cross-club | rapid logout/login | old authGeneration ignored; no stale RAM/listener | NOT EXECUTED | Requires two safe tenant test sessions |
| B8 | Admin/Report | Exam full roster export | paid/unpaid correct; transaction store reference unchanged | NOT EXECUTED | Automated source/runtime harness PASS; deployed browser not available |

**DEPLOYED SMOKE VERIFIED = NO**.

Source/runtime harnesses remain PASS (Club Listener Bootstrap Readiness 36/36; Exam state purity 9/9; Exam full roster 21/21), but production verification is **NOT EXECUTED**.
