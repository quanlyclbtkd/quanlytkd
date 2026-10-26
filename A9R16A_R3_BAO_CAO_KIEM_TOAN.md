# A9R16A-R3 — Kiểm toán hai lỗi Điểm danh

Ngày: 2026-10-25T17:22:53.093730+00:00. Kết luận phát hành: **RELEASE_BLOCKED**. Hai lỗi R3 đã đạt kiểm tra mục tiêu; đây là source hoàn chỉnh để review/test, chưa có chấp thuận production hoặc A9R16B. Không deploy; không đọc hoặc sửa dữ liệu production.

## Danh tính và thứ tự thực hiện

Đã tải lại đúng `QR_V11R6_A9R16A_R2_STRICT_SEQUENTIAL_DEFECT_CLOSURE_FULL_SOURCE(1).zip`, SHA-256 `b96b7e5fc9a77b119a8e696babddd5bbd87f0dda59bbaf8c1a0baf86f4699804`. Runtime baseline `93030b1d396b5c257b60d11a2c8a12f981cd967639fcc67603c90131c763e5fa`; build R2 `qr-v11r6-a9r16a-r2-sequential-closure-20261025`. Baseline `npm run check` và `npm run check:all` đều exit0; root/public129/129. Chứng cứ thô nằm trong `baseline/` của RAW_LOGS.

Đối chiếu độc lập A9R14 ZIP SHA `a81478cb6fb50eeed23ece4d0e106c949d73397010d52ead8adff6841bbc5c8a`. Issue1 được tái hiện RED, xác nhận nguyên nhân, sửa, chạy regression và đóng checkpoint trước khi tạo workspace Issue2. Runtime checkpoint Issue1: `aad301052815eb7968164fc2b2923e376580e0f39104dc48d45c8d99a45f417b`. Issue2 chỉ thay phần `showAttMemberHistory`; helper ca tập và students của Issue1 được khóa byte-identical.

Runtime cuối: `950dde369575bd099170b86d6923063bf11ddf4f9ae6376c759a2ec680d1ea2d`. Build duy nhất trong candidate: `qr-v11r6-a9r16a-r3-shift-history-mobile-20261025`. SHA ZIP cuối xem manifest sidecar để tránh vòng lặp checksum của chính archive.

## Issue1 — Phục hồi hợp đồng đọc ca dùng chung cũ

A9R14 `js/modules/attendance.js::_getEligibleAttendanceShifts` có `if (!shiftBranch) return true`; writer Admin cũ có thể lưu branch trống. Selector hồ sơ dùng shift ID và hiển thị name/timeStart/timeEnd. Vì vậy branch trống của ca đã lưu là historical global contract, không mặc nhiên là dữ liệu sai.

A9R15 đưa `trainingRegistration.js::shiftAuthority` strict CS1–CS10 vào cả đường đọc; R2 tiếp tục dùng kết quả đó ở bộ chọn ca, kiểm tra đăng ký và roster. Ca cũ bị loại dù object/ID/time còn nguyên. RED trình duyệt trên R2 tái hiện không có G1 trong selector, roster trống và Edit Student hiển thị lựa chọn không hợp lệ. Không có bằng chứng time fields bị database xóa: đường gọi history trực tiếp vẫn đọc được giờ trên fixture.

Sửa trong canonical owner hiện hữu:

- `shiftAuthority` vẫn strict cho tạo ca mới. Toàn bộ block `window.addShift` đến `window.deleteShift` byte-identical baseline; tạo branch trống vẫn bị chặn.
- Pure helper `classifyShiftScope` phân biệt EXPLICIT_BRANCH, LEGACY_GLOBAL và INVALID. Chỉ branch null/missing hoặc chuỗi rỗng/whitespace trên shift object đã lưu được đọc theo legacy-global. `ABC`, `CS99`, giá trị số/boolean không thành global.
- `resolveTrainingShift` chỉ nhận ID chuỗi hiện hữu duy nhất. Duplicate ID trả unresolved; không dùng tên, label, vị trí mảng hay first-match fallback.
- `isShiftEligibleForBranch` bắt buộc cơ sở canonical. Selector và kiểm tra đăng ký dùng cùng phép xác minh. Legacy-global không tạo quyền đọc profile; verified Coach branch/profile branch và Rules vẫn độc lập.
- Giữ format trainingDays JS0=CN,1..6=T2..T7; giữ ca trống optional và ngày trống theo chính sách cũ. Roster vẫn lọc active, cơ sở, lịch ngày, ca, tháng nghỉ. Những dữ liệu thiếu/sai không được tự sửa.

