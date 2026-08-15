# PHASE 4K-6V5U6G1 — Attendance Offline Canonical Sync Closure + Cross-Context Flight Guard

Build: `4K-6V5U6G1-attendance-offline-canonical-sync-closure-20260815`

## 1. Kết luận

**SOURCE / AUTOMATED CLOSURE: PASS.**

Hai residual defect mục tiêu đều đã được tái hiện và đóng tại owner hiện hữu, không tạo reader/listener/writer/scheduler/cache/source-of-truth thứ hai:

- **P1-A — FIXED:** journal metadata không còn đường đi vào Firestore Attendance document.
- **P1-B — FIXED:** request khác Club/Auth Context trong lúc một sync flight đang chạy không còn bị stranded; chỉ có tối đa một active writer flight và một latest pending context.

Giới hạn xác minh:

- **LIVE PRODUCTION MANUAL SMOKE: DEFERRED** — môi trường hiện tại không có browser session/credentials production để thực hiện thao tác Admin/Coach thật.
- **REMOTE FUNCTIONS: UNKNOWN** — Firebase CLI không khả dụng và `.firebaserc` không có trong source; không deploy/delete gì trong phase này.
- Không scan/migration Firestore để xóa journal metadata lịch sử có thể đã phát sinh trước G1. Historical cleanup, nếu cần, phải là maintenance action riêng.

---

## 2. BEFORE / AFTER — P1-A Canonical payload

### BEFORE

V5U6G có đường ghi tương đương:

```js
_prepareWriteData({
    ...rec,
    timestamp: Date.now()
})
```

Trong khi `rec` là local mutation journal và có thể chứa:

```text
version
clubId
operation
shiftMode
queuedAt
lastUpdatedAt
revision
docId
journalKey
syncState
retryCount
```

Do đó orchestration metadata có thể đi vào `clubs/{clubId}/attendance/{docId}`.

### AFTER

`AttendanceService.bulkSyncOffline()` vẫn là **ONE canonical offline Firestore writer**, nhưng set payload bắt buộc đi qua một whitelist builder:

```text
journal
  ↓
_toCanonicalAttendanceWrite(...)
  ↓
explicit business-field whitelist
  ↓
_prepareWriteData(...)
  ↓
batch.set(...)
```

Canonical business fields được whitelist:

```text
profileId
name
belt
branch
date
month
status
timestamp
shiftId   // chỉ khi có explicit shift
```

Không có `...rec` / `...source` trong canonical Firestore payload builder.

### Captured payload evidence — G1/G2

Gate runtime dùng fake Firestore `writeBatch().set()` và capture payload thật từ `AttendanceService.bulkSyncOffline()`.

Input cố ý chứa cả business data lẫn journal-only metadata. Captured payload keys chính xác:

```text
branch
belt
date
month
name
profileId
shiftId
status
timestamp
```

Các forbidden field được assert **không tồn tại**:

```text
version
clubId
operation
shiftMode
queuedAt
lastUpdatedAt
revision
docId
journalKey
syncState
retryCount
```

Kết quả gate:

```text
G1 canonical batch.set payload contains business fields only = PASS
G2 journal metadata is absent from Firestore payload        = PASS
G3 operation=delete preserves delete semantics              = PASS
G4 legacy V1 record uses the same canonical sanitizer       = PASS
```

Delete semantics không đổi: `operation=delete` hoặc status canonical delete path vẫn dùng `batch.delete()`, không tạo Attendance document `status=0`.

V1 và V2 đều đi qua **cùng** `AttendanceService.bulkSyncOffline()` và cùng sanitizer; không có `bulkSyncOfflineV1/V2` thứ hai.

---

## 3. BEFORE / AFTER — P1-B Cross-context flight

### BEFORE

```text
A/10 sync starts
↓
B/11 requests sync while A is active
↓
B receives Promise A
↓
A settles
↓
no bounded B follow-up guaranteed
```

B có thể còn pending dù browser online.

### AFTER

Architecture module-local:

```text
ONE _offlineAttendanceSyncPromise
ONE _offlineAttendanceActiveContext
ONE _offlineAttendancePendingContext
```

Không `Map(clubId => Promise)`. Không parallel writer.

Mỗi request capture immutable context:

```text
clubId
authGeneration
uid (compatibility evidence only; identity decision remains clubId + authGeneration)
```

Flow:

