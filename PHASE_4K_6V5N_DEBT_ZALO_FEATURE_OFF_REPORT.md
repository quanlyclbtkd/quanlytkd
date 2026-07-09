# Phase 4K-6V5N — Debt Zalo Feature Off

## Mục tiêu

Ẩn hoàn toàn các tính năng Zalo trong tab **Báo nợ** theo yêu cầu vận hành:

- Ẩn nút **💬 Zalo** trên từng dòng võ sinh nợ.
- Ẩn nút **💬 Zalo Hàng Loạt** ở header tab Báo nợ.
- Không để modal Zalo / Bulk Zalo hiện hoặc được mở trong runtime.
- Không xóa code nghiệp vụ cũ để tránh rủi ro phát sinh; chỉ khóa bằng feature gate mặc định `false`.
- Không ảnh hưởng các luồng ổn định: Báo nợ, Thu học phí, QR, Thu nhanh, Nghỉ/Báo nghỉ, Điểm danh, SuperAdmin, ZaloPay ví thanh toán.

## Phân tích nguyên nhân

Tính năng Zalo đang xuất hiện ở nhiều luồng legacy/module:

1. Header tab Báo nợ trong `index.html` có nút `openBulkZaloModal()`.
2. Legacy renderer trong `app.js` tự sinh nút `copyAndOpenZalo(...)` ở từng dòng Báo nợ.
3. Renderer mới trong `js/ui/render/computation/studentsRenderer.js` cũng sinh nút Zalo tương tự.
4. `js/modules/students.js` và legacy `app.js` đều có các hàm mở modal Zalo.

Nếu chỉ ẩn một nút trong HTML, các renderer khác vẫn có thể sinh lại nút Zalo khi đổi tab/search/load-more. Vì vậy cần khóa ở tất cả boundary UI/runtime.

## Thay đổi chính

### 1. Thêm feature gate toàn cục

Trong `app.js` và `public/app.js`:

```js
window.DEBT_ZALO_FEATURE_ENABLED = false;
window.isDebtZaloFeatureEnabled = function isDebtZaloFeatureEnabled() { return false; };
window.hideDebtZaloUI = function hideDebtZaloUI() { ... };
```

### 2. Ẩn nút Zalo Hàng Loạt

Trong `index.html` và `public/index.html`:

- Gỡ nút `onclick="openBulkZaloModal()"` khỏi header tab Báo nợ.
- Modal `bulkZaloModal` được gắn `data-debt-zalo-ui hidden aria-hidden="true"` và `display:none!important`.

### 3. Ẩn nút Zalo từng dòng Báo nợ

Trong:

- `app.js`
- `public/app.js`
- `js/ui/render/computation/studentsRenderer.js`
- `public/js/ui/render/computation/studentsRenderer.js`

Nút Zalo chỉ được render nếu:

```js
window.isDebtZaloFeatureEnabled && window.isDebtZaloFeatureEnabled()
```

Mặc định hàm này luôn `false`, nên UI không còn nút Zalo.

### 4. Runtime fail-safe

Các hàm vẫn còn để tránh lỗi nếu trình duyệt còn cache inline cũ hoặc có người gọi từ console:

- `copyAndOpenZalo(...)`
- `openBulkZaloModal(...)`

Nhưng khi feature gate tắt, hàm sẽ dừng an toàn và không mở modal/Zalo.

### 5. Không tắt ZaloPay

`ZaloPay` trong ví thanh toán phụ huynh không bị ảnh hưởng vì yêu cầu chỉ liên quan tab **Báo nợ**.

## Kiểm tra đã chạy

Các nhóm kiểm tra trọng yếu đã PASS:

- `npm run check:syntax`
- `npm run check:v5n-debt-zalo-feature-off`
- `npm run check:v5m-attendance-status-quit-sync`
- `npm run check:v5l-superadmin-revenue-cache-fallback`
- `npm run check:v5g-given-name-priority-search-unification`
- `npm run check:v5c-tx-delete-reconcile-smart-search`
- `npm run check:debt-authoritative-tuition-coverage`
- `npm run check:tuition-debt-source-of-truth`
- `npm run check:coach-attendance-only-read-boundary`
- `npm run check:security-coach-branch-boundary`
- `npm run check:v5i-attendance-render-window-slow-warning-guard`
- `npm run check:profile-canonical-store`
- `npm run check:v4d1a-runtime-recovery`
- `npm run check:v5b-coach-attendance-toggle-stability`
- `npm run check:v5d-given-name-search`
- `npm run check:superadmin-monthstats`
- `npm run check:v5e-audit-gate-superadmin-hardening`
- `npm run check:v5f-debt-given-name-final-token-search`
- `npm run check:v5h-login-history-large-list-guard`
- `npm run check:v5k-superadmin-access-admin-provisioning-recovery`

`npm run check` đầy đủ đã chạy qua nhiều nhóm PASS nhưng timeout trong môi trường tool vì pipeline rất dài. Các nhóm liên quan trực tiếp tới Báo nợ/Zalo, Học phí, Search, HLV, SuperAdmin, Điểm danh, Quit tab đều đã chạy riêng và PASS.

## Deploy

Bản này chủ yếu sửa Hosting/source. Nếu production đã deploy Firestore Rules từ V5K/V5H/V5C thì không cần đổi Rules cho riêng V5N.

Sau deploy cần hard refresh hoặc xóa cache site. Bundle mới:

```text
debt-zalo-feature-off-20260704-v5n
```
