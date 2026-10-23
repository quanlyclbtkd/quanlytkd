# Independent audit A9R5 — 18 gates

Scope: **diagnostic test kit only, no production runtime change**. No deployment, no production Firebase credentials.

Baseline A9R4 archive SHA256: `13079e3ec4230370f98c56209e1835ba175b230daa72e3cb16718d400a5dbce2`.
Rules SHA256: `23aae5fcb7f0376e4dd14ac324942233dc1bf2690304f4b7521e86c878cc7dad`.

A9R5 implements **a new, isolated integrated QA harness**, not a live QR fix. It exercises the original browser Coach owner using real Firebase Auth and Firestore Web SDKs against 127.0.0.1 emulators with `demo-a9r5-coach-auth`. Test harness has 9 cases; no result is represented as PASS until the Windows run provides exit code 0 and real JSON.

A9R4's missing-User preliminary get was corrected previously (5/5 Firestore Emulator). Actual complete Auth signup, permission assignment, login, CS1+CS2, revocation, CAS repair, orphan recovery are pending the new emulator suite.

Live QR: HTTP 200, safe log provider-pixels/QR_EMV_MISMATCH/INTENT_FIELD_MISMATCH and 42→40 memo length. The supplied record does not show complete field booleans or identity of removed characters. No verified rule permits changing transfer note, QR verification threshold or account/amount. A9R5 adds an **offline, sanitized diagnostic classifier only**; no provider QR requests. Quick Link and /v2/generate are different APIs; do not apply an arbitrary 25-character cap to Quick Link.

Attendance remains maintenance-locked. No Rules, finance, Journals, listener owners, client READS, transaction writers, or main runtime modules changed.

Local static/VM test evidence: Auth login 10/10, repair CAS 14/14, Coach assignment 16/16, orphan mock 6/6, QR synthetic 3/3 + 5/5 + 6/6 + 9/9, syntax 276 items, root/public parity 128/128. Full `npm run check` still FAIL at inherited app.js size budget 701232/700000, not inflated or suppressed.

**RELEASE_HOLD / NO_DEPLOY** until Auth+Firestore integration runs, QR pixel fields and transformed memo are independently verified, and Attendance/S01/READS decisions approved.
