A9R11R2 — FIRESTORE EMULATOR FIXTURE DOC-ID HOTFIX (QA ONLY)

Observed Windows result:
A9R11_EMULATOR {"pass":11,"fail":3,"total":14}

Root cause:
- Runtime and firestore.rules require attendance document IDs:
  <profileId>_<YYYY-MM-DD>_<shiftId>
- The A9R11 emulator harness used invalid IDs such as P1-2026-10-24 and P2-2026-10-24
  while payloads had shiftId S1/S2.
- Therefore both positive create tests were denied by Rules.
- The CAS test then read a missing document and failed with:
  Cannot read properties of undefined (reading 'attendanceVersion').

This hotfix:
- Changes only tools/a9r11/coach-attendance-operational.emulator.mjs.
- Uses canonical IDs in all positive and negative cases.
- Makes negative tests use valid IDs so they prove branch/authority/ACL denial,
  rather than passing accidentally because the ID is malformed.
- Adds exists()/attendanceVersion assertions before CAS.
- Does NOT change app.js, firestore.rules, attendance runtime, writer, CAS,
  Journal V4, authority, ACL, or financial permissions.

Install:
Copy tools\a9r11\coach-attendance-operational.emulator.mjs to:
D:\A9R11\source\tools\a9r11\
and replace the old file.

Run:
cd D:\A9R11\source
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R11-Coach-Attendance-Emulator.ps1

Expected:
A9R11_OPERATIONAL {"pass":12,"fail":0,"total":12}
A9R11_EMULATOR {"pass":14,"fail":0,"total":14}
A9R11 Coach Attendance Emulator PASS. TEST ONLY; nothing deployed.
