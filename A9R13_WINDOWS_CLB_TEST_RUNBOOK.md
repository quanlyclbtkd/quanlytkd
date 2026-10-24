# A9R13 — Windows CLB test runbook

1. Extract Full Source to `D:\A9R13\source`.
2. PowerShell:
```powershell
cd D:\A9R13\source
npm.cmd ci --no-audit --no-fund
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R13-Coach-Attendance-Emulator.ps1
```
Expected final line:
`A9R13 Coach Attendance Transaction + History PASS. TEST ONLY; nothing deployed.`

3. Start local UI:
```powershell
npm.cmd run local
```
Open `http://localhost:8000`.

4. With Coach test account verify:
- select assigned CS1/CS2;
- daily roster loads;
- click student **name**: member-history modal loads (no `Mặc định` permission error);
- click card/status to check in: first write must not show `BatchGetDocuments 403`;
- reload: status remains;
- change status: update still uses CAS;
- prior A9R12 `permission-denied` / `needs-review` create intent is retried once automatically;
- unassigned branch, finance, delete remain denied.

5. If Console still shows `permission-denied`, record the exact document path and whether it is first create or update. Do not delete Journal or attendance rows to force PASS.
