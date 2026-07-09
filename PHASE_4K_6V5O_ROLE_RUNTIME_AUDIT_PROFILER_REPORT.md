# Phase 4K-6V5O — Role-Based Runtime Audit + Read/Render Profiler

## Mục tiêu

Phase 4K-6V5O bổ sung lớp đo runtime theo vai trò để phục vụ các bước tối ưu tiếp theo mà không can thiệp nghiệp vụ đang ổn định. Phase này tập trung vào:

- Tách kiểm tra theo vai trò: SuperAdmin, Admin, HLV, Common, Performance, Deploy-safe.
- Ghi nhận read/listener/render metrics ở runtime.
- Bổ sung audit dữ liệu võ sinh: trạng thái, cơ sở, báo nghỉ, mâu thuẫn active/quit.
- Tạo panel/debug API để bật khi cần kiểm tra thực tế trên production.
- Không thêm Firestore reads/writes mới cho audit module.
- Không thay đổi công thức Học phí, Báo nợ, Điểm danh, Kho đồ, SuperAdmin.

## Thay đổi chính

### 1. Module runtime audit mới

Đã thêm:

- `js/core/roleRuntimeAudit.js`
- `public/js/core/roleRuntimeAudit.js`

Module này chỉ hoạt động khi bật debug bằng một trong các cách:

```js
localStorage.setItem('runtimeAudit', '1');
location.reload();
```

hoặc:

```js
window.__RUNTIME_AUDIT = true;
location.reload();
```

Các API debug:

```js
window.getRoleRuntimeAudit();
window.printRoleRuntimeAudit();
window.enableRuntimeAuditPanel();
window.disableRuntimeAuditPanel();
```

### 2. Hook read/listener/render metrics

Đã thêm hook nhẹ vào:

- `js/utils/firestore-guard.js`
  - ghi nhận `safeGetDocs` theo collection/query label.
- `js/utils/listeners.js`
  - ghi nhận listener key/owner/scope/tab/club.
- `js/ui/render/renderScheduler.js`
  - ghi nhận render time theo key.
- `js/ui/render/renderInvalidation.js`
  - ghi nhận large list renderedRows/totalRows/reason.

Các hook đều fail-safe, không được phép làm hỏng render hoặc Firestore logic nếu audit chưa bật.

### 3. Audit theo vai trò

Runtime audit nhận diện:

- `superadmin`
- `admin`
- `coach`
- `viewer`

Với Coach, audit sẽ đánh dấu nghi vấn nếu listener/read key chứa các vùng không nên đọc như:

```text
finance
inventoryActiveDebts
transactions
tx.
stats
debt
```

### 4. Audit dữ liệu võ sinh

Audit snapshot thống kê:

- tổng số profile local;
- active count;
- quit count;
- paused/báo nghỉ count;
- thiếu branch/cơ sở;
- skippedMonths dạng legacy;
- trạng thái mâu thuẫn active/quit.

Phase này chỉ audit, không tự sửa dữ liệu.

### 5. Role-based check scripts

Đã thêm các script:

```text
check:role-superadmin
check:role-admin
check:role-coach
check:role-common
check:performance
check:deploy-safe
check:v5o-role-runtime-audit-profiler
```

Các nhóm này giúp kiểm tra nhanh đúng vùng vừa sửa, tránh phải chạy toàn bộ `check` quá dài mỗi lần.

## Lỗi phát hiện trong quá trình kiểm tra và cách xử lý

Trong khi kiểm tra toàn diện, một số test gate cũ bị fail do chỉ chấp nhận cache-bust phase cũ như V5N/V5M/V5E, trong khi source đã chuyển sang V5O.

Các gate đã được cập nhật để chấp nhận V5O là bản kế thừa hợp lệ:

- `check-quit-tab-mobile-parity.mjs`
- `check-active-skipped-month-section-v4c2.mjs`
- `check-profile-canonical-store-v4d1.mjs`
- `check-v5d-given-name-search.mjs`
- `check-v5e-audit-gate-superadmin-hardening.mjs`
- `check-v5f-debt-given-name-final-token-search.mjs`
- `check-v5h-login-history-large-list-guard.mjs`

