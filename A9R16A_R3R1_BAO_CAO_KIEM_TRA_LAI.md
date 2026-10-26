# A9R16A-R3R1 — Kiểm tra lại và hoàn thiện

Ngày: 2026-10-26T01:44:19.322030+07:00.

**R3 sửa đúng hướng, nhưng chưa khép hết vòng đời modal và trường hợp ngày tập trống. R3R1 bổ sung các thiếu sót đã tái hiện dưới đây.** Trạng thái phát hành: **RELEASE_BLOCKED**. Chưa deploy, không đọc/chỉnh dữ liệu production, không tự mở A9R16B.

## Danh tính và phần R3 giữ đúng

Đã tải lại chính FULL_SOURCE và audit package R3. ZIP SHA `da9aad90e3b70d50203f153832012016a66f27452f8b023a7b0a4b849ab58624`; runtime parent `950dde369575bd099170b86d6923063bf11ddf4f9ae6376c759a2ec680d1ea2d`. CRC, source pin, root/public129/129 hợp lệ. Baseline npm check/check:all exit0.

R3 đã tách legacy-global read compatibility khỏi strict new-shift write, giữ stable shift ID/duplicate-ID fail-closed và Coach branch scope. Đưa modal ra body, reset scroll lúc mở và CTA gần summary giải quyết đúng lỗi containment/scroll ban đầu. Tuy nhiên chuyển parent làm mất tác dụng ẩn modal theo mainApp/tab;51 case trước chưa bao phủ các nhánh kết thúc quyền truy cập.

Runtime R3R1: `3b5f042637f7449c07fd3efdf69980d2d15d60071d12f673bda3d8387b50ed84`. Build duy nhất: `qr-v11r6-a9r16a-r3r1-reviewed-history-20261026`. Pin R3 cũ không bị ghi đè.

## RED → sửa → GREEN

| Trường hợp | R3/trước bổ sung | R3R1 |
|---|---|---|
| Auth user=null, Admin/Coach cold/warm | UID trống, mainApp ẩn nhưng còn thấy tên võ sinh | Modal ẩn, bodyLength0, response cũ bị vô hiệu |
| Admin đổi khỏi Điểm danh | Đã sang tab_active nhưng modal vẫn hiện | Đóng trước mọi early return cache/legacy/dashboard |
| Server khóa CLB trong phiên | Tab đã ẩn nhưng modal còn542 ký tự, che banner khóa | Giữ nguyên locked predicate; modal ẩn và nội dung rỗng |
| trainingDays=[], null hoặc missing | Shift/time hợp lệ trong store nhưng panel không render | Hiện ca/giờ, ghi “Chưa chọn ngày tập cụ thể.” |
| trainingDays=[1,3,5] | Hiện đúng | Giữ nguyên |

Sửa theo canonical owner:

- `attendance.js`: một API đóng modal tăng requestId, ẩn/xóa body; button/backdrop dùng cùng API. Reset club vẫn remove được modal. Đóng UI không reset daily cache hoặc xóa Journal/pending intents.
- `app.js`: chỉ thêm hai UI-close calls tại reset Auth và hide protected club UI. Bỏ hai calls này khỏi normalized diff thì app.js trở lại nguyên parent; không đổi role/assignment/club-access predicate hoặc Finance/QR.
- `ui/tabs.js`: đóng sau enforceRoleTab và trước cache/legacy/dashboard return. Cleanup listener không bao phủ fallback sớm; listener owner cuối cùng byte-identical R3. Coach bị chặn sang Finance vẫn ở Điểm danh và giữ modal hợp lệ.
- History panel được render khi có ngày hoặc registered shift duy nhất. Không gán lại ngày/ca/cơ sở, sửa giờ hay đổi roster policy. trainingRegistration.js byte-identical R3.

Đã thực hiện tuần tự có RED, scope justification, regression/checkpoint. Scope Auth/tab/club chỉ để cleanup UI từ owner hiện hữu; không observer/polling hoặc auth/reader/listener/writer song song.

## Kiểm tra cuối và giới hạn

| Nhóm | Kết quả |
|---|---|
| npm run check / npm run check:all | Cả hai exit0 |
| Lifecycle mới | 10/10 PASS; app đầy đủ, Firestore SDK10/Rules Emulator; Auth-provider transport là QA port |
| Optional/missing days | 4/4 PASS |
| Shift browser / history browser | 14/14 và51/51 PASS |
| Registration / pure shift | 26 và15 case PASS |
| Exact runtime history-query Rules | 22/22 PASS |
| Browser Firebase10.7.1 | 10/10 PASS |
| Native Chromium IndexedDB/Journal/two-tabs/CAS | 28/28 PASS |
| Bootstrap completeness | 5 cold +5 warm; Node/browser/listener/store/roster/DOM đều750/750 trên fixture1500 |
| Loader/module identity | Single-flight PASS;104 graph keys không duplicate URL;4 owner probe evaluate một lần |
| Finance/QR/Debt/Inventory/report | Required npm và targeted Finance/QR suites PASS; không gọi ngân hàng thật |
| Apply/reverse master và3 phase patches | 24 check PASS, full file hashes trở về đúng checkpoint/parent |
| Supplemental mobile shell |79/80, cùng baseline; FAIL_TEST_HARNESS |

Browser layout là Chromium390×844,360×800,1280×900; chưa phải kiểm chứng thiết bị Android/iPhone/Safari thật. Không đổi expected business/security để ép PASS. Hai QA cache assertions chỉ được mở lineage R3R1 và đọc từng dependency token từ manifest đã xác thực.

## READS và các hợp đồng được bảo vệ

