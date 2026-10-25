# A9R15R1 — Báo cáo kiểm toán độc lập

**Quyết định: RELEASE_BLOCKED.** Hai harness đã sửa và kỹ thuật kiểm thử xanh; chưa có dữ liệu thật, môi trường Cloud/index và đầy đủ phê duyệt/thiết bị vật lý để đóng release. Không deploy; không sửa dữ liệu production. Runtime A9R15 giữ nguyên từng byte.

## Baseline và giới hạn kiểm toán

Đầu vào đúng `QR_V11R6_A9R15_TRAINING_REGISTRATION_AUTHORIZED_COACH_FULL_HISTORY_FULL_SOURCE(1).zip`, SHA-256 `f5e249bc0428204ef1c026cefa77eb527dc365994116c23c2c016cc8d9f4562f`, CRC PASS. Làm trên bản sao độc lập. Dấu thời gian, path nguồn, versions và log trước patch nằm trong evidence riêng `baseline/`. `npm ci` thực thi thật, không thay package/lock.

Runtime SHA `f112c0aea086cb3e7684d03ddfe1897d82bcb159086b0a8fd895c71e9208fb67`; build `qr-v11r6-a9r15-training-history-closure-20261025`. Canonical root/public 129/129. `app.js` 698.720 bytes, gate đếm 11.211 dòng (`wc` có 11.210 newline), SHA `d0fd29acc5e298e461763daea31d89228052fe08b6f2ba323aa0ae9bf2f77463`. Rules `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`; indexes `72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2`. Authority `attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`. Journal `tst-attendance-journal-v4`, IndexedDB schema 1. Static call sites getDoc/getDocs/onSnapshot = 24/58/35, không đổi.

Manifest runtime gốc vẫn pin A9R15 và lineage A9R14; `inputZIP_SHA256` bên trong pin A9R15 là ZIP A9R14 trước đó, không phải parent ZIP R1. Manifest bàn giao R1 ghi riêng đúng parent ZIP `f5e249bc0428204ef1c026cefa77eb527dc365994116c23c2c016cc8d9f4562f`. Không thay pin, build tag hoặc import graph khi chỉ sửa QA.

Môi trường đã thực thi: Node 24.22.1, npm 11.9.0, Java 17.0.20, Firestore Emulator 1.19.8, Firebase Node SDK 12.15.0, browser SDK 10.7.1, Playwright Node 1.62.1, Chromium Headless 156.0.8078.47. Browser là Chromium thật/mobile viewport và native IndexedDB; không phải nghiệm thu điện thoại vật lý/Safari.

## Nguyên nhân hai FAIL và patch

Baseline tái hiện cả hai harness exit 1; `npm run check` và `check:all` cũng exit 1 ở precheck. Registration 25 và browser 27 đã xanh trước patch. Không có RED runtime cần workaround.

**Explicit shift:** `_renderShiftSelector` gọi native `new Option`, nhưng DOM fake không cung cấp `Option`/selection semantics. Loader bắt exception, gây blocked authority, zero daily calls và timeout phía sau. Thêm DOM shim có native selection semantics là sửa môi trường test. Đối chiếu độc lập 11 trường hợp với chính Chromium `Option/HTMLSelectElement`, tất cả khớp.

**Daily refresh:** cùng exception trong setup gây cascade vào flight; không kết luận daily owner lỗi. Thử sửa DOM riêng vẫn RED: fixture empty shifts lại gán orphan IDs, positive shifts thiếu branch; chọn option trước khi options được mount là hành vi browser không hỗ trợ. Sửa setup dùng optional blank registration đúng contract, explicit branch và đợi canonical loader trước chọn. Giữ các assertion same-key/coalescing/stale/entrypoint/owner hiện hữu.

