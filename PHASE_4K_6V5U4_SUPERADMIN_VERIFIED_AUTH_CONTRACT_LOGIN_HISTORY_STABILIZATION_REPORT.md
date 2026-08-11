# Phase 4K-6V5U4 — SuperAdmin Verified Authorization Contract + Login History Permission Stabilization

## Scope
Security/stability patch on top of V5U3. No deployment performed. No migration, Cloud Functions dependency, Blaze requirement, public Firestore rules, new auth listener, or new Firestore listener.

## A. Root cause
The production failure was an authorization split-brain. The frontend `onAuthStateChanged` had an authoritative hard-coded email fast-path that set `window.userRole = 'super_admin'` and initialized ROOT UI. Firestore Rules never used that email. Rules authorize SuperAdmin only through: custom claim `role=super_admin`, `users/{uid}.role=super_admin`, or `super_admins/{uid}`. Therefore the UI could claim ROOT while Firestore correctly denied `clubs` and `login_history`.

## B. Files changed
Runtime source:
- `app.js`
- `index.html`
- `js/main.js`
- `js/modules/superadmin.js`
- `package.json`

Generated public runtime via `npm run build:public`:
- `public/app.js`
- `public/index.html`
- `public/js/main.js`
- `public/js/modules/superadmin.js`

Tests/gates:
- `tools/check-superadmin-auth-contract.mjs` (new)
- `tools/firestore-rules-6v4b.test.mjs` (new authorization contract emulator cases)
- compatibility-only marker updates in:
  - `tools/check-profile-canonical-store-v4d1.mjs`
  - `tools/check-v5t-canonical-command-boundary-write-freeze.mjs`
  - `tools/check-v5u1-student-status-command-cutover.mjs`
  - `tools/check-v5u2-tuition-command-cutover.mjs`
  - `tools/check-v5u2e-attendance-excel-sdk-fix.mjs`

Unchanged security/business sources verified by diff:
- `firestore.rules`
- `functions/src/authz.js`
- V5U3 search implementation
- finance business implementation
- attendance business implementation

## C. Auth flow before / after
Before:
`Firebase Auth -> email/local cache says super_admin -> window.userRole=super_admin -> ROOT UI/init -> privileged Firestore query -> Rules deny`

After:
`Firebase Auth -> resolveVerifiedSuperAdminContext(user) -> custom claim OR users/{uid} OR super_admins/{uid} -> __superAdminAuthState.verified=true -> window.userRole=super_admin -> existing initSaaSDatabase('') -> privileged reads`

There is still exactly one canonical `onAuthStateChanged` lifecycle. No separate SuperAdmin login flow or auth polling loop was added.

## D. Firestore Rules
`firestore.rules` was not relaxed and was not modified in this phase. Canonical `isSuperAdmin()` remains the source of truth:
1. Auth custom claim `role == 'super_admin'`
2. `users/{uid}.role == 'super_admin'`
3. `super_admins/{uid}` marker exists

`clubs` list and `login_history` read/list/delete remain guarded by `isSuperAdmin()`. No email allowlist, authenticated-user catch-all, or public read/write was introduced. Coach branch and tenant isolation rules remain unchanged.

## E. Verified SuperAdmin resolver
Added `resolveVerifiedSuperAdminContext(user)` inside the existing auth boundary. Verification order:
1. `getIdTokenResult(user)` custom claim
2. `getDoc(users/{uid})`
3. `getDoc(super_admins/{uid})`

The resolver never treats email, LocalStorage, or `window.userRole` as authorization evidence. Cached `super_admin` is only a bootstrap hint and cannot mount ROOT until server-backed verification succeeds.

Runtime verified state:
`window.__superAdminAuthState = { verified, uid, source, verifiedAt, reason }`

State is reset when auth user changes and on logout.

## F. Privileged query guards
`js/modules/superadmin.js` now fail-closes before `collection(db, 'clubs')` when the current session is not verified.

`window.loadLoginHistory()` now fail-closes before querying `login_history` when the session is not verified.

Unverified sessions show an authorization configuration message rather than issuing a query that is expected to fail. No retry loop was introduced.

## G. Login History TTL / single-flight
The existing query semantics are retained:
`orderBy('timestamp','desc') + limit(500)`.