History tương đương trước/sau: mở primary1 query, first page1, next page1, đóng0, gọi handler cũ sau đóng0, reopen1. Tất cả getDoc/onSnapshot mới và writes của chuỗi này bằng0. Đây là SDK RPC fixture counters, không phải hóa đơn production. Static call sites giữ getDoc24/getDocs58/onSnapshot35; history listener mới0. Đóng modal không hủy cache ngày để tránh thêm đọc khi trở lại tab.

Rules SHA giữ `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`; indexes `72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2`. HISTORY_AUTHORITY giữ `attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`. JournalV4, CAS/version và legacy-collision diagnostics giữ nguyên. Coach Finance/delete/cross-club/cross-branch/raw-legacy DENY được kiểm tra với Rules hiện tại.

Quarter summary vẫn3 tháng; authorized history vẫn profileId+branch+historyAuthority, documentId ASC, limit40, scoped cursor. Không auto-load full-history page, tự attest/migrate legacy hoặc rewrite historical branch khi profile chuyển cơ sở. UI tiếp tục gọi là lịch sử đã xác minh, không hứa lifetime gồm raw legacy.

Root/public129/129; chỉ3 runtime owner có semantic diff: app.js, ui/tabs.js, modules/attendance.js. Ngoài đó chỉ import/cache metadata. Global CSS, training helper, Finance/QR/assignment/CAS/Journal logic giữ nguyên. Master có38 file source/tool thay đổi, được ghi SHA trong CHANGED_FILES.

## Gate

- `SOURCE_IDENTITY`: `PASS`.
- `LEGACY_GLOBAL_SHIFT_COMPATIBILITY`: `PASS`.
- `STRICT_NEW_SHIFT_AUTHORITY`: `PASS`.
- `COACH_BRANCH_ISOLATION`: `PASS`.
- `ATTENDANCE_ROSTER`: `PASS`.
- `REGISTERED_SHIFT_TIME`: `PASS`.
- `OPTIONAL_DAYS_SHIFT_DISPLAY`: `PASS`.
- `MODAL_AUTH_TAB_CLEANUP`: `PASS`.
- `MODAL_CLUB_BLOCK_CLEANUP`: `PASS`.
- `MEMBER_HISTORY_SCROLL_LIFECYCLE`: `PASS`.
- `MEMBER_HISTORY_DISCOVERABILITY`: `PASS`.
- `AUTHORIZED_CURRENT_HISTORY`: `PASS`.
- `ATTENDANCE_CAS`: `PASS`.
- `JOURNAL_V4`: `PASS`.
- `FINANCE_SECURITY`: `PASS`.
- `REQUIRED_NPM_REGRESSION`: `PASS`.
- `READS`: `PASS`.
- `LISTENERS`: `PASS`.
- `RULES`: `PASS`.
- `INDEXES`: `PASS`.
- `ROOT_PUBLIC`: `PASS`.
- `PATCH_ROLLBACK_IDENTITY`: `PASS`.
- `SUPPLEMENTAL_MOBILE_SHELL`: `FAIL_TEST_HARNESS`.
- `FULL_REGRESSION`: `FAIL_TEST_HARNESS`.
- `PHYSICAL_MOBILE`: `ENV_BLOCKED`.
- `CLOUD_INDEX_LIVE_DATA_BILLED_READS`: `ENV_BLOCKED`.

FULL_REGRESSION giữ FAIL_TEST_HARNESS để không che supplemental mobile-shell debt79/80. Assertion24 cấm tất cả !important; CSS hiện hữu byte-identical và test không bị nới. Required npm/functional suites vẫn PASS. Đây là **PRE_EXISTING_QA_DEBT** được giữ ngoài phạm vi R3R1.

Actual profile/shift dataset, legacy-attestation completeness, Cloud indexes, billed/live READS/cost approval, thiết bị thật và V11/release-owner acceptance vẫn chưa đủ. Không tuyên bố production candidate.

## 15 trả lời kế thừa R3

1. Ca biến mất do strict read A15/R2 loại historical blank-branch shifts mà A14 cho dùng chung; R3 đã sửa đúng, R3R1 giữ nguyên.
2. Blank branch của ca đã lưu là historical global contract, không phải quyền tạo ca mới global.
3. NO: ca mới branch trống vẫn bị chặn.
4. NO: không migration/auto-fix database.
5. Có trên fixture: Admin/Coach CS1/CS2 chọn được ca cũ.
6. NO: global shift không cấp quyền profile cơ sở khác.
7. Có: Ca Chiều (17:15–18:45), kể cả valid blank/null/missing days. Không fabricate dữ liệu giờ production chưa được cung cấp.
8. Lỗi gốc là containment/discoverability/fast-response scroll; review bổ sung thấy thiếu cleanup khi Auth reset, tab leave, club lock.
9. Fresh/reopen/member/month switch về top trong51 browser cases; không thay cho chứng nhận thiết bị thật.
10. NO: không cần scroll tới cuối tìm initial history CTA.
11. NO: không auto-load Full History page.
12. NO: query/pagination/historyAuthority không đổi.
13. Không thêm reader/listener; history RPC trước/sau bằng nhau, live billing chưa xác minh.
14. Finance/QR/Rules/indexes/loader không đổi semantic; app.js chỉ thêm UI cleanup, không đổi Auth policy.
15. Còn QA debt, physical/live-data/Cloud/cost/V11/release-owner blockers; kết luận duy nhất RELEASE_BLOCKED.

FULL_SOURCE là toàn bộ project. Tài liệu R3/A15 kế thừa giữ nguyên như lịch sử; README R3R1 chỉ rõ tài liệu hiện hành. Test-generated reports mới nằm trong RAW_LOGS, không ghi đè evidence cũ trong source. Không đóng gói browser screenshots.