S01–S18 đều PASS. Kiểm tra trình duyệt gồm Admin/Coach CS1 và CS2, explicit shift khác branch bị ẩn, legacy roster chỉ có profile của branch được cấp, Edit Student giữ G1 và nhãn `Ca Chiều (17:15–18:45)`, tạo ca mới branch trống bị chặn, ca mới CS1 dùng đúng settings writer cũ. Kiểm tra thêm roster loại profile inactive, khác ngày, khác ca, tháng nghỉ và ngày sai format; ca/ngày trống tiếp tục hành vi cũ.

`A9R16A_R3_SHIFT_SCOPE_AUDIT.json` là audit read-only của fixture pseudonymous, không phải kết quả quét production. Chưa có export thật để chứng nhận mọi ca hiện hữu có đủ timeStart/timeEnd. Không fabricate giờ; không migration/profile repair.

## Issue2 — Modal, vùng cuộn và nút lịch sử

RED dùng HTML/CSS và owner thật, roster52 profile tổng, ba viewport; SDK transport fixture được ghi rõ. Các số sau là sau khi animation hoàn tất:

| Viewport | Vị trí đầu sheet trước | Sau sửa containment | scrollTop sau fast reopen trước | Sau sửa cuối |
|---|---:|---:|---:|---:|
| iPhone390×844 | 5620.05px | 151.92px | 239px | 0px |
| Android360×800 | 5731.11px | 144px | 275px | 0px |
| Desktop1280×900 | 5602.50px | 162px | 161px | 0px |

Nguyên nhân là combination đã đo:

1. **MODAL_PARENT/STACKING_CONTEXT**: tab_attendance có `contain: layout style`; fixed modal con dùng tab roster dài làm containing block. Tại window.scrollY0, sheet nằm cuối tab >5600px. Mobile hit test ở vị trí đáng lẽ là modal lại trúng bottom navigation. Chuyển chính modal hiện hữu sang document.body giải quyết containment/stacking; không sửa nav hoặc global CSS.
2. **FULL_HISTORY_DISCOVERABILITY**: CTA cũ ở sau calendar; trên iPhone offsetTop khoảng864.7px, vượt clientHeight692px. CTA ban đầu mới nằm gần summary, offsetTop501px và trong viewport. Vẫn chỉ có một button/handler. Sau khi tải page, chính button này chuyển xuống sau các history rows để tiếp tục Load More; calendar chính vẫn ở trước các rows đã tải.
3. **PERSISTED_SCROLL_OFFSET**, phụ thuộc timing: đo từng stage bằng geometry/scroll getter buộc layout và làm loading placeholder tự clamp về0. Reproduction bổ sung không đọc geometry giữa các bước, sau82 history rows và response nhanh, chứng minh offset239/275/161 còn sót. Do đó reset đúng một lần ngay sau loading placeholder, trước await. Không reset trên async primary commit, page result hoặc load more; scroll của user sau khi mở được giữ.

Close button44px nằm trong chrome modal, dùng được cả khi pending hoặc ở cuối danh sách; backdrop đóng được. Không thay `_memberHistoryRequestId`, authority snapshot, context guard hoặc điều kiện modal đã đóng. Close pending primary/page không reopen; A→B, CS1→CS2 và revoke branch đều loại response cũ.

51 kiểm thử trên Chromium viewport đều PASS, bao phủ H01–H19. Mở mới/reopen/member/month switch về đầu; tên/đai/ngày tập/ca+giờ/count/rate/calendar đúng; CTA thấy ngay mà không phải kéo tới cuối. Physical Android, iPhone/Safari chưa được chứng nhận.

## Query, authority, READS và dữ liệu lịch sử

`AttendanceService` chỉ đổi import-cache metadata do build; phần logic byte-identical sau khi chuẩn hóa literal import. Quarter summary vẫn query ba tháng như R2. Full History giữ profileId + historyAuthority + branch, orderBy documentId ASC, limit40 và scoped cursor. Không query toàn club, không đổi authority, không auto-load trang khi mở modal, không thêm cache hoặc listener.

Authority giữ `attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`; JournalV4, CAS/version, physical document identity và diagnostic legacy collision giữ nguyên. Coach không raw-read legacy; Admin audit legacy giữ policy hiện hữu. Không rewrite branch cũ khi profile chuyển cơ sở. Không có attestation/migration mới. UI tiếp tục nói “Lịch sử Điểm danh đã xác minh”, không gọi là lifetime history.

