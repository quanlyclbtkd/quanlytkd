# PHASE 4K-6V5U5 — Canonical Security Truth + Credential Purge + Auth Context Single Writer + Legacy Global Freeze

**Ngày thực hiện:** 2026-08-11  
**Nguồn đầu vào:** Phase 4K-6V5U4 SuperAdmin Auth Principal Alignment  
**Phạm vi:** security/auth hardening có kiểm soát; không đại refactor `app.js`, không thay nghiệp vụ tài chính, không tạo listener/Cloud Function/migration mới.

---

## A. Baseline trước sửa

Baseline được chạy trên bản V5U4 **trước bất kỳ thay đổi V5U5 nào**. Toàn bộ baseline tối thiểu đều PASS:

| Command | Kết quả |
|---|---:|
| `npm run check:superadmin-auth-principal-alignment` | PASS 17/17 |
| `npm run check:global-ownership-adoption-cleanup` | PASS 105 assertions |
| `npm run check:legacy-app-reduction-readiness` | PASS 26 checks |
| `npm run check:production-stability-gate` | PASS 22/22 |
| `npm run check:security-coach-branch-boundary` | PASS 35/35 |
| `npm run check:student-name-search-priority` | PASS 43/43 |
| `npm run check:syntax` | PASS — 244 items |

Baseline legacy metrics từ source thật:

- `app.js`: **663,426 bytes**
- `app.js`: **10,739 lines**
- `window.X =` assignments: **538**
- duplicate globals `app.js ↔ js/**/*.js`: **159**

Baseline đã được đóng băng trong `tools/v5u5-legacy-global-baseline.json` cùng SHA-256 của `globalOwnershipRegistry.js` và `legacyAppAudit.js` để ngăn phase làm tăng nợ global hoặc âm thầm sửa owner registry.

---

## B. Root causes

### B1. Password có hai nguồn sự thật

Firebase Authentication đã quản lý credential, nhưng legacy code vẫn sao chép password plaintext vào `clubs/{clubId}.adminPassword`, cập nhật lại khi Admin đổi password và hiển thị password trên SuperAdmin. Điều này tạo **credential authority song song** và biến Firestore thành nơi lưu secret không cần thiết.

### B2. Auth runtime có nhiều writer

Các nhánh login từng tự ghi `currentClubId`, `window.userRole`, `window.coachBranch`, `window.__store.*`; warm cache có thể mount tenant runtime trước khi `users/{uid}` được Firestore xác minh. Vì vậy cache có khả năng trở thành authority tạm thời, dù sau đó có background verification.

### B3. Legacy global debt dễ tăng

Hệ thống còn nhiều compatibility globals. Xóa hàng loạt trong phase này có rủi ro rất cao, nhưng nếu không có gate thì các phase mới có thể tiếp tục thêm writer/global mới. V5U5 chọn **freeze debt** thay vì đại refactor.

### B4. SuperAdmin V5U4 phải được bảo toàn

ROOT email chỉ là bootstrap identity. Canonical authority vẫn là `custom claim`, `users/{uid}.role == super_admin`, hoặc `super_admins/{uid}`. V5U5 không đưa email-based authorization trở lại.

---

## C. Files changed

### Runtime / Rules

- `app.js`
- `firestore.rules`
- `index.html`
- `js/firebase/config.js`
- `js/main.js`
- `js/modules/superadmin.js`
- `package.json`

### New V5U5 regression/tooling

- `tools/check-admin-credential-single-source.mjs`
- `tools/check-auth-context-single-writer.mjs`
- `tools/check-legacy-global-freeze.mjs`
- `tools/v5u5-legacy-global-baseline.json`

### Existing regression gates updated only for V5U5 compatibility / stricter canonical architecture

- `tools/check-superadmin-auth-principal-alignment.mjs`
- `tools/check-security-coach-branch-boundary.mjs`
- `tools/check-coach-attendance-only-read-boundary.mjs`
- `tools/check-coach-branch-runtime-repair.mjs`
- `tools/check-global-ownership-adoption-cleanup.mjs`
- `tools/check-diagnostics-tooling-isolation.mjs`
- `tools/check-report-export-lazy-isolation.mjs`
- `tools/check-attendance-canonical-ownership.mjs`
- `tools/check-v5s-quit-context-render-loop-guard.mjs`
- `tools/check-v5t-canonical-command-boundary-write-freeze.mjs`
- `tools/check-v5u1-student-status-command-cutover.mjs`
- `tools/check-v5u2-tuition-command-cutover.mjs`
- `tools/check-v5u2e-attendance-excel-sdk-fix.mjs`
- `tools/firestore-rules-6v4b.test.mjs`

