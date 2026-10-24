A9R11R1 QA PORTABILITY HOTFIX

Fix only:
- Removes hard-coded /mnt/data/a9r11_base references from coach-attendance-operational.test.mjs.
- Replaces external baseline file reads with pinned SHA-256 digests of the approved baseline-normalized business code and Rules.
- Does NOT change app.js, firestore.rules, attendance runtime, writer, CAS, Journal V4, or permissions.

Install on Windows:
1. Copy tools\a9r11\coach-attendance-operational.test.mjs into:
   D:\A9R11\source\tools\a9r11\
   and replace the old file.
2. Run:
   cd D:\A9R11\source
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R11-Coach-Attendance-Emulator.ps1

Expected offline stage:
A9R11_OPERATIONAL {"pass":12,"fail":0,"total":12}
Then Firestore Emulator acceptance should run.
