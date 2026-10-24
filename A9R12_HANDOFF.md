# A9R12 — Coach Attendance Daily Query Permission Closure

## Root cause
- Roster render does not prove daily attendance snapshot readiness.
- `loadByDate()` uses a Firestore collection query; the prior 14/14 Emulator suite did not exercise that list-query shape.
- A9R11 Coach daily query could use the legacy CS1 alias `in` predicate while Attendance Rules reused the generic branch helper. Real UI reported `Missing or insufficient permissions` at `loadByDate`, leaving `cacheReady=false`.
- A second operational requirement is client/server Rules parity: a new A9R12 client cannot make old deployed Rules allow Coach list queries.

## Narrow fix
- No new writer/listener.
- CAS transaction body byte-identical to A9R11.
- History authority unchanged.
- Journal V4 unchanged.
- Coach daily/monthly current-authority queries use canonical `branch == CSn`.
- Attendance Rules use direct canonical branch membership against server-authoritative `allowedBranches`.
- New current-authority writes require canonical branch values only.
- New Emulator coverage tests actual `getDocs` daily list query for assigned CS1/CS2 and deny unassigned CS3.

## Verified locally
- A9R12 operational 12/12 PASS.
- A9R12 query closure 8/8 PASS.
- Coach read boundary 30/30 PASS.
- Attendance write guard 9/9 PASS.
- Attendance role authority 34/34 PASS.
- Explicit shift authority 60/60 PASS.
- Daily refresh authority 73/73 PASS.
- Root/public parity 128/128 PASS.
- Source identity PASS with 128 canonical runtime files.
- `npm run check` reaches only the two inherited app.js size/line ceilings: 703,656 > 700,000 bytes and 11,317 > 11,300 lines.

## Still requires Windows Emulator confirmation
The current environment could not launch firebase-tools Emulator to execute the new list-query cases. Run `Run-A9R12-Coach-Attendance-Emulator.ps1` on Windows before Rules deployment.