Các gate cũ chỉ được mở rộng để nhận V5U5 cache/build marker hoặc kiến trúc auth mới an toàn hơn; business assertions cũ vẫn được giữ.

---

## D. Password flow — BEFORE → AFTER

### Create New Club

**BEFORE**

`UI password → createUserWithEmailAndPassword → clubs/{clubId}.adminPassword`

**AFTER**

`UI password → createUserWithEmailAndPassword → hết vòng đời credential trong UI`

- Không ghi vào `clubs`.
- Không ghi vào `users`.
- Không local/session storage.
- Không console log.
- Success message không echo password.

### Force Replace Admin

**BEFORE**

`newPass → Firebase Auth + clubs/{clubId}.adminPassword + success/confirm hiển thị lại password`

**AFTER**

`newPass → Firebase Auth only`

- `users/{newUid}` vẫn được tạo theo flow hiện hữu.
- `clubs/{clubId}.adminEmail` vẫn cập nhật.
- Không ghi `adminPassword`.
- Confirm/success không hiển thị password thực.

### Admin Change Password

**BEFORE**

`updatePassword() → updateDoc(clubs/{clubId}, adminPassword/passwordChangedAt)`

**AFTER**

`reauthenticate → updatePassword() → Firebase Authentication only`

Không còn thông báo “đã đổi nhưng chưa đồng bộ SuperAdmin”, vì SuperAdmin không còn là password authority.

### SuperAdmin UI

Đã loại bỏ:

- `_safePass`
- `data-pw`
- masked password `••••••`
- eye reveal button
- đọc `data.adminPassword` trong renderer

Giữ `🔑 Đổi Mật Khẩu`, nhưng recovery dùng `sendPasswordResetEmail()` để Admin tự đặt lại password.

---

## E. Auth context flow — BEFORE → AFTER

### BEFORE

`Firebase Auth → cache role/club → ghi globals → initSaaSDatabase → background GET users/{uid} → có thể rebind/reload`

Có nhiều writer vào `currentClubId`, `window.userRole`, `window.coachBranch`, `window.__store.*`.

### AFTER

`Firebase Auth → [cache chỉ hint] → một GET users/{uid} → normalize/verify role + club → CoachBranchRuntimeRepair nếu coach → _commitVerifiedAuthContext() → compatibility mirrors → cache save → initSaaSDatabase()`

`_commitVerifiedAuthContext()` là canonical normal authenticated writer cho:

- `currentClubId`
- `window.currentClubId`
- `window.userRole`
- `window.coachBranch`
- `window.__store.clubId`
- `window.__store.currentClubId`
- `window.__store.userRole`
- `window.__store.coachBranch`
- `window.__store.currentUser`
- `RoleReadBoundary.setContext(...)`

`initSaaSDatabase()` không còn là auth-context writer và sẽ **fail closed** nếu context chưa verified/matching UID/role/club.

Logout dùng `_resetVerifiedAuthContext()` để reset canonical state và compatibility mirrors trước phiên kế tiếp.

---

## F. Cache flow — BEFORE → AFTER

### BEFORE

Warm cache có thể gán role/clubId và mount protected tenant runtime rồi mới verify Firestore nền.

### AFTER

`_getAuthCache()` chỉ cung cấp hint/diagnostics. Cache **không được phép**:

- cấp quyền;
- set canonical role/club/branch;
- mount listener;
- gọi `initSaaSDatabase()` trước verification.

`_readUserAuthorizationProfileOnce()` dùng single-flight promise. Background GET cũ đã được thay bằng chính verification read này, không giữ hai reads song song.

Các simulation mới PASS:

1. cache đúng: verify 1 lần rồi commit/init đúng 1 lần;
2. cache club A, Firestore club B: không mount A, commit B;
3. cache admin, Firestore viewer: không có privileged admin runtime từ cache;
4. coach: cache không bypass branch verification;
5. disabled/locked/suspended user: protected runtime không mount;
6. SuperAdmin: principal ready trước commit;
7. logout: canonical state + mirrors reset.

---

## G. SuperAdmin principal verification

V5U4 canonical design được giữ nguyên:

`ROOT email bootstrap identity → own super_admins/{uid} → isSuperAdmin() → SuperAdmin data access`