Một assertion pre-A9R15 cho blank branch là “global” xung đột protected contract A9R15. Thay bằng explicit allowed-branch only và thêm unresolved-global DENY. Đây là điều chỉnh expectation dựa trên contract bất biến đã được user yêu cầu, không lấy observed output làm business expected. NC1 chứng minh assertion vẫn bắt regression. Các assertion khác giữ nguyên, không skip, không xóa/rename script. Fixture V11 browser cũng bổ sung branch canonical; 28 assertion cũ không đổi.

Final: explicit 61/61, daily 73/73; native DOM oracle 11/11. NC1–NC5 đều exit 1 đúng behavioral assertion khi cố ý bỏ branch scope, sai branch, bỏ authority, bỏ stale defense hoặc mở Finance. Mutant chỉ ở bản sao tạm; hash runtime gốc không đổi. Raw log giữ cả RED, DOM-only RED và GREEN. Một probe daily trung gian có lỗi method stub do quá trình QA và đã sửa; đó không phải nguyên nhân baseline.

Diff công cụ: hai harness gốc; `tools/v11/browser.mjs`; bổ sung telemetry/edge cases trong `tools/a9r15/history.emulator.mjs`, `tools/a9r15/runtime.browser.mjs`; sáu công cụ `tools/a9r15r1/`. Không sửa package.json/lock, runtime, Rules/indexes, approval records.

## Registration: code được bảo vệ, dữ liệu thật chưa được audit

Chạy lại 25 assertions: CS1–CS10, mismatch, fake/deleted/moved/duplicate ID, unresolved branch, optional blank shift, ngày canonical JS 0..6, legacy malformed days, immutable ID/reorder, admission/direct service guard, zero invalid writes. Browser thật kiểm Add/Edit, branch→shift, không auto-pick/save, roster theo branch/day/shift/active/nghỉ và pseudonymous audit.

Ba race ở ngay trước Save — shift bị xóa, đổi CS1→CS2, mất authority — đều bị canonical refresh/validation chặn, zero writer calls, profile không bị sửa. Taxonomy mismatch là `SHIFT_BRANCH_MISMATCH`; API error giữ `TRAINING_SHIFT_BRANCH_MISMATCH` đúng A9R15.

Fixture audit có sáu profiles giả để chứng minh sáu category, không đại diện dữ liệu CLB. Không được cung cấp export profile + canonical shift của environment thật được phép. Vì vậy `realDataAudit.classification = ENV_BLOCKED`, `totalProfiles` và từng số lỗi là **null**, không phải 0. Không thể kết luận profile hiện hữu sạch. Có công cụ offline read-only và runbook nhận export đúng scope; không thêm runtime reader/writer/migration.

```text
NEW_WRITE_PROTECTION = PASS (runtime/service/browser/three pre-save races)
EXISTING_DATA_AUDIT = ENV_BLOCKED / REAL_DATA_NOT_VERIFIED
ORPHAN_DATA_COUNT = null
BRANCH_SHIFT_MISMATCH_COUNT = null
TRAINING_DAYS_INVALID_COUNT = null
```

## Coach history và provenance

Runtime query capture thực tế luôn có path club + profileId + current historyAuthority + branch, order `__name__ ASC`, `limit <=40`, scoped cursor. Node Emulator có 28 captured runtime calls và 22 tests PASS; browser SDK 10.7.1 có 10 PASS, 85-record multi-year history đầy đủ theo fixture. Node dataset riêng có 86 visible records/87 raw documents qua 13 pages <=7 để stress boundary; không lẫn với dataset browser hoặc dữ liệu thật.

Đã kiểm first/next/final/empty, 0/1/40/41/80 records, raw tombstone page, cùng ngày khác shift, Dec→Jan, leap years, retry cùng cursor, rapid double-click, CS1→CS2→CS1, transfer giữ branch lịch sử, same-name khác ID, scope/session cursor, branch switch/revoke/relogin stale response DROP, hai tab không leak cache. Scope current-authority không bị nới và không query toàn club.

