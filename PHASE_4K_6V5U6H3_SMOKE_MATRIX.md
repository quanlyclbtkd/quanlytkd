# PHASE 4K-6V5U6H3 — Smoke Matrix

Build: `4K-6V5U6H3-residual-security-data-integrity-release-verification-20260818`  
Timestamp: 2026-08-18T23:40:00+07:00

| Case | Environment | Action | Expected | Actual | Status | Evidence / Notes |
|---|---|---|---|---|---|---|
| Login-history XSS source fixture | automated source gate | malicious HTML fixtures through canonical escaping boundary | inert display | escapeHtml fixtures + sink assertions pass | PASS | `check:stored-xss-trust-boundary` 38/38 |
| Login-history identity source boundary | static/source | validate email/role/club/schema rules | spoof paths denied by Rules design | source assertions pass; Emulator not available | BLOCKED | semantic Rules execution required |
| SuperAdmin revenue XSS | automated source gate | malicious club/error text at revenue sink | inert display | escaped sink assertions pass | PASS | XSS gate 38/38 |
| Disabled SuperAdmin principal client | dynamic source harness | existing `enabled:false` principal | throw + 0 setDoc | canonical error thrown, 0 setDoc | PASS | principal gate 24/24 |
| Disabled principal Rules | Firestore Emulator | list clubs / read login_history | DENY absent independent claim/users role | not executed | BLOCKED | Firebase CLI dependency unavailable |
| Student phone edit index | dynamic builder fixture | change phone | `phone` and `searchPhone` same payload | PASS | `check:student-search-index` |
| Student memberId edit index | dynamic builder fixture | change memberId | `searchCode` updated same payload | PASS | search-index gate |
| Student nickname edit index | dynamic builder fixture | change nickname | `searchNickname` updated same payload | PASS | search-index gate |
| Student primary rename | static canonical guard | attempt name change | fail-closed before write | guard remains | PASS | security + search gates |
| Inventory legacy empty guard | source predicate fixtures I1-I3 | legacy-root + empty primary | legacy RAM preserved, pagination completes | PASS | `check:pilot` 68/68 |
| Parent Portal H2 | source security master | verify retired entry/auth/query/writer remains absent | still disabled | PASS | `check:production-security-trust-boundary` 41/41 |
| Attendance G1 | automated runtime harness | offline/cross-context sync | no regression | PASS 39/39 | canonical G1 gate |
| Admin deployed smoke | deployed safe candidate | login + settings/finance/attendance | normal operation | not available | NOT EXECUTED | requires deployed candidate + test Admin |
| Coach deployed smoke | deployed safe candidate | assigned branch Attendance flow | unchanged | not available | NOT EXECUTED | requires test Coach |
| Viewer deployed smoke | deployed safe candidate | read-only flows | unchanged | not available | NOT EXECUTED | requires test Viewer |
| SuperAdmin enabled principal smoke | deployed safe candidate | login/list/history | PASS | not available | NOT EXECUTED | requires safe test principal |
| SuperAdmin disabled principal smoke | deployed safe candidate | disabled test principal | fail-closed/no rewrite | not available | NOT EXECUTED | do not test production ROOT without recovery plan |
| Login-history stored-XSS browser | staging/test data | malicious deviceName then open history | no execution | not available | NOT EXECUTED | no safe staging/browser session |
| SuperAdmin revenue stored-XSS browser | staging/test data | malicious legacy clubName | no execution | not available | NOT EXECUTED | no safe staging fixture |
| Remote Functions inventory | authenticated CLI | functions:list explicit project | known state | CLI unavailable | BLOCKED | status UNKNOWN |

## Overall smoke classification

**PARTIAL** — automated source/runtime harnesses PASS; deployed authenticated and staging XSS smoke were not executable in this environment.
