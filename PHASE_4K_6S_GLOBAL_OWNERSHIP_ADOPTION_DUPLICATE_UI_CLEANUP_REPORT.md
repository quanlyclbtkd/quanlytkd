# PHASE 4K-6S — GLOBAL OWNERSHIP ADOPTION + DUPLICATE UI CLEANUP

**Ngày hoàn tất:** 16/06/2026  
**Bản nguồn:** Phase 4K-6R — Mobile Filter Hardening + Global Ownership  
**Build:** `4K-6S-global-ownership-adoption-duplicate-ui-cleanup-20260615`

## 1. Phương án được chọn

Phương án an toàn nhất sau 4K-6R là:

> **Canonical module ownership + classic rollback layer + measured duplicate cleanup.**

Không thực hiện rewrite `app.js`, không chuyển các luồng ghi tài chính, Auth, Firestore listener hoặc render kernel. Chỉ chuyển các global UI/pure helper đã được phân loại rủi ro thấp, đồng thời giữ một lớp fallback classic-script chạy được cả khi ES module lỗi hoặc khi mở bằng `file://`.

## 2. Phạm vi đã thực hiện

### 2.1. Tạo rollback layer độc lập

Tạo file:

```text
js/legacy/legacyUiFallbacks.js
```

File này được load **trước `app.js`** và cung cấp fallback cho 11 global:

```text
showToast
openMobileMenu
closeMobileMenu
_checkMonthlyReminder
_dismissMonthlyReminder
_openMonthlyExport
openTaxModal
closeTaxModal
openComboModal
closeModal
formatMonthCompact
```

Rollback layer chỉ dùng DOM, localStorage và pure formatting. Không chứa Firebase API, Firestore read/write, Auth, listener hoặc logic tài chính.

### 2.2. Chốt canonical owner

| Global | Canonical owner |
|---|---|
| `showToast` | `js/ui/toast.js` |
| `closeModal` | `js/ui/modal.js` |
| `openComboModal` | `js/modules/finance.js` |
| `formatMonthCompact` | `js/utils/format.js` |
| 7 UI shell globals | `js/ui/legacyUiShell.js` |

Tổng số canonical globals đã đăng ký: **11**.

### 2.3. Ngăn module ghi đè chéo

- `finance.js` không còn gán trực tiếp `window.formatMonthCompact`.
- `finance.js` không còn gán trực tiếp `window.openComboModal`.
- `students.js` không còn gán lại `window.formatMonthCompact`.
- `students.js` dùng trực tiếp pure helper được import từ `js/utils/format.js`.
- `showToast`, `closeModal`, `openComboModal`, `formatMonthCompact` đều đăng ký qua `GlobalOwnershipRegistry`.

### 2.4. Nâng cấp ownership diagnostics

`GlobalOwnershipRegistry` bổ sung:

- `assertManifestCoverage()` — bắt owner bắt buộc chưa được đăng ký.
- `assertRegisteredOwnership()` — phát hiện global bị thay thế sau bootstrap.
- `restoreCanonical(name)` — phục hồi có chủ đích, không dùng Proxy và không tự động can thiệp global khác.
- Từ chối đăng ký `switchTab` vì hiện còn async wrapper trong `main.js`.
- Tiếp tục chặn toàn bộ protected financial/bootstrap/listener/render flows.

### 2.5. Cleanup thật trong `app.js`

Đã xóa duplicate implementation của 11 low-risk globals khỏi `app.js`.

| Chỉ số | Phase 4K-6R | Phase 4K-6S | Giảm |
|---|---:|---:|---:|
| Dung lượng `app.js` | 810.455 bytes | **806.122 bytes** | **4.333 bytes** |
| Số dòng | 13.190 | **13.105** | **85 dòng** |
| Exact `window.X =` assignments | 344 baseline | **333** | **11 assignments** |
| Exact app/module duplicate globals | 107 baseline | **103** | **4 globals** |

Mức giảm dung lượng hiện còn nhỏ vì phase này chỉ xử lý nhóm UI/pure helper rủi ro thấp. Đây là giảm thật, không phải chỉ di chuyển thêm code vào `app.js`.

