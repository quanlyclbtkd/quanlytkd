# A9R15 — Kiểm toán đăng ký tập và lịch sử HLV

**Kết luận phát hành: `RELEASE_BLOCKED`.** Đây là source đã sửa để kiểm toán, không phải candidate được phép triển khai. Không deploy, không truy cập/chỉnh dữ liệu production, không chạy migration. Các PASS bên dưới giới hạn trong phạm vi bằng chứng được ghi rõ.

## 1. Baseline đã xác minh trước patch

Tệp gốc: `A9R14_FULL_SOURCE(1).zip`.

| Thuộc tính | A9R14 |
|---|---|
| ZIP SHA-256 | `a81478cb6fb50eeed23ece4d0e106c949d73397010d52ead8adff6841bbc5c8a` |
| Runtime SHA-256 | `91dbd8a9866552c2317b7ee676ff019c285e2338febebe59c7d9376b4f956fe4` |
| app.js SHA-256 | `d0fd29acc5e298e461763daea31d89228052fe08b6f2ba323aa0ae9bf2f77463` |
| Rules SHA-256 | `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3` |
| Indexes SHA-256 | `72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2` |
| Build | `qr-v11r6-a9r14-qa-mobile-20261025` |
| Runtime canonical / parity | 128 / 128 |
| Journal | `tst-attendance-journal-v4`; IndexedDB schema version **1** |
| Static getDoc / getDocs / onSnapshot call sites | 24 / 57 / 35 |

Authority giữ nguyên: `attendance-history-1aedda93-9437-4132-9694-35c2e6234d55`.

Baseline `npm run check` và `npm run check:all` thực sự exit 0; các raw log có trong gói evidence. Service/Rules thật chạy 22/22, gồm collision, CAS, Admin xác minh và Finance DENY. Journal lúc đầu thiếu Chromium (`ENV_BLOCKED`); sau khi cung cấp dependency, kiểm thử native/mutation chạy thành công. Không sửa runtime baseline để làm các kiểm tra này chạy.

## 2. Hai lỗi có bằng chứng và cách sửa

**Đăng ký tập:** Add/Edit trước đây đưa toàn bộ `settings/shifts.list` vào selector, không đối chiếu `profile.branch`. `_renderShiftSelector()` của Điểm danh còn ghi lại các dropdown đăng ký, có thể xóa kết quả lọc của editor. `StudentService` không có validation quan hệ ca/cơ sở trước writer. Vì vậy một profile CS1 có thể được lưu cùng ID ca CS2.

**Lịch sử:** `showAttMemberHistory()` chỉ gọi reader với ba `quarterMonths`. Đọc được modal đó chưa phải duyệt được toàn bộ lịch sử được phép. A9R15 giữ summary tháng/quý và bổ sung duyệt nhiều năm trong chính modal/reader hiện hữu.

## 3. Contract đăng ký thực tế

Không tạo collection mới. Profile ở `clubs/{clubId}/profiles/{profileId}`; ca ở document `clubs/{clubId}/settings/shifts`, field `list`. Các field đăng ký là `branch`, `trainingShiftId`, `trainingDays`; identity ca là **`shift.id`**. ID profile truyền nguyên từ document hiện hữu; không resolve bằng display name hay vị trí danh sách. Những document ID cũ có chứa tên vẫn được giữ nguyên; không rename/migrate.

Schema ca hiện có `id`, `name`, `timeStart`, `timeEnd`, `branch`. Không tìm thấy field xác nhận shared/global. Ca thiếu/null/blank branch là `SHIFT_AUTHORITY_UNRESOLVED`; không mặc nhiên gán CS1 hoặc coi là ca chung. Alias cơ sở hợp lệ tiếp tục dùng `BranchIdentity` hiện hữu.

