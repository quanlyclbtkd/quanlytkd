# Báo cáo kiểm toán — A9R18 ATTENDANCE HISTORY R1

## Kết luận
- Classification: **ATTENDANCE_HISTORY_PARITY_CLOSED**
- Candidate: **TEST_CANDIDATE**
- Candidate runtime SHA-256: `88eeecac4d5f9510ec4ae59507e781bc9e790bc2d23aa5e12b0a4b2fdff53684`
- `npm run check`: **PASS / exit 0**
- `npm run check:all`: **PASS / exit 0**
- R1 targeted gate: **45/45 PASS**
- Root/public: **129/129 PASS**
- New Firestore reader/listener/writer owners: **0 / 0 / 0**
- Rules/indexes: **UNCHANGED**
- CAS/Journal/write path: **UNCHANGED**

## Root cause
Baseline coupled `verified:true` to both server consistency and `historyAuthority == current`. Normal Admin history/month UI passes `verified:true`, so pre-cutover rows were filtered at the Firestore query even though the Attendance contract states they remain Admin-visible. RED reproduced Daily/Audit seeing old rows while Member/Monthly verified views did not.

## Closure
R1 makes consistency and authority scope independent. Admin normal historical lookups use `SERVER_REQUIRED + RECORDED`; Coach is force-frozen to `SERVER_REQUIRED + CURRENT_AUTHORITY_ONLY + assigned branch`. Legacy visibility does not alter trust and never auto-attests data.

Member all-time reuses the same paginated reader. CS1/`Mặc định` uses a one-query policy: month/past-day use existing indexed `branch in` shape; member-quarter stays a bounded one-query profile/month read with canonical post-filter. No current+legacy double read was introduced.

Monthly, Excel, Branch Report and Admin Audit now share the recorded visibility policy for Admin. Status=0 remains excluded from business attendance, and multi-shift rows remain distinct.

## Test limitations
Two optional Journal/browser mutation scripts are `ENV_BLOCKED` because the Node Playwright dependency/browser expected by those scripts is not installed. This is not reported as PASS. Their protected write/Journal source is byte-identical, while full `check` and `check:all` are green. A separate Python Chromium mobile fixture passed 320/360/390/430; physical Android/iOS is not verified. Production Attendance data was not read or mutated.