| Đường chạy tương đương | getDoc trước/sau | getDocs trước/sau | onSnapshot trước/sau |
|---|---:|---:|---:|
| Mở/reopen primary history | 0/0 | 1/1 | 0/0 |
| Click mở first page | 0/0 | 1/1 | 0/0 |
| Click page kế | 0/0 | 1/1 | 0/0 |
| Fixture đổi principal sang CS2, reload shifts | 1/1 | 0/0 | 0/0 |
| Mở primary tại CS2 | 0/0 | 1/1 | 0/0 |

Automatic Full History page reads=0; page click tương ứng một query; rapid double-click chỉ một query; số bản ghi/trang40/40/2, không trùng hoặc mất boundary. Không reset scroll khi thêm page. Các số RPC trên là transport fixture có ràng buộc query thật, không phải hóa đơn production.

Daily explicit path hợp lệ trước/sau đều một query ngày. Legacy path đang lỗi ban đầu không query(0); khôi phục chức năng dùng lại query ngày vốn có(1). Không đánh tráo mức0→1 này thành raw delta0. Không thêm owner/query song song. Static call sites toàn canonical runtime giữ getDoc24/getDocs58/onSnapshot35; history listener mới=0, migration writes=0. Live billed telemetry/READS approval còn ENV_BLOCKED.

## Regression, phạm vi và build

- Final `npm run check` và `npm run check:all`: exit0, logs đầy đủ. Baseline và checkpoint Issue1 cũng exit0.
- Registration26 case; pure compatibility15; browser shift14; browser history51 case PASS.
- Exact Rules/runtime-query Emulator22 case PASS: scope/profile/authority/branch, multi-year pagination, tombstone boundary, Admin legacy, forged/cross-club deny, legacy deny, Finance deny, attendance delete deny, revoked assignment/stale response.
- Firebase browser SDK10.7.1:10/10; actual Chromium/native IndexedDB/two-tab/Journal/CAS suite:28/28. Không nâng old IndexedDB/Journal thành authority mới.
- Full production HTML/app/main startup fixture1500 profile, branch750:5 cold +5 warm lần liên tiếp; Node/browser SDK/listener/store/filter/DOM đều750. Bốn module format/inventory service/students/finance đều evaluate một lần. Không dùng phép đo này làm performance optimization hoặc production latency baseline.
- R2 loader contract/single-flight PASS. QR memo/pixels/receipt và finance owner mutation tests PASS; required npm suites giữ Debt/transaction/Inventory guards. Không live banking/provider request.
- Root/public129/129. Full canonical module graph không có physical module nhận hai effective URLs. Chỉ ba runtime owner có thay đổi semantic: trainingRegistration.js, students.js, attendance.js. Có 41 file source/tool thay đổi, gồm public mirrors và metadata/tests; danh sách/hash từng file trong CHANGED_FILES.

Ngoài ba owner, thay đổi runtime chỉ là literal cache/import và APP_BUILD_VERSION. Có SCOPE_EXPANSION_JUSTIFICATION trước khi mở scope: body mới bị pin R2 từ chối và HTML-only builder để orphan Students/Finance barrel dùng hai URLs. Đã mở rộng chính cache builder hiện hữu bằng full canonical entries; không có build owner mới. Giữ immutable các pin cũ, thêm pin R3. Hai gate pin cache cũ nhận token đúng từ manifest đã xác thực, giữ business assertions. Những expectation blank-is-unresolved ở test đọc A9R15 được cập nhật duy nhất theo contract read-compatibility R3 được yêu cầu; không nới guard tạo ca hoặc ACL/Finance/CAS.

Các lần chạy thất bại ban đầu được giữ trong raw logs, không tính là PASS. Cặp npm chạy đồng thời va chạm tệp tạm cùng PID trong syntax harness; chạy lại tuần tự đạt. Layout assertions chờ finite animation hoàn tất; fast-response scroll RED vẫn được sửa bằng runtime reset, không bị bỏ assertion.

## Ledger và blocker