`trainingDays` giữ nguyên array integer JavaScript **0 = Chủ nhật, 1..6 = Thứ 2..7**. Không đổi timezone hay kiểu dữ liệu. Null/missing/array trống vẫn là lịch ngày không giới hạn theo behavior A9R14. Ca blank/null vẫn được phép và có kết quả `NO_SHIFT_ASSIGNED`. Không buộc mọi profile phải có ca. Không áp đặt ngày riêng của ca vì schema không có contract đó.

Các thay đổi runtime:

- `js/core/trainingRegistration.js`: helper thuần để resolve ID, phân loại, validate, audit; không SDK, không reader/writer/listener. Ca ID trùng cũng bị coi là không resolve được.
- `js/modules/students.js`: cùng form Add/Edit, thứ tự Cơ sở → Ca → Ngày. Dropdown chỉ có ca của cơ sở tương ứng; đổi cơ sở giữ trạng thái cần chọn lại khi ca cũ không hợp lệ. Không tự chọn ca đầu tiên và không auto-save. Chọn “Không gán ca” là thao tác rõ ràng của Admin.
- Form tải lại cấu hình ca qua **owner single-flight hiện hữu** khi mở và trước Save hợp lệ. Remote delete/branch edit quan sát được ở pre-save sẽ chặn writer. Nếu form/ID thay đổi trong lúc chờ, Save bị hủy và yêu cầu kiểm tra lại. Form đã biết sai chặn trước khi đọc lại.
- `js/services/students.service.js`: validation ngay trước `prepareProfileMutation`, `createProfile`, `updateProfile`, `patchProfile`. Patch đăng ký phải có profile gốc trong canonical RAM; không được suy đoán “chưa gán ca” từ một profile chưa tải. Các patch không chạm đăng ký, như contact/tuition-only, không bị thêm policy mới.
- Mismatch có code `TRAINING_SHIFT_BRANCH_MISMATCH` và thông báo nêu cả hai cơ sở. Missing/unknown authority/invalid days giữ phân loại rõ. Ngày legacy sai không bị checkbox trống âm thầm ghi đè; Admin phải xác nhận lại ngày hoặc chủ động chọn không đăng ký ngày.
- `_renderShiftSelector()` chỉ thông báo cấu hình đổi cho editor; không còn sở hữu dropdown Add/Edit. Tên ca được render bằng `Option`/escaped text.
- Ca tạo mới dùng **writer settings hiện hữu**, yêu cầu Admin chọn cơ sở rõ ràng. Không thêm rename/cascade/migration ca. Ca cũ thiếu authority được gắn cảnh báo khi quản lý ca; nếu không có ca hợp lệ, Điểm danh bị chặn với hướng dẫn Admin kiểm tra.

Roster mặc định giữ active/branch/belt/ngày/ca/tháng nghỉ. Đăng ký lỗi không vào roster để rồi ghi sai ca. Profile không gán ca vẫn có behavior tương thích trong các ca hợp lệ; ngày trống vẫn không giới hạn ngày. Checkbox “hiển thị tất cả” cho học bù vẫn là ngoại lệ lọc ngày/ca đã có trước; nó không cho phép một registration sai authority đi qua.

Audit read-only được mở trong form Edit Admin, hoặc `auditTrainingRegistrations()`. Nó dùng profile RAM và canonical shift owner đã xác minh, không scan database, không ghi sửa. Output dùng `P00001…`, không tên/ID thật. Luôn ghi `complete:false` và `loaded-canonical-RAM-only` vì không có chứng minh đây là toàn bộ profile production. Các lớp: OK, NO_SHIFT_ASSIGNED, SHIFT_NOT_FOUND, SHIFT_BRANCH_MISMATCH, SHIFT_AUTHORITY_UNRESOLVED, TRAINING_DAYS_INVALID.

**Giới hạn:** đây không phải transaction nguyên tử giữa settings/shifts và profile trên server. Một thay đổi settings xảy ra sau pre-save check vẫn có thể tạo orphan; không nới Rules hay thêm một writer để che vấn đề này. Audit/reload phát hiện và yêu cầu Admin sửa bằng form. Không có snapshot production để kết luận mọi profile hiện hữu đã khớp.

