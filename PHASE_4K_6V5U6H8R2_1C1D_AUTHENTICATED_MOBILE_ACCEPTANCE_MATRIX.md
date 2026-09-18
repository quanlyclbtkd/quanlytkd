# PHASE 4K-6V5U6H8R2.1C1D — AUTHENTICATED MOBILE ACCEPTANCE MATRIX

## Overall status

**BLOCKED / NOT EXECUTED — authenticated mobile browser sessions are not available to this execution environment.** Static C1C shell/layout gates are PASS, but they are not used as substitutes for the required Admin/Coach/SuperAdmin/Access-Blocked browser runs.

| ID | role | viewport | module | action | expected | actual | result | console errors | network anomalies | Firestore anomalies | screenshot/evidence | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M01 | Admin | 320x568 | Tuition | Open Tuition | Tuition visible; nav order correct; no overflow | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M02 | Admin | 360x800 | Tuition | Open Tuition | Tuition visible; no overlap | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M03 | Admin | 390x844 | Tuition | Open Tuition | Tuition visible; no overlap | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M04 | Admin | 430x932 | Tuition | Open Tuition | Tuition visible; no overflow | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M05 | Admin | 768x1024 | Shell transition | Resize/open app | No mobile bottom nav; no duplicate navigation/overlay leak | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M06 | Admin | mobile | More | Repeat open/close by X/backdrop/Escape/navigation | ARIA and body scroll restored; no duplicate events | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M07 | Admin | mobile | Debt | Open Debt | Authorized module visible; no duplicate More item | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M08 | Admin | mobile | Attendance | Open Attendance | Authorized module usable | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M09 | Admin | mobile | Active students | Open Active | List usable; no fixed-nav cover | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M10 | Coach | mobile | Auth | Coach login | Correct club/branch context | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M11 | Coach | mobile | Attendance | Open Attendance | Allowed and branch-scoped | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M12 | Coach | mobile | Tuition | Direct/UI activation | Hidden/blocked by policy | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M13 | Coach | mobile | Debt | Direct/UI activation | Hidden/blocked by policy | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M14 | Coach | mobile | More | Open More | No Admin-only protected modules | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M15 | SuperAdmin | mobile | Auth | Login | Valid SuperAdmin context | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M16 | SuperAdmin | mobile | More | Open More | Correct utilities, no stale tenant menu | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M17 | SuperAdmin | mobile | Context | Switch context if flow exists | No stale Admin/Coach restrictions | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M18 | Access Blocked | mobile | Bootstrap | Load blocked context | No protected flash/nav/hydration | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M19 | Access Blocked | mobile | Direct tab | Attempt protected tab | Guard blocks, handled error only | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M20 | Admin | 320x568 | Tuition card | Very long name | Row 1/2/3 remains usable | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M21 | Admin | 320x568 | Tuition card | Large amount | Amount remains visible | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M22 | Admin | 320x568 | Tuition card | Multiple action buttons | Actions remain reachable | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M23 | Admin | mobile | Scroll lock | Open/close More 5 cycles | No permanent overflow:hidden or stale class | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |
| M24 | Admin | mobile/tablet | Responsive | Rotate/resize/viewport change | No duplicate nav, stale overlay or overflow | NOT EXECUTED — no authenticated browser session available in this environment | **BLOCKED** | NOT MEASURED | NOT MEASURED | NOT MEASURED | none | Must be rerun on deployed/authenticated candidate |

## Viewport status

- 320×568: NOT EXECUTED
- 360×800: NOT EXECUTED
- 390×844: NOT EXECUTED
- 430×932: NOT EXECUTED
- 768×1024: NOT EXECUTED

## Role status

- Admin: NOT EXECUTED
- Coach: NOT EXECUTED
- SuperAdmin: NOT EXECUTED
- Access Blocked: NOT EXECUTED

No runtime PASS is inferred from C1C static gates.
