# A9R13 — Coach Attendance Transaction + History Closure

## Root causes closed
1. Coach member-history still queried legacy `Mặc định` in addition to canonical CS1. A9R12 Rules only authorize current-authority canonical branches, so one denied query rejected the whole `Promise.all()` and the history sheet stayed loading.
2. `_commitAttendanceIntents()` always called `transaction.get()` before writing, even when the accepted daily snapshot had already established `baseVersion = absent`. On production this emitted `BatchGetDocuments` for a missing target and could be denied before Firestore evaluated the create rule. The Journal then moved the tap to `needs-review` / “Cần đối soát”.
3. A9R12 permission-denied create intents already stored on-device would remain stuck after the code fix unless explicitly recovered.

## A9R13 changes
- New attendance (`baseVersion === absent`) is written inside the same canonical transaction **without a preliminary document read**.
- Existing attendance still performs transaction read + exact CAS; writer owner is unchanged.
- `attendancePreviousVersion = absent` for first create, so an unexpected pre-existing document cannot be silently overwritten: it is evaluated as an update and Rules reject stale CAS.
- Coach member-history uses exactly one canonical branch equality query (CS1..CS10); no Coach query to `Mặc định`.
- Journal V4 performs a one-time local requeue only for A9R12 rows in `needs-review` whose root error was `permission-denied` and whose original server base was explicitly `absent`. Real ACL/conflict failures return to review and cannot auto-loop.
- History authority, Journal database, Firestore Rules, finance boundaries, Coach ACL, and delete denial are unchanged.

## Verified locally
- A9R13 closure: 6/6 PASS
- Real AttendanceService mock behavior: 3/3 PASS
- Coach read boundary: 30/30 PASS
- Security/branch boundary: 35/35 PASS
- Explicit shift authority: 60/60 PASS
- Daily refresh authority: 73/73 PASS
- Actual write guard: 9/9 PASS
- Attendance role authority: 34/34 PASS
- Syntax: 276/276 PASS
- Root/Public: 128/128 PASS
- Source identity: 128 files pinned PASS

`npm run check` reaches only the inherited app.js compatibility ceilings:
- 703,656 bytes > 700,000
- 11,317 lines > 11,300
No functional gate before these ceilings failed.

## Emulator test still required on Windows
Run `Run-A9R13-Coach-Attendance-Emulator.ps1`. It exercises the real AttendanceService against Firestore Emulator and must prove:
- new absent create commits with zero transaction gets;
- current row update commits with one transaction get + CAS;
- Coach member-history canonical query succeeds;
- inherited A9R11/A9R12 Rules matrix remains green.

## Server Rules
A9R13 `firestore.rules` is byte-identical to A9R12 (SHA-256 `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`). If this Rules SHA is already deployed, no Rules redeploy is needed for A9R13. If production still has an older Rules version, the client fix alone cannot authorize Coach attendance.
