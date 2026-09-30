# PHASE 4K-6V5U6H8R2.1C1E1 — AUTHENTICATED MOBILE ACCEPTANCE MATRIX

## Status

**NOT EXECUTED ON AN AUTHENTICATED DEPLOYED C1E1 CANDIDATE.**

Reasons:

1. Firebase CLI is unavailable, so the C1E1 Hosting candidate could not be deployed from this environment.
2. No authenticated Admin, Coach, SuperAdmin, or explicit Access-Blocked test session/credentials are available to this execution environment.
3. Chromium navigation to both `file://` and local `127.0.0.1` test targets is blocked by environment policy with `net::ERR_BLOCKED_BY_ADMINISTRATOR`, so even an unauthenticated local presentation harness cannot be promoted to browser runtime evidence.

Static gates are not used as substitutes for authenticated evidence.

| ID | Role | Viewport / Module | Action | Expected | Actual | Result | Console errors | Network observation | Firestore observation | Overflow | Evidence / notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M01 | Admin | Search | Search alignment | Icon inside/centered | No authenticated candidate session | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | Static C1E gate 21 PASS only |
| M02 | Admin | Debt | Layout order | Title→Zalo→Group→Search→Filters→List | No authenticated candidate session | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | Static C1E order assertions PASS |
| M03 | Admin | Debt | Zalo action | Existing handler once | No authenticated candidate session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Handler preserved statically |
| M04 | Admin | Debt | Group invoice | Existing handler once | No authenticated candidate session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Handler preserved statically |
| M05 | Admin | Tuition | Compact/empty shell | No blank shell; valid UI remains | No authenticated candidate session | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | Empty-shell contract statically PASS |
| M06 | Admin | More | Open/close repeated | Canonical owner, no stale state | No authenticated candidate session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Canonical owner dynamic test in Mobile Shell PASS, not deployed auth evidence |
| M07 | Coach | Attendance | Open Attendance | Allowed branch-only | No Coach session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Coach static gates PASS |
| M08 | Coach | Tuition | Direct unauthorized attempt | Blocked | No Coach session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Not inferred from static gate |
| M09 | Coach | Debt | Direct unauthorized attempt | Blocked | No Coach session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Not inferred from static gate |
| M10 | SuperAdmin | More | Open More | Correct root/context presentation | No SuperAdmin session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M11 | SuperAdmin | Debt | Context access | Correct existing policy | No SuperAdmin session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M12 | SuperAdmin | Tuition | Context access | Correct existing policy | No SuperAdmin session | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M13 | Access Blocked | Bootstrap | Load app | No protected flash/nav | No blocked test context | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M14 | Access Blocked | Direct tab | Attempt protected tab | Blocked without hydration | No blocked test context | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M15 | Admin | 320×568 | Mobile smoke | UI usable | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M16 | Admin | 360×800 | Mobile smoke | UI usable | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M17 | Admin | 390×844 | Mobile smoke | UI usable | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M18 | Admin | 430×932 | Mobile smoke | UI usable | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M19 | Admin | 768×1024 | Tablet transition | No duplicate nav/overlay | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M20 | Admin | 1024 desktop | Desktop smoke | No desktop regression | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M21 | Admin | Search | Long text | No icon/text overlap | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M22 | Admin | Debt | Long name | Layout stable | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M23 | Admin | Tuition | Long name | Layout stable | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | — |
| M24 | Admin | Zalo | Single-fire | Exactly once | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M25 | Admin | Group invoice | Single-fire | Exactly once | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M26 | Admin | More | Body scroll lock | Lock/restore | No authenticated candidate | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Canonical owner unit/dynamic gate PASS only |
| M27 | Blocked | Protected UI | No flash | Zero protected flash | No blocked runtime | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | — |
| M28 | All | Listeners | No duplicates | No duplicate listeners | No authenticated runtime | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Static listener budget unchanged |
| M29 | All | Runtime | Error budget | Unexpected errors=0 | No authenticated runtime | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Must not be reported as zero |
| M30 | Admin | Responsive | Overflow budget | No real overflow | Browser target blocked by administrator | NOT EXECUTED | N/A | N/A | N/A | Not measured | Chromium policy blocker |
| M31 | All | Firestore | Runtime observation | No unexpected requests/listeners | No authenticated runtime | NOT EXECUTED | Not measured | Not measured | Not measured | N/A | Static 29/51/16 only |
| M32 | All | Final acceptance | Summary | All runtime groups PASS | Prerequisites unavailable | NOT EXECUTED | Not measured | Not measured | Not measured | Not measured | C1E1 cannot close |

Summary: **0 PASS / 0 FAIL / 32 NOT EXECUTED** for authenticated M01–M32. This is an evidence gap, not a claim of runtime correctness.