```text
A active
  ↓
B requested
  ↓
latest pending = B
  ↓
A settles and active Promise is released
  ↓
if B is still canonical current context
  ↓
start exactly ONE B follow-up
```

### A → B evidence

Runtime G6/G7:

```text
A flight running
B requested
parallel writer count = 1
B network before A settle = 0
A settles
B follow-up flight count = 1
```

Result: **PASS**.

### A → B → C latest-wins evidence

Runtime G8:

```text
A active
B pending
C requested
latest pending becomes C
A settles
B flight count = 0
C flight count = 1
B journal remains pending
```

Result: **PASS**.

Không có context queue array; chỉ giữ latest meaningful pending context.

---

## 4. Stale-context chunk guard

Sync chunk threshold giữ nguyên:

```text
400 records / batch
```

Runtime G10–G12 seed 850 V2 records:

```text
chunk 1 = 400 → commit confirmed
context switches A → B
chunk 2 = NOT STARTED
chunk 3 = NOT STARTED
remaining A journal = 450
```

Evidence:

```text
G10 stale old context starts zero chunk-2/chunk-3 network writes = PASS
G11/G12 only committed chunk-1 is cleaned; 450 remain          = PASS
```

Check current context xảy ra:

- trước journal work;
- trước/after shift authority await;
- trước mỗi V1 commit;
- trước mỗi V2 chunk;
- sau mỗi committed batch.

Nếu batch đã gửi rồi và auth đổi trong lúc await, confirmed commit vẫn được scoped cleanup; nhưng **không start chunk mới** và **không refresh UI context mới**.

---

## 5. Revision cleanup guard

V2 journal dùng local-only `revision`.

Scenario G13:

```text
revision 3 sent
↓
user changes same record
↓
revision 4 stored locally
↓
revision 3 commit succeeds
```

Cleanup chỉ xóa khi journal key + sent revision vẫn match current local revision.

Expected/actual:

```text
Firestore rev3 commit confirmed
local rev4 remains
status rev4 remains
```

**G13 PASS.**

`revision` chỉ tồn tại ở local journal/diagnostics; sanitizer cấm field này trong Firestore Attendance payload.

---

## 6. Stale UI guard

Old-context sync chỉ được gọi canonical Attendance refresh nếu:

```text
syncContext still current
AND
dailyContext.clubId matches
AND
dailyContext.authGeneration matches
```

Runtime G9:

```text
late Club A completion
while Club B is current
→ Club B Attendance UI refresh count from A = 0
```

**PASS.**

---

## 7. Offline compatibility matrix

Gate `check:attendance-offline-canonical-sync-guard`:

```text
39/39 PASS
```

Bao gồm:

- G1 whitelist canonical payload — PASS
- G2 forbidden journal fields absent — PASS
- G3 delete semantics — PASS
- G4 V1 sanitizer compatibility — PASS
- G5 same-context one flight — PASS
- G6 A→B no parallel writer — PASS
- G7 exactly one B follow-up — PASS
- G8 A→B→C only C follows — PASS
- G9 stale A cannot refresh B — PASS
- G10 stale A cannot start later chunks — PASS
- G11 committed chunk only cleanup — PASS
- G12 uncommitted entries preserved — PASS
- G13 revision guard — PASS
- G14 Morning/Evening isolation — PASS
- G15 configured blank shift blocked — PASS
- G16 legacy no-shift supported — PASS
- existing online event owner remains one/idempotent — PASS

V5U6G residual Attendance matrix vẫn PASS sau extension.

---

## 8. Authority matrix sau G1

| Domain | Canonical owner | Quantity |
|---|---|---:|
| Attendance daily reader | `_requestAttendanceDailyRefresh` path | ONE |
| Attendance shift loader | `_loadClubShifts` | ONE |
| Attendance offline journal | existing V2 localStorage journal | ONE |
| Attendance offline Firestore writer | `AttendanceService.bulkSyncOffline()` | ONE |
| Attendance active sync Promise | `_offlineAttendanceSyncPromise` | MAX 1 |
| Attendance active sync context | `_offlineAttendanceActiveContext` | MAX 1 |
| Attendance pending follow-up context | `_offlineAttendancePendingContext` | MAX 1 |
| Online event Attendance sync owner | existing idempotent listener | ONE |

Không có per-club Promise map, sync worker thứ hai, polling hoặc retry scheduler.

---