## 4. Authorized Coach Full History

Không tạo `CoachHistoryService2` hoặc listener. Mở modal vẫn tải summary ba tháng như trước. Bấm “Mở lịch sử đã xác minh” mới gọi **`AttendanceService.loadMemberHistory(..., {page:true})`**. Mỗi lần bấm “Tải thêm” có đúng một query:

```text
clubs/{clubId}/attendance
where profileId == immutableProfileId
where historyAuthority == currentAuthority
where branch == selectedAuthorizedBranch
orderBy documentId ASC
limit <= 40
startAfter scopedCursor.afterId   // từ trang tiếp theo
```

Không có mốc khởi đầu cố định 12 tháng; cursor có thể đi qua nhiều năm. Document ID canonical chứa ngày/ca nên ordering cùng profile ổn định, kể cả nhiều ca cùng ngày. Không order chỉ theo ngày rồi làm mất bản ghi trùng ngày. Status 0 vẫn là tombstone theo contract cũ: không hiển thị như một buổi đã ghi nhận, nhưng **raw snapshot** quyết định cursor, nên trang toàn tombstone vẫn tiến được. Trang đủ 40 cần bấm thêm một lần nếu thực tế đã hết đúng boundary; không có query đếm hoặc prefetch.

Scope cursor chứa club, profile, branch, authority, page size và context uid/generation/branchGeneration/assignmentVersion/allowedBranches/activeBranch. Cursor khác phạm vi bị từ chối. UI còn capture request ID và context; response đến sau đổi cơ sở, revoke đã được runtime quan sát, reset, đổi account hoặc generation sẽ không render. Owner reset hiện hữu đóng modal khi đổi cơ sở/thu hồi quyền. Server Rules vẫn kiểm tra assignment thực, kể cả client mirror giả. Không thêm một listener để phát hiện revoke tức thời ngoài cơ chế xác minh hiện hữu.

Không cache history qua đóng modal, qua tab, reload hoặc phiên khác. Chỉ giữ các hàng đã tải trong closure của modal. Double-click dùng cùng latch, không phát query thứ hai. Click tên trên thẻ history truyền encoded immutable profile ID, không dùng index làm identity. Không có Finance read trong reader mới.

HLV CS1 chỉ duyệt phần CS1; HLV CS1+CS2 đổi cơ sở bằng selector hiện hữu và mở phần tương ứng. Không tạo merge toàn CLB. Profile hiện tại chuyển sang CS2 không làm bản ghi CS1 quá khứ đổi branch. Runtime/Rules test kiểm tra trường hợp này trực tiếp.

Rules và indexes giữ **byte-identical** A9R14. Exact query chạy với Node SDK và browser Firebase 10.7.1 không trả lỗi index trong Emulator; không tự thêm index. Emulator không chứng minh indexes của production đã READY, nên không dùng kết quả đó để kết luận phát hành production.

## 5. Legacy và va chạm physical document

Giữ authority, physical ID, CAS, `intent-version-read`, `docId`, `branch`, `role`, `legacyCollisionPossible`. Permission-denied ở transaction.get không biến thành absent/ACK; không retry writer để tránh lỗi.

A9R14 đã có Admin `inspectIntent`/`attestHistory`, xác minh từng document với confirmation và CAS. A9R15 không thay hay tự gọi flow đó. Không bổ sung provenance writer, mass promotion hoặc migration. Flow cũ không phải một provenance ledger độc lập có coverage/actor evidence cho toàn bộ production; chưa có dữ liệu để kiểm toán coverage thực.

Raw legacy vẫn `LEGACY_HISTORY_NOT_COACH_VISIBLE`. UI gọi là “Lịch sử Điểm danh đã xác minh”, không tuyên bố lifetime. Kết quả đúng phạm vi test là `AUTHORIZED_CURRENT_HISTORY_COMPLETE` và `LEGACY_HISTORY_REQUIRES_ADMIN_ATTESTATION`; **không phải `ALL_LIFETIME_HISTORY_COMPLETE`**.