ROOT email **không** được dùng trực tiếp làm authorization source cho `clubs`, `users`, `login_history`, `profiles`, `transactions`, `inventory`, `attendance`, `settings`.

SuperAdmin flow V5U5:

`Firebase Auth → _ensureSuperAdminPrincipal(user) → principal ready → _commitVerifiedAuthContext(role=super_admin) → SuperAdmin runtime`

`check:superadmin-auth-principal-alignment`: **PASS 17/17**.

---

## H. Firestore Rules changes

`clubs/{clubId}` có transition guard mới:

- **Create**: SuperAdmin chỉ được tạo club khi `adminPassword` absent/empty.
- **Legacy update**: old non-empty `adminPassword` được phép giữ nguyên trong update metadata khác, tránh làm CLB cũ bị khóa trước cleanup.
- **Admin CLB**: không thể đổi/remove legacy secret field.
- **Canonical SuperAdmin**: có thể remove legacy secret.
- **Không writer nào** được biến old secret thành một non-empty secret mới.

Transition mong muốn:

`OLD NONEMPTY → UNCHANGED: allowed temporarily`

`OLD NONEMPTY → REMOVED/EMPTY: canonical SuperAdmin only`

`OLD/NONE → NEW NONEMPTY: denied`

Rules test source đã được bổ sung các case tương ứng cùng SuperAdmin/Coach/login_history isolation.

---

## I. Firestore reads impact

### Non-SuperAdmin login

- **Before:** 1 background `GET users/{uid}` để verify cache/context.
- **After:** 1 foreground pre-runtime `GET users/{uid}` qua single-flight.
- **Delta:** **0 read/login** về số lượng; chỉ đổi thời điểm verification để security đúng trước runtime mount.

### SuperAdmin

Giữ principal check V5U4; V5U5 không tạo principal query/list mới.

### Legacy password maintenance

- Không `getDocs(clubs)` lần hai.
- Dùng `window._saClubData.clubDataList` đã load.
- Chỉ tạo writes khi SuperAdmin chủ động confirm cleanup.
- Không auto-run.

### Các tab

Không listener/query mới cho Học phí, Báo nợ, Kho đồ, Điểm danh, Thi đai, Search, Quit. Không polling, không `setInterval`, không recursive recovery mới.

---

## J. Legacy global metrics

| Metric | BEFORE V5U5 | AFTER V5U5 | Kết quả |
|---|---:|---:|---|
| `app.js` bytes | 663,426 | 662,494 | giảm 932 bytes |
| `app.js` lines | 10,739 | 10,745 | +6 lines do canonical auth kernel |
| `window.X =` assignments | 538 | 534 | giảm 4 |
| duplicate globals app ↔ modules | 159 | 159 | không tăng |

`check:legacy-global-freeze`: **PASS 20/20**.

`GlobalOwnershipRegistry` và `legacyAppAudit` có hash bằng baseline — không bị rewrite trong V5U5.

---

## K. Regression results

### New V5U5 gates

- `check:admin-credential-single-source`: **PASS 33/33**
- `check:auth-context-single-writer`: **PASS 40/40**
- `check:legacy-global-freeze`: **PASS 20/20**

### Targeted critical regression

Tất cả command được yêu cầu đã chạy và PASS, gồm:

- SuperAdmin V5U4 principal/hotfix/audit/monthstats
- Coach attendance/branch security/runtime repair
- Global ownership / legacy app readiness / listener ownership
- V5T command boundary + behavior
- V5U1 student status boundary + behavior
- V5U2 tuition boundary + behavior
- V5U2E attendance Excel SDK
- V5U3 student-name search + SearchRuntime/index/cross-tab
- Debt authoritative tuition / tuition source of truth
- Inventory ledger reconciliation
- Quit authoritative completeness / mobile parity
- Production/runtime/performance stability
- Syntax

Một targeted aggregate dài bị môi trường tool timeout sau **32/33** command; command cuối `check:syntax` được chạy riêng và **PASS 244 items**. Không ghi aggregate timeout là PASS giả.

### `npm run check`

Aggregate được khởi chạy. Do output/runtime của harness, command aggregate timeout sau khi các gate đầu đã PASS. Các constituent còn lại sau điểm timeout được chạy riêng theo đúng thứ tự; **tất cả 51 constituent của `check` đã được xác nhận PASS**. Trong quá trình này một gate legacy V5S ban đầu báo source/public drift trước build; gate được cập nhật để chấp nhận **V5U5 pre-build root drift có chủ đích**, và sau `build:public` nó yêu cầu/đạt exact mirror.

