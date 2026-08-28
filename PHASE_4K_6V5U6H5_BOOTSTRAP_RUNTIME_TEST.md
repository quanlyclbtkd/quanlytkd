# PHASE 4K-6V5U6H5 — Bootstrap Runtime Test

Runtime build: `4K-6V5U6H5-club-root-listener-bootstrap-readiness-exam-full-roster-export-20260827`

The H5 checker evaluates the actual extracted readiness/bootstrap functions in a browser-like EventTarget/VM harness. This is runtime behavior verification, not regex-only inspection.

| Case | Scenario | Expected | Result |
|---|---|---|---|
| B1 | Registry already ready / normal login | One canonical root listener; first snapshot accepted | PASS |
| B2 | Firebase restored authenticated session before registry ready | No premature blocked banner; wait then mount exactly one listener | PASS |
| B3 | Artificially slow `main.js` readiness | Wait boundedly; no `listener-registration-failed`; continue after ready | PASS |
| B4 | `main.js`/registry genuinely fails | Bounded fail-closed; zero root network listener; diagnostic emitted | PASS |
| B5 | Logout while readiness wait is pending | Old flight invalidated; no stale listener mounted | PASS |
| B6 | Rapid logout/login / auth-generation change | Old generation ignored; new generation owns the one listener | PASS |
| B7 | Duplicate mount call in same session | Same `_clubAccessBootstrapFlight`; one `global:club` listener | PASS |
| B8 | Stale duplicate listener metadata | Remove stale once; at most one remount attempt; no loop | PASS |
| B9 | Registry never ready | One ~10s bounded timeout then fail-closed; no polling | PASS |

### Authority invariants

- Root source remains `clubs/{clubId}`.
- Canonical listener key remains `global:club:${clubId}`.
- Root listener creation remains exclusively inside `safeRegisterSnapshot()`.
- No direct `onSnapshot()` fallback was added.
- No `getDoc()`/`getDocs()` bootstrap replacement was added.
- Static Firestore counts remain `29 / 51 / 16`.

Checker: `npm run check:club-listener-bootstrap-readiness` → **36/36 PASS**.

### Browser-production limitation

An actual authenticated production/staging browser session was not available in this execution environment. Therefore B1–B9 are verified by the H5 runtime harness and source regression, but **production authenticated browser smoke remains PENDING/BLOCKED** and this report does not claim `PRODUCTION VERIFIED`.