## 6. READS

`A9R15_READS_COMPARISON.json` chứa before/after và delta của chín thao tác yêu cầu. Đây là đo client calls của Attendance owner bằng transport có instrumentation; exact query được kiểm tra độc lập với Rules/SDK thật. Không giả làm telemetry tính tiền production hay số đọc của toàn bootstrap/auth/profile listeners.

| Thao tác thuộc Attendance owner | getDoc tăng so A9R14 | getDocs tăng | onSnapshot tăng |
|---|---:|---:|---:|
| Mở tab, chọn CS1, mở summary | 0 | 0 | 0 |
| First verified page | 0 | 1 | 0 |
| Next verified page | 0 | 1 | 0 |
| Đóng/mở lại summary | 0 | 0 | 0 |
| CS1→CS2, mở cùng profile, reload/relogin | 0 | 0 | 0 |

Mỗi trang tối đa 40 result documents; trang rỗng vẫn có minimum query charge. Không query lịch sử của mọi võ sinh. Form registration có thêm một fresh point read cấu hình khi mở và một khi Save hợp lệ, qua loader sẵn có/coalescing; không có write phụ. SDK retry, dependent Rules reads, index scans, reconnect và billing thực chưa đo. Owner cost approval cũ vẫn pending; không tự tạo approval.

## 7. Kiểm thử và bốn closure A9R14

Các bộ kiểm thử mới:

- Registration: **25/25**.
- Browser Add/Edit/roster/history/session: **27/27**; có remote delete trước Save, sửa dữ liệu legacy bằng lựa chọn rõ ràng, hai tab và stale response.
- Exact history query + Rules: **22/22**.
- Browser SDK Firebase **10.7.1: 10/10**, gồm nhiều page, offline cache không được coi là server-verified, reconnect, CAS và collision.
- Native IndexedDB/attendance writer trong cấu hình ca có branch xác minh: **28/28**.
- Existing actual service/CAS/collision/Admin mechanism: **22/22**.
- Journal native/mutation: **12 controls**, cùng migration/quarantine contract.
- Source negative controls **10/10**, architecture **9/9**; A9R14 layout/search browser **7/7**.

Bốn gate A9R14 còn PASS: ownership 141 assertions; security-coach-branch-boundary 35; coach repair source suites 77; Excel/SDK 22. `app.js` giữ nguyên byte, 698.720 bytes / 11.211 mục dòng theo cách đếm ceiling. Không tăng ceiling.

**Không ghi PASS cho `npm run check`/`check:all`.** Hai lệnh hiện exit 1 ở precheck cũ. Đã chạy độc lập toàn bộ **159 gate leaf** của default/full/critical: **154 PASS, 2 FAIL_TEST_HARNESS, 3 RELEASE_BLOCKED, 0 FAIL_RUNTIME trong các gate được phân loại**. Raw FAIL được giữ nguyên.

| Gate chưa xanh | Phân loại | Bằng chứng/nguyên nhân |
|---|---|---|
| attendance-explicit-shift-authority | FAIL_TEST_HARNESS | Fake DOM thiếu Option/replaceChildren/add; fixture còn coi shift thiếu branch là ca hợp lệ/global. Runtime browser thật với ca có authority và case unresolved được test riêng. |
| attendance-daily-single-refresh-authority | FAIL_TEST_HARNESS | Fake DOM/fixture của mô phỏng cũ không đáp ứng contract mới, không khởi động daily flight. |
| d1c3b7-release-security | RELEASE_BLOCKED | V11 browser cũ seed ca không có branch, timeout chờ card; thiếu exact-candidate cost approval/measurement acceptance. |
| d1c3b6-release-blockers | RELEASE_BLOCKED | Kế thừa blocker B7. |
| v10-release-risk-boundary | RELEASE_BLOCKED | Owner decision vẫn pending, thiếu acceptance production/thiết bị thật. |

