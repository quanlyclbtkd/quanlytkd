# PHASE 4K-6V5U6H1 — Production / Staging Smoke Matrix

Build candidate: `4K-6V5U6H-production-security-trust-boundary-release-assurance-20260816`

Available in this execution environment: source/runtime test harness only. No authenticated deployed candidate, real test accounts, safe staging/test club, or browser session was available. No production data was mutated.

| Case | Role | Environment | Action | Expected | Actual | Status | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| H security master | N/A | Source harness | Run production trust-boundary gate | 25/25 | 25/25 | PASS | `check:production-security-trust-boundary` | Includes four H sub-gates |
| Admin root Rules matrix | Club Admin | Firestore Emulator | Test privileged DENY + cache ALLOW | Matrix passes | Emulator unavailable | BLOCKED | `PHASE_4K_6V5U6H_RULES_EMULATOR_RESULT.txt` | Firebase CLI dependency unavailable |
| Coach config Rules matrix | Coach | Firestore Emulator | main_config DENY, shifts ALLOW, inventory_stats DENY | Matrix passes | Emulator unavailable | BLOCKED | Rules result file | No Rules semantic claim |
| Attendance G1 automated | Admin/Coach | Runtime harness | Canonical offline journal / cross-context sync | 39/39 | 39/39 | PASS | High-level regression logs | G1 unchanged |
| Admin security smoke | Club Admin | Deployed test/staging | Attempt privileged root writes; legitimate cache write | privileged DENY; cache ALLOW | No safe deployed account/club | NOT EXECUTED | Environment unavailable | Must not use important production data |
| Coach end-to-end | Coach | Deployed test/staging | Login → assigned profiles → shifts → attendance → note → logout | Attendance-only, no financial readers | No safe deployed account/club | NOT EXECUTED | Environment unavailable | Distinguish account assignment from code defect when executed |
| Admin Attendance | Club Admin | Deployed test/staging | Branch/shift/daily/toggle/bulk/month/offline reconnect | Canonical owners only | No safe deployed account/club | NOT EXECUTED | Environment unavailable | G1 automated regression PASS only |
| Profile normal edit | Club Admin | Deployed test/staging | Change nickname/phone/DOB/belt/branch without primary-name change | PASS | No safe deployed account/club | NOT EXECUTED | Environment unavailable | Source rename guard PASS |
| Profile primary rename | Club Admin | Deployed test/staging | Attempt primary-name change | BLOCKED, zero migration/writes | No safe deployed account/club | NOT EXECUTED | Environment unavailable | Automated guard 9/9 PASS |
| SuperAdmin workflows | SuperAdmin | Deployed test/staging | Club list/render, lock/unlock, expiry, exam, admin reset | Privileged flows work | No safe SuperAdmin session | NOT EXECUTED | Environment unavailable | No production mutation attempted |
| Viewer | Viewer | Deployed test/staging | Allowed read-only views, root write attempt | Reads allowed; mutation denied | No safe Viewer session | NOT EXECUTED | Environment unavailable | No hidden writes tested live |
| Stored-XSS club display | SuperAdmin | Safe staging/test club | Insert `<img ... onerror>` fixture | Inert literal display | No safe staging/test club/browser | NOT EXECUTED | Environment unavailable | Automated escaping gate 26/26 PASS |
| Stored-XSS coach note | Admin/Coach | Safe staging/test club | Insert `"><svg ... onload>` fixture | Inert text, no execution | No safe staging/test club/browser | NOT EXECUTED | Environment unavailable | No payload injected into production |
| Remote Functions overlap | Operator | Remote read-only | `functions:list --project quanly-tst` | Inventory known and safe | CLI/auth unavailable | BLOCKED | Remote Functions status | No deploy/delete executed |

## Smoke classification

**PARTIAL** — automated source/runtime smoke evidence is PASS, but required deployed/staging role and stored-XSS smoke cases are NOT EXECUTED. This is a release blocker for `PILOT READY`.
