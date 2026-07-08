# Phase 4K-6V5H — Login History Permission + Large List Warning Guard

## Vấn đề người dùng báo trong console

```text
[login_history] Không thể ghi lịch sử đăng nhập: Missing or insufficient permissions.
[LargeListWarning] list="students.debtList" rowCount=573 > threshold=500 ... reason="computeAndCacheStudents"
```

## Phân tích nguyên nhân

### 1. login_history permission-denied

Ứng dụng ghi lịch sử đăng nhập vào top-level collection:

```js
addDoc(collection(db, "login_history"), ...)
```

Nhưng `firestore.rules` bản hiện tại chưa có boundary top-level `match /login_history/{docId}` tương ứng, hoặc payload chưa có `uid` để Rules xác thực người dùng chỉ tạo lịch sử của chính họ. Firestore vì vậy trả về `Missing or insufficient permissions`.

Đây là audit phụ, không được làm gián đoạn đăng nhập, nhưng Rules vẫn cần cho phép ghi an toàn.

### 2. LargeListWarning lặp ở students.debtList

Tab Báo nợ có 573 võ sinh nợ, nhưng hệ thống có phân trang/load-more và không render toàn bộ 573 dòng vào DOM trong lần đầu. Cảnh báo cũ đang lấy `_debtTotalCount` làm `rowCount`, khiến console hiểu nhầm là DOM đang render 573 dòng.

Ngoài ra, `computeAndCacheStudents()` có thể chạy vài lần trong quá trình hydrate/search/filter, nên cảnh báo bị lặp nhiều lần dù không phải lỗi runtime.

## Thay đổi đã thực hiện

### 1. Firestore Rules cho login_history

Thêm top-level boundary:

```rules
match /login_history/{docId} {
  allow create: if safeLoginHistoryCreate();
  allow get, list, update, delete: if isSuperAdmin();
}
```

`safeLoginHistoryCreate()` yêu cầu:

- người dùng đã đăng nhập;
- payload có `uid` khớp `request.auth.uid`;
- chỉ các field audit an toàn;
- role nằm trong danh sách hợp lệ;
- user đang enabled hoặc là SuperAdmin.

Coach/Admin/Viewer chỉ được tạo bản ghi audit của chính mình; chỉ SuperAdmin được đọc/xóa.

### 2. app.js ghi uid và fail-safe

Payload login history đã thêm:

```js
uid: user.uid || ''
```

Nếu production chưa deploy Rules mà vẫn bị permission-denied, app không ghi lỗi đỏ nữa, không chặn đăng nhập, và chỉ bỏ qua audit trong phiên hiện tại.

### 3. LargeListWarning dùng rendered rows, không dùng total matches

`studentsRenderer.js` đổi từ:

```js
trackLargeListRender('students.debtList', _debtTotalCount, ...)
```

sang:

```js
trackLargeListRender('students.debtList', _debtRendered, {
  reason: 'computeAndCacheStudents',
  totalRows: _debtTotalCount
})
```

Nghĩa là:

- `totalRows = 573` vẫn được lưu metrics;
- cảnh báo chỉ bật nếu số dòng thực sự render vượt 500;
- nếu đang render 50/150 dòng + nút tải thêm thì không còn spam cảnh báo.

### 4. Coalesce cảnh báo lặp

`renderInvalidation.js` thêm:

- `totalRowsPerList`
- `largeListWarningSuppressed`
- `lastWarnSignaturePerList`
- `lastWarnAtPerList`

Nếu một cảnh báo giống hệt lặp lại trong 2 phút, hệ thống chỉ ghi metrics suppressed, không spam console.

## Files chính đã sửa

- `app.js`
- `firestore.rules`
- `js/ui/render/renderInvalidation.js`
- `js/ui/render/computation/studentsRenderer.js`
- `package.json`
- `tools/check-v5h-login-history-large-list-guard.mjs`
- `public/` mirrors

## Kiểm tra đã chạy

- `npm run check` — PASS toàn bộ pipeline hiện tại
- `npm run check:syntax` — PASS
- `npm run check:v5h-login-history-large-list-guard` — PASS 12/12
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:render-warning-coalescing` — PASS 14/14
- `npm run check:attendance-shift-filter` — PASS 10/10
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:v5g-given-name-priority-search-unification` — PASS 15/15
- `npm run check:v5f-debt-given-name-final-token-search` — PASS 16/16
- `npm run check:v5e-audit-gate-superadmin-hardening` — PASS 10/10
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:tuition-debt-source-of-truth` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `npm run check:superadmin-monthstats` — PASS 8/8
- `npm run check:student-search-index` — PASS
- `npm run check:search-runtime-v2` — PASS
- `npm run check:search-latency-optimization` — PASS
- `npm run check:superadmin-hotfix` — PASS 27/27
- `npm run check:db-ready-guards` — PASS 14/14

## Ghi chú deploy

Bản này cần deploy cả Hosting/source và Firestore Rules.

Nếu chỉ deploy source mà không deploy Rules, `login_history` vẫn có thể bị Firestore từ chối. Tuy nhiên app V5H đã fail-safe nên không chặn đăng nhập và không spam lỗi đỏ.

Sau deploy cần hard refresh hoặc xóa cache site để tải bundle:

```text
superadmin-access-admin-provisioning-recovery-20260704-v5k
```