Không sửa expected, mock hay assertion business của các gate này để ép PASS. Harness VM role-authority chỉ được nối thêm **helper thực** mới vào sandbox, không đổi fixture/expected; lineage/source pin cập nhật cho file thứ 129. Positive matrix A9R15 với ca branch-scoped là bộ test riêng; không biến kết quả FAIL của V11 cũ thành PASS.

## 8. Phân loại phát hành theo từng gate

| Gate | Kết quả |
|---|---|
| TRAINING_REGISTRATION_CONSISTENCY | ENV_BLOCKED — logic lưu/audit test PASS; chưa audit toàn bộ dữ liệu thực |
| COACH_AUTHORIZED_FULL_HISTORY | PASS — phạm vi current-authority local fixtures |
| LEGACY_HISTORY_PROVENANCE | ENV_BLOCKED — chưa xác minh coverage production |
| COACH_ATTENDANCE_WRITE | PASS |
| COACH_BRANCH_ISOLATION | PASS |
| JOURNAL_V4 | PASS |
| FINANCE_SECURITY | PASS |
| READS | ENV_BLOCKED — owner measurement PASS; thiếu budget thực/approval |
| MOBILE | ENV_BLOCKED — browser PASS; chưa có physical phone acceptance |
| ROOT_PUBLIC | PASS — 129/129 |

Những mắt xích chưa chứng minh được ở production được giữ **HOLD**, không được che bằng PASS cục bộ. Source hiện tại không được nâng thành TEST/STAGING/PRODUCTION CANDIDATE khi regression gate bắt buộc chưa xanh.

## 9. Tái kiểm thử an toàn

Môi trường đã dùng: Node 24.22.1, Java 17, Firestore Emulator 1.19.8, Playwright 1.62.1, Chrome Headless Shell 156.0.8078.47; browser SDK 10.7.1. Chỉ demo projects/loopback, không production.

```sh
npm ci
npx playwright install chromium
npm run check:a9r15-source
npm run check:a9r15-registration
npm run qa:a9r15-ui
npx firebase emulators:exec --project demo-a9r15-qa --only firestore "npm run test:a9r15-emulator"
npm run check
npm run check:all
```

Hai lệnh cuối có FAIL đã công bố. Không sửa decision/approval để làm xanh. Không chạy deploy. Các kiểm tra Emulator tự yêu cầu `FIRESTORE_EMULATOR_HOST=127.0.0.1:port` và dùng project demo; script browser UI chặn request ngoài máy local. SHA của archive cuối cùng nằm ở companion `A9R15_SHA256_MANIFEST.json` để tránh hash vòng tự tham chiếu.

## 10. Trả lời ba câu cuối

**1. Đăng ký đã khớp hoàn toàn chưa?** Trong canonical Add/Edit/service, quan hệ branch → shift ID → shift branch → days được chặn/kiểm tra, cả ca bị xóa và remote config đổi trước Save. Chưa thể nói toàn bộ profile production đã khớp: không có snapshot được xác minh, không mass repair, audit chỉ RAM đã tải và không có transaction settings/profile nguyên tử.

**2. HLV xem đủ lịch sử được phép chưa?** Đã chứng minh local: từng branch được cấp, nhiều năm, 40 bản ghi/page, cursor không mất boundary, current authority giữ nguyên, legacy thô bị loại, context stale bị DROP, mỗi page một getDocs và không listener. Chưa chứng minh coverage/index readiness/telemetry ở production. Lifetime bao gồm raw legacy không được tuyên bố hoàn tất.

**3. A9R15 đủ điều kiện gì?** `RELEASE_BLOCKED`. Bàn giao source/patch/evidence để kiểm toán; chưa bàn giao candidate phát hành.