## 3. Những phần cố ý không thay đổi

Không thay đổi:

- Firestore schema, index hoặc query.
- Firebase Authentication bootstrap.
- Realtime listeners.
- `initSaaSDatabase`.
- `listenToData`.
- `renderApp` / `scheduleRender`.
- `processMultiItem`.
- `quickPay`.
- `deleteTx`.
- `markInvPaid`.
- `cancelExamPayment`.
- Logic Thu học phí, Thu gộp khoản, Kho đồ, Thi đai.
- Responsive fix vùng Kỳ/Tháng – Cơ sở của Phase 4K-6R.

`switchTab` chỉ được audit, chưa chuyển owner vì còn liên quan lazy module, lifecycle tab, listener cleanup, search replay và render invalidation.

## 4. Kiểm tra toàn bộ hệ thống

### 4.1. Syntax

- **101 file JavaScript**.
- **8 inline scripts** trong `index.html`.
- Tổng: **109 mục**.
- Kết quả: **PASS**.

### 4.2. Default gate

`npm run check`

- 10 command groups.
- Kết quả: **PASS**, không có failure.

### 4.3. Full system gate

`npm run check:all`

- 56 command groups.
- Bao phủ startup, assets, CSS build, mobile filter, tuition/currency, Firestore scale gates, search, pagination, dashboard, debt, attendance, exam, inventory, SuperAdmin, deploy package, GitHub Pages, runtime smoke, ownership, listener và financial audit.
- Kết quả: **PASS**, không có failure.

### 4.4. Critical gate

`npm run check:all:critical`

- 78 command groups.
- Bao phủ các luồng trọng yếu về học phí, giao dịch, nợ, thi đai, kho đồ, pagination, runtime, SuperAdmin, write safety và production stability.
- Kết quả: **PASS**, không có failure.

### 4.5. Phase 4K-6S ownership gate

- **98 assertions**.
- Canonical registered: **11/11**.
- Fallback references preserved: **11/11**.
- Ownership collision: **0**.
- Required owner missing: **0**.
- Protected flow violation: **0**.
- Replacement detection: PASS.
- Explicit canonical recovery: PASS.

### 4.6. Legacy kernel reduction gate

- `app.js`: khoảng **787,2 KiB**.
- Risk level hiện tại: **MEDIUM**.
- Kernel boundaries vẫn tồn tại và pass.
- Cảnh báo còn lại: file vẫn trên 13.000 dòng, cần tiếp tục tách theo từng nhóm cùng mức rủi ro.

## 5. Đánh giá sau cập nhật

Phase 4K-6S đạt mục tiêu:

- `app.js` bắt đầu giảm thật.
- 11 low-risk globals có owner rõ ràng.
- Không còn ba module cùng tranh quyền `formatMonthCompact`.
- Có fallback khi module lỗi.
- Có diagnostics phát hiện và phục hồi global bị thay thế.
- Không chạm protected business/write paths.
- Toàn bộ automated gates hiện có đều pass.

Giới hạn kiểm tra:

- Không kết nối Firestore production thật trong môi trường audit.
- Không thay thế kiểm thử thao tác thực tế trên iPhone/Android thật.
- Trước khi phát hành toàn bộ CLB vẫn nên chạy smoke test trên một tài khoản/CLB thử nghiệm và kiểm tra Console không có `global-reference-replaced`, `owner-conflict` hoặc asset 404.

## 6. Bước tiếp theo đề xuất

Sau khi 4K-6S chạy ổn định, bước tiếp theo nên là:

## Phase 4K-6T — Pure Utility Extraction + Measured `app.js` Reduction

Phạm vi ưu tiên:

1. Pure text/date/money normalization helpers còn trùng.
2. DOM lookup và safe storage helpers.
3. Read-only modal/render helpers không phụ thuộc business state.
4. Tạo dependency map và regression test trước mỗi nhóm.

Chưa chuyển `switchTab`, Auth, listener, render kernel hoặc financial write flows trong 4K-6T.