Coach CS1 bị server DENY khi giả CS2 dù client allowedBranches bị forge; server assignment revoke cũng DENY. Admin vẫn đọc legacy theo quyền hiện hữu. Raw legacy authority vẫn DENY với Coach; không sửa authority, physical document hoặc tự attest. Policy provenance PASS; tính đầy đủ attestation của cohort thật vẫn `LIVE_NOT_VERIFIED`.

```text
CURRENT_AUTHORITY_HISTORY = PASS (controlled fixtures) / LIVE_NOT_VERIFIED (actual club)
BRANCH_ISOLATION = PASS
PAGINATION = PASS
STALE_RESPONSE = PASS
INDEX_READINESS = ENV_BLOCKED / INDEX_READINESS_NOT_VERIFIED
LEGACY_HISTORY = LEGACY_HISTORY_REQUIRES_ADMIN_ATTESTATION
ALL_LIFETIME_HISTORY_COMPLETE = false
READS = measured delta 0; owner cost approval RELEASE_BLOCKED
```

## Index Cloud

Exact runtime query chạy được trên Emulator và browser SDK thật. Không nhận `failed-precondition`/required-index specification tại Emulator. Điều này **không chứng minh** Cloud index sẵn sàng: Firebase ghi rõ Emulator không track compound indexes ([tài liệu chính thức](https://firebase.google.com/docs/emulator-suite/connect_firestore#how_the_cloud_firestore_emulator_differs_from_production)).

Không có environment Cloud/session test được cấp trong phiên này; không probe production. Kết quả `INDEX_ENV_BLOCKED`, `INDEX_READINESS_NOT_VERIFIED`; spec/link index **null**. Không thêm index phỏng đoán. Rules/indexes giữ nguyên SHA; readiness đúng project phải đóng bằng runbook riêng.

## READS và listener

Chạy cùng instrumentation owner trên runtime A9R15 nguyên bản và R1, 11 flow đều khớp:

| Flow | A9R15 getDoc/getDocs/onSnapshot | R1 getDoc/getDocs/onSnapshot | Δ |
|---|---|---|---|
| registration.open-edit | 1/0/0 | 1/0/0 | 0/0/0 |
| registration.save-valid | 1/0/0 | 1/0/0 | 0/0/0 |
| 1.open-attendance-tab | 0/2/0 | 0/2/0 | 0/0/0 |
| 2.select-CS1 | 1/1/0 | 1/1/0 | 0/0/0 |
| 3.open-member-summary | 0/1/0 | 0/1/0 | 0/0/0 |
| 4.first-verified-page | 0/1/0 | 0/1/0 | 0/0/0 |
| 5.next-verified-page | 0/1/0 | 0/1/0 | 0/0/0 |
| 6.close-reopen-same-member | 0/1/0 | 0/1/0 | 0/0/0 |
| 7.switch-CS1-to-CS2 | 1/1/0 | 1/1/0 | 0/0/0 |
| 8.open-same-profile-in-CS2 | 0/1/0 | 0/1/0 | 0/0/0 |
| 9.reload-relogin | 2/1/0 | 2/1/0 | 0/0/0 |

Login source verification slice dùng app.js + canonical Coach assignment thật với SDK port: CS1, CS2, CS1+CS2 đều 2 getDoc (users + coaches), 0 getDocs, 0 onSnapshot; concurrent users read coalesced, R1 delta 0. Phần này không đo toàn Firebase Auth provider/bootstrap/profile listeners hoặc hóa đơn production.

First/next page: 1 getDocs, tối đa 40 raw documents; onSnapshot 0, Finance flow reads 0. Không tính summary thành full-history prefetch. Final page đúng bằng limit cần một empty query xác nhận complete. Tổng static sites 24/58/35 không đổi. Sáu cost scenarios quy mô 1000/1500 fixture đã chạy trong gate B7; hồ sơ phê duyệt chi phí của owner vẫn thiếu, không tự approve.

## Regression, security và các module không liên quan

`npm run check` exit 0 (precheck 4 + check 54); `npm run check:all` exit 0 (97). Thực thi độc lập union 159 leaf của original package scripts: **156 PASS, 0 FAIL_RUNTIME, 0 FAIL_TEST_HARNESS, 3 RELEASE_BLOCKED**. Các gate policy giữ nguyên exit 1:

- `check:d1c3b7-release-security`: technical Rules/browser/cost matrix xanh, thiếu owner-supplied document-read cost authorization.
- `check:d1c3b6-release-blockers`: kế thừa B7 cost authorization hold.
- `check:v10-release-risk-boundary`: quyết định V11 vẫn `pending`, không phải `approved`.

Không sửa approval hoặc biến exit 1 thành PASS. Script `check:all:critical` sẽ dừng ở policy gate đầu; runner audit tiếp tục từng leaf riêng để biết các test sau không bị che.

Rules rộng 74, runtime exact query 22, CAS/collision 22, browser SDK10 10 và native browser/writer 28 đều PASS. Coach Finance/Inventory, cross-club, physical delete, revoked assignment DENY được giữ; CAS/version và diagnostic `intent-version-read/docId/branch/role/legacyCollisionPossible` giữ nguyên. Journal native controls 12 và versioned service contracts 13 PASS, không promote V3, không clear pending.

Học phí/Báo nợ/Kho, QR, SuperAdmin, assignment, Mirror CAS/Journal không có runtime diff: toàn bộ 129 runtime file và public mirror cùng hash parent. Các gate finance/debt/inventory/QR/SuperAdmin trong 159 leaf đã chạy xanh; đây là bằng chứng diff + regression, không chỉ lời khẳng định không đổi.

Mobile month-before-search A9R14 giữ nguyên, bảy layout/search kiểm tra PASS; registration/history 320/390/767/1024px PASS. Chromium native offline/reload/two-tab checks PASS. Chưa nghiệm thu Android/iOS vật lý/Safari hoặc production-specific environment.

## Kết luận A–J

| Mục | Trả lời có giới hạn bằng chứng |
|---|---|
| A. Hai harness đã sửa đúng? | Có: 61/61, 73/73; native oracle 11; NC1–NC5 bắt behavioral regression. |
| B. Runtime phải sửa thêm? | Không phát hiện RED runtime; 0 runtime file đổi, build/Rules/indexes không đổi. |
| C. Bao nhiêu profile thật sai? | Chưa xác định; total và error counts null, REAL_DATA_NOT_VERIFIED. |
| D. Coach xem đủ current authority? | PASS trong fixture multi-year/branch/pagination; actual club LIVE_NOT_VERIFIED; legacy không tự bao gồm. |
| E. Cần index mới? | Chưa xác minh Cloud; INDEX_ENV_BLOCKED, không thêm index. |
| F. READS tăng bao nhiêu? | Δ getDoc/getDocs/onSnapshot = 0 trong 11 flow + 3 auth verification slices; billed/live full-login chưa đo. |
| G. Listener mới? | 0; new history onSnapshot = 0. |
| H. Rules thay đổi? | Không; SHA `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`. |
| I. Học phí/Báo nợ/Kho thay đổi? | Không có runtime diff; regression các domain đã PASS. |
| J. Mức candidate? | RELEASE_BLOCKED theo ledger; không staging/production claim. |

Không còn technical failure trong phạm vi kiểm thử đã chạy. Các mục ENV_BLOCKED/LIVE_NOT_VERIFIED/RELEASE_BLOCKED vẫn hiện rõ; cần dữ liệu/export, Cloud query/index evidence, provenance và owner approvals/thiết bị vật lý để xét tiếp. Runbook và rollback kèm source; raw logs ở gói evidence riêng. SHA source ZIP nằm ở manifest bàn giao ngoài ZIP để tránh self-hash vòng tròn.

## Gate cuối

| Gate | Trạng thái | Bằng chứng / phạm vi |
|---|---|---|
| SOURCE_IDENTITY | PASS | Exact parent ZIP SHA + CRC; 0 changed runtime assets — `baseline/INPUT_IDENTITY.json; A9R15R1_SHA256_MANIFEST.json` |
| QA_HARNESS | PASS | Original harnesses 61/61 and 73/73, native DOM oracle 11/11, NC1–NC5 detected — `A9R15R1_HARNESS_CLOSURE.json` |
| TRAINING_REGISTRATION_RUNTIME | PASS | 25 registration assertions + 27 browser cases + three pre-save races blocked with zero writes — `EXTRA_BROWSER_MATRIX.json; BROWSER_CORE.json` |
| TRAINING_REGISTRATION_REAL_DATA | ENV_BLOCKED | No authorized actual profile/shift dataset; all real counts null, never inferred zero — `A9R15R1_TRAINING_REGISTRATION_AUDIT.json` |
| COACH_AUTHORIZED_HISTORY_RUNTIME | PASS | Exact bounded query, multi-year/branch pagination, offline/server verification, stale drop — `A9R15R1_COACH_HISTORY_MATRIX.json` |
| COACH_HISTORY_INDEX_READINESS | ENV_BLOCKED | INDEX_ENV_BLOCKED; Emulator cannot prove compound index readiness on Cloud — `A9R15R1_FIRESTORE_QUERY_INDEX_RESULT.json` |
| COACH_BRANCH_ISOLATION | PASS | Server-authoritative assignment blocks forged local branch, cross-club and revoked assignment — `EXACT_RUNTIME_QUERY.json; Emulator raw log` |
| LEGACY_HISTORY_PROVENANCE | LIVE_NOT_VERIFIED | Raw legacy DENY tested; actual legacy cohort/Admin attestation completion unknown — `A9R15R1_COACH_HISTORY_MATRIX.json` |
| CAS | PASS | Absent create, update, stale CAS DENY, idempotency and physical legacy collision remain — `CAS_COLLISION.log; SDK10_BROWSER.json` |
| JOURNAL_V4 | PASS | Native IndexedDB, two tabs, legacy quarantine and pending intent preservation pass; no V3 promotion — `JOURNAL_NATIVE.json; NATIVE_BROWSER.json` |
| FIRESTORE_RULES | PASS | Byte-identical rules hash; 74 broad Rules cases and exact history query tests — `A9R15R1_EMULATOR_RESULTS.json` |
| FIRESTORE_INDEXES | PASS | File identity only: unchanged SHA; Cloud readiness is a separate ENV_BLOCKED gate — `A9R15R1_SHA256_MANIFEST.json` |
| FINANCE_SECURITY | PASS | Tuition/Debt/Inventory runtime bytes unchanged; Coach Finance/Inventory DENY gates remain — `regression/RESULTS.json; RUNTIME_PRESERVATION.log` |
| READS | RELEASE_BLOCKED | Measured R1–A15 delta 0, but required owner document-read cost approval absent; live billed reads unknown — `A9R15R1_READS_COMPARISON.json; B7 raw log` |
| LISTENER_BUDGET | PASS | 0 new history onSnapshot; total static 35 unchanged — `A9R15R1_READS_COMPARISON.json` |
| MOBILE | PASS | Actual Chromium mobile-sized DOM/layout + native IndexedDB pass; physical Android/Safari not accepted — `BROWSER_CORE.json; NATIVE_BROWSER.json; A9R14_MOBILE.log` |
| ROOT_PUBLIC | PASS | 129/129; missing 0, extras 0, mismatch 0; all match parent bytes — `A9R15R1_ROOT_PUBLIC_PARITY.json` |
| FULL_REGRESSION | PASS | npm check/check:all exit 0; 156 technical leaves PASS; 3 intentional release-policy leaves remain blocked — `REGRESSION_SUMMARY.json; regression/RESULTS.json` |
| PRODUCTION_ACCEPTANCE | RELEASE_BLOCKED | Real data, Cloud index, actual provenance, READS approval, physical devices and release owner approval incomplete — `A9R15R1_RELEASE_LEDGER.json` |