### `npm run check:all:critical`

Aggregate được khởi chạy và timeout tại harness sau khi command thứ 60 đã hoàn tất PASS. Các command 61–100 được chạy riêng; **100/100 constituent được xác nhận PASS**. Timeout được ghi nhận, không được báo thành aggregate PASS.

### `npm run check:all`

Vì còn thời gian, aggregate cũng được khởi chạy. Harness timeout sớm; các constituent còn lại được chia nhóm và chạy riêng. **94/94 constituent được xác nhận PASS**.

### Post-build validation

Sau `npm run build:public`, tối thiểu các gate sau đã PASS:

- `check:admin-credential-single-source` — 33/33
- `check:auth-context-single-writer` — 40/40
- `check:legacy-global-freeze` — 20/20
- `check:superadmin-auth-principal-alignment` — 17/17
- `check:security-coach-branch-boundary` — 35/35
- `check:global-ownership-adoption-cleanup` — 105 assertions
- `check:student-name-search-priority` — 43/43
- `check:production-stability-gate` — 22/22
- `check:syntax` — 244 items
- V5S/V5T/V5U1/V5U2 source-public/cutover gates — PASS sau final compatibility update.

---

## L. Rules Emulator status

**RULES EMULATOR = NOT EXECUTED**.

Lý do:

- môi trường làm việc không có Firebase CLI (`firebase: not found`);
- thử `npm ci --ignore-scripts` để khôi phục dependencies bị timeout và để lại partial install không sử dụng được;
- partial `node_modules` đã được xóa sạch;
- không hạ lỏng Rules để “làm test pass”.

`tools/firestore-rules-6v4b.test.mjs` đã được mở rộng đúng các V5U5 transition cases và syntax JS hợp lệ, nhưng **không được ghi là emulator PASS**.

Trước deploy production nên chạy `npm run check:rules:emulator` trong môi trường có Firebase CLI/dependencies đầy đủ.

---

## M. Full system audit — BLOCKER / HIGH / MEDIUM / LOW

### BLOCKER

**Không phát hiện BLOCKER trong scope V5U5** sau static source audit + regression suite.

### HIGH — cố ý không sửa ngoài scope

1. **Old Admin Auth principal còn tồn tại sau `forceReplaceAdmin()`.** Flow hiện tạo Auth user mới + `users/{newUid}` + đổi `adminEmail`, nhưng chưa revoke/delete/disable Firebase Auth principal cũ và cũng chưa tự vô hiệu hóa `users/{oldUid}`. Đây là account lifecycle risk và cần phase riêng có trusted admin operation.

2. **Khóa CLB chưa phải server-authoritative revocation hoàn chỉnh.** `lockClubAccount()` hiện cập nhật `clubs/{clubId}.accountStatus='locked'` và runtime UI kiểm tra field này, nhưng `isClubMember()` trong Rules dựa trên `users/{uid}.status/clubId`. Vì vậy một credential hợp lệ vẫn không bị Firestore Rules chặn chỉ vì `clubs.accountStatus=locked`. Không redesign trong V5U5 theo yêu cầu.

### MEDIUM

1. **Legacy `app.js` vẫn lớn:** 662,494 bytes / 10,745 lines / 159 duplicate globals. V5U5 đã freeze không cho debt tăng, nhưng đây vẫn là maintainability risk. Không nên đại refactor; tiếp tục cutover theo command boundary nhỏ.

2. **Coach account onboarding còn echo password vừa nhập trong success alert.** Password không được thấy là ghi Firestore trong flow này, nhưng credential exposure trong UI có thể được harden ở phase credential UX riêng. V5U5 chỉ xử lý Admin credential source theo scope.

### LOW

- Nhiều compatibility build markers/test gates phải giữ lineage cũ để regression hoạt động. Đây là test-maintenance debt, không phải runtime defect.
- `firestore.rules` header vẫn mang lịch sử phase Coach boundary trong phần mô tả đầu file; actual V5U5 rule block đã được đánh dấu tại boundary tương ứng.

---

## N. Những vấn đề phát hiện nhưng cố ý KHÔNG sửa ngoài scope

