# BÁO CÁO KIỂM TOÁN — A9R18 ATTENDANCE HISTORY R1.1

## Kết luận

- Classification: **ATTENDANCE_HISTORY_PARITY_CLOSED**
- Candidate: **TEST_CANDIDATE**
- Final runtime SHA-256: `0693e6a10ea6ab6239df8ee287d6ad4f004175074f60dc892a49157f64618296`
- `app.js`: **702900 bytes**, SHA `c3b240ac9c7e9fd28403926f09b8ab71043774d8b0ada7e886da6ce9adf4eb13` — unchanged
- Rules SHA: `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3` — unchanged
- Indexes SHA: `72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2` — unchanged
- `npm run check`: **PASS / exit 0**
- `npm run check:all`: **PASS / exit 0**
- Attendance History R1: **45/45 PASS**
- Attendance History R1.1: **31/31 PASS**
- Root/public parity: **129/129 PASS**

## Root causes reproduced before patch

### A. Daily Admin member history inherited operational branch
Normal Daily call supplied no branch, but `showAttMemberHistory()` fell back to `att_branch`. A transferred member currently in CS2 therefore lost CS1 rows in lifetime history. Monthly callers explicitly pass branch and remain scoped.

### B. Legacy no-shift historical evidence was filtered out at query time
Admin past-day reopen with selected S1 issued `date + historical branch + shiftId==S1`. A valid pre-cutover row with no `shiftId` could not reach the client. Candidate keeps one Admin historical query without shift server-filter and partitions rows in RAM. Legacy no-shift evidence is read-only and never becomes CAS/editable state.

### C. Multi-shift calendar collapsed presentation
Summary counters processed both sessions, but the calendar view used `dayMap[day] = status`, so the later row overwrote the earlier status. Candidate uses a presentation-only array of sessions per day; totals and service rows are unchanged.

### D. Attendance cache lineage used the older global token
After business correctness went GREEN, only the five active changed Attendance import edges were moved to `att-history-r1-1-20261031`. Unrelated assets were not mass-bumped and `app.js` stayed byte-identical.

## Security / write-path protection

Coach remains `CURRENT_AUTHORITY_ONLY + assigned branch`; caller arguments cannot broaden scope. Legacy `Mặc định` is not promoted to Coach authority. Rules/indexes, CAS, Journal, offline business logic and listener authority are unchanged. Static Firestore owner delta is 0 reader / 0 listener / 0 writer.

## Query cost

No N+1 was introduced. Historical Admin reopen remains **1 query → 1 query**. Correctness requires the query to return rows beyond the selected shift so valid missing-shift evidence can be classified; deterministic fixture returned 0 → 2 docs. This is reported as `CORRECTNESS_READ_COST_DELTA`, not as a billing claim.

## Mobile acceptance

Node mobile shell gate is **81/81 PASS**. The dedicated Chromium width fixture for 320/360/390/430/768 was unstable/timed out in this environment and is recorded as **ENV_BLOCKED**, not PASS. Therefore this is a **TEST_CANDIDATE**, not staging/production approval.

## Remaining audit-only boundary

A true historical `oldProfileId → newProfileId` fragmentation is not fuzzy-merged in R1.1. If production evidence later proves such a case, classify it separately as `LEGACY_PROFILE_ID_HISTORY_GAP`; do not merge by name/phone/DOB heuristics.