Added session-only controls:
- TTL: 45 seconds
- single-flight: concurrent requests share one Promise
- normal tab switching/filter rendering can reuse successful cache inside TTL
- manual Refresh uses `loadLoginHistory({ force: true })` and bypasses TTL
- permission-denied/failure is never cached as a successful result
- no `onSnapshot` added

This reduces repeated 500-document reads when switching SuperAdmin tabs repeatedly.

## H. Firestore read impact
No recurring listener/read path was added.

Authorization verification may perform one-time server-backed reads during an auth session when the custom claim does not already verify the account: `users/{uid}`, followed if necessary by the legacy `super_admins/{uid}` marker probe. These reads replace unsafe client-side privilege inference and are not tab-driven or recurring.

Repeated Login History reads decrease because of TTL/single-flight caching.

## I. Firebase SDK
`getIdTokenResult` was added to the existing Firebase Auth v10.7.1 modular import and `window._fb_init`. No second Firebase SDK/version was imported.

## J. Regression results
Final package/source checks:
- `npm run check:syntax` — PASS, 244 items
- `npm run check:superadmin-auth-contract` — PASS 21/21
- `npm run check:superadmin-hotfix` — PASS 27/27
- `npm run check:superadmin-audit` — PASS
- `npm run check:mobile-superadmin-gate` — PASS
- `npm run check:superadmin-aggregation-hard-stop` — PASS
- `npm run check:superadmin-quota-guard` — PASS
- `npm run check:superadmin-cache-stats-island-fallback` — PASS
- `npm run check:superadmin-render-scope-fix` — PASS
- `npm run check:superadmin-server-summary-cache` — PASS
- `npm run check:superadmin-safe-server-refresh` — PASS
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25
- `npm run check:production-stability-gate` — PASS 22/22
- `npm run check:runtime-stability-gate` — PASS 17/17
- `npm run check:performance-stability-gate` — PASS 27/27
- `npm run check:student-name-search-priority` — PASS 43/43
- `npm run check:v5u2e-attendance-excel-sdk-fix` — PASS 22/22
- `npm run check` — PASS, exit 0
- `npm run check:all:critical` — PASS, exit 0
- `npm run check:deploy` — PASS

Stale exact-version assertions in older V5T/V5U1/V5U2/V5U2E/ProfileCanonical test gates were updated to accept V5U4. These were test compatibility fixes only; business logic was not changed to make tests pass.

## K. Rules Emulator
Command attempted:
`npm run check:rules:emulator`

Result: **NOT RUN / environment unavailable** because Firebase CLI is not installed (`firebase: not found`, exit 127).

The emulator test file was extended with the required cases:
- ordinary authenticated user: clubs/login_history DENY
- users doc role super_admin: ALLOW
- custom claim role super_admin: ALLOW
- super_admins marker: ALLOW
- special email only, no role/claim/marker: DENY

These cases have not been executed in this environment. Do not treat Rules production safety as emulator-confirmed until they are run on a machine with Firebase CLI.

## L. Public build / sync
`npm run build:public` — PASS.

Final SHA-256 confirms exact root/public parity:
- `app.js == public/app.js`
- `js/main.js == public/js/main.js`
- `js/modules/superadmin.js == public/js/modules/superadmin.js`
- `index.html == public/index.html`

## M. Production manual steps required
No deployment was performed by this patch.

Before claiming the production issue fixed:
1. Identify the real Firebase Auth UID of the SuperAdmin account.
2. Authorize that UID through a server-backed source. Preferred simple option:
   `users/{SUPERADMIN_UID}` with `role: 'super_admin'` and `status: 'active'`.
   Email may exist for diagnostics but is not an authorization source.
   Existing custom claim or `super_admins/{uid}` marker also remain compatible.
3. Do not create/promote this authorization from the browser/client.
4. Run the Rules Emulator tests on a machine with Firebase CLI.
5. Publish/deploy the current `firestore.rules` if production Rules are older/stale.
6. Deploy Hosting/source V5U4.
7. Logout and login again so the auth session/token is refreshed.
8. Manually verify ROOT club list and Login History, then verify normal Admin and Coach accounts.

## N. Manual production UI status
Live production UI testing was not performed in this environment because no production Firebase session/credentials were available. Static/runtime regression gates verify fail-closed behavior and non-regression, but production verification must still be completed after server-side UID authorization and deployment.

## Build marker
`superadmin-verified-auth-contract-20260811-v5u4`
