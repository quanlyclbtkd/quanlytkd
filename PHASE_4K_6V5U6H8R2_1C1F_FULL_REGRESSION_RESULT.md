# C1F Full Regression Result

- `npm run check` — PASS, exit 0.
- `npm run check:all` — PASS, exit 0.
- `npm run check:all:critical` — PASS, exit 0.
- `npm run check:release` — PASS, exit 0.
- C1D master — PASS 16/16.
- C1E UI precision — PASS 28/28.
- C1F QuickPay/Receipt — PASS 24/24.
- Canonical Transaction — PASS 27/27.
- Tuition Command Cutover — PASS.
- Debt Source of Truth — PASS.
- Payment Accounts — PASS (33 checks).
- Coach Branch Runtime Repair — PASS 25/25.
- Mobile UI Shell — PASS 80/80 during targeted patch validation.
- Phase 4K-6U report-export/lazy isolation — PASS 115 assertions after same-module comment-only size reduction.

## STOP-rule event
First full `npm run check` failed only because `js/modules/finance.js` grew from 71,790 to 73,198 bytes, exceeding the existing 72,000-byte architecture ceiling. No business assertion failed. The patch was stopped; stale migration/documentation comments at the top of the same module were shortened, reducing the file to 70,943 bytes without runtime changes. The 6U gate then passed 115 assertions, after which full regression was restarted and passed.