## 9. Diagnostics / metrics

Reuse `window.__attendanceDebug`; không tạo global diagnostics store mới.

G1 bổ sung counters:

```text
offlineCanonicalPayloadSanitized
offlineJournalMetadataStripped
offlineSyncContextCaptured
offlineSyncContextStaleStops
offlineSyncDifferentContextQueued
offlineSyncDifferentContextFollowups
offlineSyncPendingContextReplaced
offlineSyncStaleUiRefreshDropped
offlineSyncCommittedChunkCleanup
offlineSyncUncommittedChunkPreserved
```

Counters không lưu student name/phone/email.

Network/permission/invalid-shift failures giữ pending journal và đi qua diagnostics hiện hữu; không blind retry.

---

## 10. Firestore/read/listener budget

Final hard counts:

```text
getDoc       31 → 31
getDocs      56 → 56
onSnapshot   16 → 16
```

Additional freeze evidence:

```text
window assignments  534
addEventListener     115
setInterval            1
setTimeout             87
```

`check:startup-read-budget-freeze` = **8/8 PASS**.

`check:production-residual-defect-closure` = **63/63 PASS**.

`check:parallel-read-authority` = **48/48 PASS**.

Không thêm Firestore read, listener, polling hoặc writer authority.

---

## 11. Frozen modules / byte-level scope evidence

So sánh final source với V5U6G ZIP đầu vào cho thấy source-owned changes chỉ nằm ở:

```text
index.html
js/main.js
js/modules/attendance.js
js/services/attendance.service.js
package.json
tools/check-attendance-daily-single-refresh-authority.mjs
tools/check-attendance-explicit-shift-authority.mjs
tools/check-attendance-offline-shift.mjs
tools/check-parallel-read-authority.mjs
tools/check-production-residual-defect-closure.mjs
tools/check-attendance-offline-canonical-sync-guard.mjs   [new]
```

Generated `/public` mirrors thay đổi chỉ cho runtime files tương ứng:

```text
public/index.html
public/js/main.js
public/js/modules/attendance.js
public/js/services/attendance.service.js
```

Các frozen areas sau được xác nhận byte-identical với input:

```text
js/modules/dashboard.js             IDENTICAL
js/listeners/profiles.listeners.js  IDENTICAL
firestore.rules                     IDENTICAL
firebase.json                       IDENTICAL
functions/**                        IDENTICAL (7 files)
```

`app.js` cũng không bị G1 sửa runtime business code.

Transaction/Tuition/Debt/Inventory/Quit/Coach/SuperAdmin business modules không xuất hiện trong diff G1.

---

## 12. Mandatory regression

Tất cả **32 mandatory commands** trong danh sách G1 được chạy và final result đều **EXIT 0**.

Các mốc chính:

```text
check:syntax                                      246/246 PASS
check:attendance-offline-canonical-sync-guard      39/39 PASS
check:production-residual-defect-closure            63/63 PASS
check:production-authority-closure                  64/64 PASS
check:attendance-explicit-shift-authority            60/60 PASS
check:attendance-daily-single-refresh-authority      73/73 PASS
check:parallel-read-authority                        48/48 PASS
check:startup-read-budget-freeze                       8/8 PASS
Club Bootstrap                                       20/20 PASS
Club Initial Access                                  39/39 PASS
Auth Context                                         40/40 PASS
Dashboard Single Read                               38/38 PASS
Dashboard Cache Freshness                           49/49 PASS
Dashboard Hydration                                 44/44 PASS
Canonical Transaction                               27/27 PASS
Read Attribution / Canonical TX                     34/34 PASS
Debt Authority                                      32/32 PASS
Inventory Ledger                                    33/33 PASS
Coach Attendance Boundary                           30/30 PASS
Coach Branch Security                               35/35 PASS
Quit Single Source                                  16/16 PASS
Quit Completeness                                     9/9 PASS
Student Search                                      43/43 PASS
Production Stability                                22/22 PASS
```

Full command output được lưu riêng trong regression log.

---

## 13. Meta-suite

Final authoritative runs:

```text
npm run check              = EXIT 0
npm run check:all:critical = EXIT 0
npm run check:all          = EXIT 0
```

### Regression incident được xử lý theo STOP rule

Lần chạy meta đầu tiên dừng ở V5T write-freeze. Điều tra chứng minh:

- working `app.js` SHA-256 = pristine V5U6G `app.js` SHA-256;
- working V5T gate SHA-256 = pristine V5U6G gate SHA-256;
- pristine V5U6G V5T gate = PASS.

Root cause: G1 đổi actual `APP_BUILD_VERSION`, làm gate mất V5U6G compatibility marker dùng để normalize 5 **existing** diagnostic-wrapped legacy write signatures.

Fix: chỉ giữ một V5U6G **compatibility marker comment** trong `js/main.js`, theo pattern lineage markers đã có. Không sửa `app.js`, không nới V5T gate, không thêm writer.

Sau đó V5T freeze PASS.

Một combined meta command sau đó timeout khi `check:all` vừa bắt đầu. Timeout **không được tính PASS**. `npm run check` và `check:all:critical` đã có EXIT 0 trước timeout; `check:all` được chạy lại standalone từ đầu và đạt EXIT 0.

---

## 14. Root / public synchronization

`npm run build:public` = **EXIT 0**.

Final hash comparison scope:

```text
index.html
app.js
style.css
js/**
css/**
```

Result:

```text
matched             122/122
missing             0
different           0
extra runtime files 0
```

Không sửa `/public` bằng tay.

---

## 15. Remote Functions status

```text
REMOTE FUNCTIONS = UNKNOWN
```

Evidence:

```text
Firebase CLI: unavailable
.firebaserc: absent
firebase.json: Hosting + Firestore only; no deployed-state proof
```

Không deploy/delete Functions trong phase này.

---

## 16. Manual production smoke status

Automated deterministic runtime harness đã cover multi-shift offline, context switch, stale chunk, revision race và failure-preservation behavior.

Tuy nhiên browser smoke trên **real production Admin/Coach sessions** chưa thể thực hiện trong môi trường hiện tại vì không có credentials/session kết nối production.

Classification:

```text
AUTOMATED MULTI-SHIFT OFFLINE SMOKE  VERIFIED
AUTOMATED CONTEXT-SWITCH SMOKE       VERIFIED
AUTOMATED FAILURE/REVISION SMOKE     VERIFIED
LIVE REAL-USER PRODUCTION SMOKE      DEFERRED
```

Không tuyên bố production-perfect dựa trên automated tests thay cho live session.

---

## 17. Definition of Done mapping

```text
V2 journal metadata never enters Firestore Attendance          VERIFIED
Whitelist instead of blacklist                                 VERIFIED
Canonical Attendance schema remains business-only for G1 writes VERIFIED
V1 compatibility                                               VERIFIED
Delete semantics unchanged                                     VERIFIED
ONE offline writer                                             VERIFIED
same-context coalescing                                        VERIFIED
different-context no parallel writer                           VERIFIED
A→B exactly one bounded follow-up                              VERIFIED
A→B→C latest-only C                                            VERIFIED
stale old context cannot refresh new UI                        VERIFIED
stale old context cannot start later chunks                    VERIFIED
confirmed-only cleanup                                         VERIFIED
revision 3 cannot delete revision 4                             VERIFIED
Morning/Evening isolation                                      VERIFIED
configured blank shift blocked                                 VERIFIED
legacy no-shift supported                                      VERIFIED
no new getDoc/getDocs/onSnapshot                               VERIFIED
no new listener                                                VERIFIED
no polling                                                     VERIFIED
Dashboard/Profiles/Transactions/Tuition/Debt/Inventory/Quit frozen VERIFIED
Coach boundary frozen                                          VERIFIED
Rules/Functions source frozen                                  VERIFIED
npm run check                                                  EXIT 0
npm run check:all:critical                                     EXIT 0
npm run check:all                                              EXIT 0
root/public synchronization                                    VERIFIED 122/122
remote deployed Functions                                      UNKNOWN
live real-user smoke                                           DEFERRED
historical leaked-metadata cleanup                             DEFERRED / separate maintenance only
```

---

## 18. Architecture freeze recommendation

Sau G1, không có bằng chứng cần mở thêm convergence/refactor phase.

Chế độ phù hợp:

```text
BUG FIX ONLY
+
production monitoring
+
real-user smoke tests
+
measured Firestore optimization only when telemetry proves need
```

Production invariant:

> Một dữ liệu — một authority.
>
> Một mutation — một writer.
>
> Một context — một active async flight.
>
> Một late result — chỉ apply khi context vẫn hợp lệ.