Đây là lỗi ở test gate/cache-bust assertion, không phải lỗi nghiệp vụ. Sau khi cập nhật, các nhóm liên quan đều PASS.

## Kết quả kiểm tra

### V5O / Common / Deploy / Performance

```text
check:syntax — PASS
check:v5o-role-runtime-audit-profiler — PASS 25/25
check:role-common — PASS
check:performance — PASS
check:deploy-safe — PASS
check:github-pages-paths — PASS 18/18
check:deploy-package — PASS 12/12
```

### SuperAdmin

```text
check:superadmin-hotfix — PASS 27/27
check:superadmin-monthstats — PASS 8/8
check:v5k-superadmin-access-admin-provisioning-recovery — PASS 16/16
check:v5l-superadmin-revenue-cache-fallback — PASS
check:v5o-role-runtime-audit-profiler — PASS
```

### Admin / Báo nợ / Học phí / Search / Zalo off

```text
check:role-admin — PASS
check:v5c-tx-delete-reconcile-smart-search — PASS 15/15
check:v5g-given-name-priority-search-unification — PASS 15/15
check:v5m-attendance-status-quit-sync — PASS 19/19
check:v5n-debt-zalo-feature-off — PASS 16/16
check:debt-authoritative-tuition-coverage — PASS 32/32
check:tuition-debt-source-of-truth — PASS
check:v5d-given-name-search — PASS 15/15
check:v5f-debt-given-name-final-token-search — PASS 16/16
```

### HLV / Điểm danh / Branch security

```text
check:coach-attendance-only-read-boundary — PASS 30/30
check:security-coach-branch-boundary — PASS 35/35
check:v5b-coach-attendance-toggle-stability — PASS 13/13
check:v5m-attendance-status-quit-sync — PASS 19/19
check:v5i-attendance-render-window-slow-warning-guard — PASS 16/16
check:v5o-role-runtime-audit-profiler — PASS
```

### Đã nghỉ / trạng thái / render

```text
check:quit-tab-authoritative-completeness — PASS 9/9
check:quit-tab-mobile-parity — PASS 17/17
check:active-skipped-month-section — PASS 11/11
check:profile-canonical-store — PASS 27/27
check:render-warning-coalescing — PASS 14/14
```

## Ghi chú về npm run check đầy đủ

`npm run check` đầy đủ hiện rất dài. Lần chạy tổng đã đi qua nhiều nhóm PASS và không thấy FAIL trước khi timeout trong môi trường tool. Vì vậy Phase V5O đã bổ sung các nhóm `check:role-*`, `check:performance`, `check:deploy-safe` để kiểm tra chính xác hơn theo vùng thay đổi.

## Cách dùng sau deploy

Bật audit trên production khi cần kiểm tra:

```js
localStorage.setItem('runtimeAudit', '1');
location.reload();
```

Xem nhanh snapshot:

```js
window.printRoleRuntimeAudit();
```

Lấy object đầy đủ:

```js
window.getRoleRuntimeAudit();
```

Bật panel nổi:

```js
window.enableRuntimeAuditPanel();
```

Tắt audit panel:

```js
window.disableRuntimeAuditPanel();
```

Tắt hẳn audit:

```js
localStorage.removeItem('runtimeAudit');
localStorage.removeItem('roleRuntimeAudit');
location.reload();
```

## Kết luận

V5O là bước nền để tối ưu hệ thống an toàn hơn. Nó không thay đổi nghiệp vụ đang ổn định, nhưng giúp đo được tab nào render nặng, vai trò nào đang mở listener nào, HLV có đọc nhầm vùng dữ liệu không, và dữ liệu võ sinh có trạng thái/cơ sở nào lệch không.

Bước tiếp theo nên dựa trên dữ liệu runtime audit thực tế. Nếu audit cho thấy UI là điểm nghẽn, ưu tiên list virtualization cho Active/Quit/Debt. Nếu audit cho thấy Reads là điểm nghẽn, ưu tiên Read Boundary Reduction theo role/tab.