| Gate | Kết quả |
|---|---|
| SOURCE_IDENTITY | PASS |
| LEGACY_GLOBAL_SHIFT_COMPATIBILITY | PASS |
| STRICT_NEW_SHIFT_AUTHORITY | PASS |
| ADMIN_SHIFT_SELECTION | PASS |
| COACH_SHIFT_SELECTION | PASS |
| COACH_BRANCH_ISOLATION | PASS |
| ATTENDANCE_ROSTER | PASS |
| REGISTERED_SHIFT_TIME | PASS |
| MEMBER_HISTORY_SCROLL_LIFECYCLE | PASS |
| MEMBER_HISTORY_DISCOVERABILITY | PASS |
| AUTHORIZED_FULL_HISTORY | PASS |
| ATTENDANCE_CAS | PASS |
| JOURNAL_V4 | PASS |
| FINANCE_SECURITY | PASS |
| READS | PASS |
| LISTENERS | PASS |
| RULES | PASS |
| INDEXES | PASS |
| ROOT_PUBLIC | PASS |
| FULL_REGRESSION | FAIL_TEST_HARNESS |

`FULL_REGRESSION=FAIL_TEST_HARNESS` phản ánh supplemental mobile-shell gate79/80, assertion24 cấm toàn bộ !important. Đã chạy lại đúng gate trên baseline chưa sửa và candidate: cùng79/80, cùng lỗi. Ghi **PRE_EXISTING_QA_DEBT**; global CSS byte-identical. Các suite bắt buộc npm/targeted vẫn PASS, không dùng chúng để che debt này.

Các điều kiện rộng hơn chưa hoàn tất: thiết bị thật/iOS Safari; actual dataset/time-field audit; actual legacy attestation coverage; Cloud indexes; live/billed READS và read-cost approval; quyết định V11/release owner. Không tự mở A9R16B. Không có finding runtime mới ngoài hai lỗi được sửa trong scope.

## 15 câu trả lời bắt buộc

1. Ca biến mất vì A9R14 cho đọc ca branch trống như global, còn strict read validator A9R15/R2 loại chúng; dropdown/registration/roster cùng bị ảnh hưởng.
2. Branch trống của ca đã lưu là historical global contract theo A9R14; không phải quyền cho tạo ca mới global.
3. **NO**: ca mới branch trống vẫn bị chặn, strict writer giữ byte-identical.
4. **NO**: không migration Firestore, không auto-fix profile/shift.
5. **Có trên fixture/browser**: Admin và Coach CS1/CS2 chọn lại được ca cũ; S01–S04 PASS.
6. **NO**: Coach chọn legacy-global không thấy profile ngoài cơ sở được cấp; S05/S06 và Rules boundary PASS.
7. **Có với dữ liệu giờ hợp lệ**: `Ca Chiều (17:15–18:45)` ở Edit Student và primary history. Không chứng nhận mọi production shift có dữ liệu giờ khi chưa có export.
8. **Combination đã đo**: modal containment/stacking + CTA sau calendar + fast-response persisted scroll sau nhiều pages. Geometry instrumentation có thể che nhánh timing cuối; có RED không instrumentation riêng.
9. **Có trong ba viewport**: fresh/reopen/member/month switch scrollTop0; H01/H02/H03 PASS. Chưa thay cho physical-device acceptance.
10. **NO**: initial CTA ở gần summary, trong viewport. Chỉ một CTA; sau khi mở pages, button cũ chuyển xuống làm Load More.
11. **NO**: mở modal không tự query Full History page; chỉ summary ba tháng vốn có.
12. **NO**: query architecture, pagination40/documentId/scoped cursor và historyAuthority không đổi.
13. Không thêm reader/listener. Luồng history tương đương giữ READS; daily bị lỗi0→khôi phục1 là truy vấn ngày cũ, không phải tăng reader owner. Live billed reads chưa được chứng minh.
14. Finance/QR, Rules/indexes, R2 loader không đổi semantic; Rules/indexes/app.js/loader bodies giữ nguyên. Một số importer Finance/Journal/service chỉ nhận cache metadata mới, đã có justification và audit normalized-body.
15. Trước A9R16B vẫn còn PRE_EXISTING_QA_DEBT và các điều kiện real-data/Cloud/physical-device/cost/V11/release approval nêu trên. Kết luận duy nhất: **RELEASE_BLOCKED**.

## Bàn giao

FULL_SOURCE chứa project hoàn chỉnh và audit sidecars cần thiết. Master/Issue patches chỉ bao phủ source/tool thay đổi; các báo cáo đóng gói kèm là tài liệu ngoài patch source. RAW_LOGS riêng chứa baseline/RED/GREEN/regression và validation; không chứa browser screenshots. SHA manifest ngoài FULL_SOURCE ghi output ZIP SHA và runtime/file hashes. Đã kiểm tra apply master, apply tuần tự hai patch và rollback mỗi issue độc lập trên bản sao, với cache tag rollback riêng; chi tiết trong ROLLBACK.