- Không xóa/revoke Auth user Admin cũ.
- Không redesign server-authoritative club lock.
- Không App Check.
- Không CSP migration.
- Không đại refactor `app.js` / `main.js` / Store.
- Không chuyển `renderApp`, `switchTab`, `listenToData` ownership.
- Không thay Tuition/Debt/Inventory/Attendance/Exam.
- Không thay Search V5U3.
- Không thay Quit authoritative source.
- Không thêm Cloud Functions.
- Không migration/background cleanup.

---

## O. Root ↔ Public synchronization result

`npm run build:public` hoàn tất thành công. Hash SHA-256 sau build:

| File | SHA-256 root/public | Sync |
|---|---|---:|
| `app.js` | `438349ac532677c85aa34176e0f7aa715760c47b2566b19c22eaeccc7df68883` | MATCH |
| `index.html` | `bd7ad7002663c90bc25f9510f6cb8217d036a26a36d8abc52c0a0a6eb27b7812` | MATCH |
| `js/main.js` | `1aea2e0f7644adf2b7882b0409b9900e5a256264f0ae4ba0fcd2533e8f3bd56f` | MATCH |
| `js/firebase/config.js` | `745a895328c557b6d2a863c8f71dfbdb0bb44b9adecf70740e94921a63d8a876` | MATCH |
| `js/modules/superadmin.js` | `7b20ba6adbb47cb18aa31b43c5455ee75f8c6e7fa4e49619a94bbd67c48fddc6` | MATCH |

`firestore.rules` là deploy artifact riêng, không có mirror trong `public/`.

---

## Final source audit coverage

Các domain sau được kiểm tra bằng source diff + regression gates hiện hữu:

- **AUTH:** SuperAdmin/Admin/Viewer/Coach, logout/login, warm/stale cache, disabled user.
- **SUPERADMIN:** club list, login history, create club, expiry, lock/unlock UI, exam toggle, club name/branch changes, replace Admin, password reset.
- **STUDENTS:** active/quit/search + student status command boundary.
- **FINANCE:** tuition/debt/payment/bundle/transaction source-of-truth.
- **INVENTORY:** ledger/read/write safety regressions.
- **ATTENDANCE:** Admin/Coach/branch + monthly/canonical ownership.
- **EXAM:** registration/payment/upgrade finance separation.
- **REPORT/EXCEL:** export isolation and V5U2E Excel SDK regression.
- **MOBILE/DESKTOP:** mobile filter, mobile quit parity, SuperAdmin mobile gate.
- **LISTENERS:** listener ownership boundary; V5U5 adds none.
- **READ ATTRIBUTION:** canonical transaction/read cost gates; V5U5 auth read count preserved.
- **GLOBAL OWNERSHIP:** global adoption + legacy freeze; no collision/growth.
- **ROOT↔PUBLIC:** exact hashes after build.

No runtime business module outside the required auth/security/SuperAdmin surfaces was modified. Financial, inventory, attendance, exam, search and quit business source files remain untouched by V5U5 runtime implementation.

---

## Deployment notes

Recommended production order:

1. Backup current production source / Firestore as normally operated.
2. Run Rules Emulator in a machine with Firebase CLI if available.
3. Deploy/publish **`firestore.rules` V5U5 first**.
4. Deploy final `public/`.
5. Logout all test sessions and login again.
6. Verify SuperAdmin principal + club list + login history.
7. Create one test club and verify the club document has **no `adminPassword`**.
8. Test Admin change password and password-reset email.
9. In SuperAdmin, review legacy credential warning; only then run explicit cleanup if desired.
10. Verify Admin/Coach branch behavior and console before wider rollout.

---

## Final package verification

ZIP candidate đã được tạo, giải nén sạch sang `/mnt/data/v5u5_final_verify` và chạy kiểm tra **trên chính nội dung vừa giải nén**:

- `npm run check:syntax` — **PASS, 244 items**
- `npm run check:admin-credential-single-source` — **PASS 33/33**
- `npm run check:auth-context-single-writer` — **PASS 40/40**
- `npm run check:legacy-global-freeze` — **PASS 20/20**
- `npm run check:superadmin-auth-principal-alignment` — **PASS 17/17**
- `npm run check:production-stability-gate` — **PASS 22/22**

Package không chứa `node_modules`, `.git`, `_v5u5_logs`, cache/temp, service-account key, private key hay `.env`.

Sau khi cập nhật chính báo cáo này, ZIP final được tạo lại; runtime/source code không thay đổi. Final ZIP được giải nén một lần nữa và bộ minimum gate được chạy lại trước khi giao.
