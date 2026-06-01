# APPJS_EXTRACTION_ROADMAP — Phase 4.0C-1

> Lộ trình tách `app.js` theo giai đoạn — production-safe.
> **Mỗi stage chỉ bắt đầu sau khi stage trước đã pass check tool.**

---

## Tổng quan

`app.js` (~10,274 dòng) cần được tách thành nhiều module nhỏ hơn để:
- Dễ bảo trì
- Giảm nguy cơ conflict khi nhiều dev cùng sửa
- Chuẩn bị cho testing từng module
- Cải thiện load time (lazy loading tiềm năng)

**Nguyên tắc**: Tách từ ngoài vào trong — pure helpers trước, domain modules sau, app shell cuối cùng.

---

## Stage 1 — Pure Utilities → `js/core/utils.js`

**Mục tiêu**: Tách các helper thuần (không phụ thuộc Firestore, DOM, global closure).

**Check tool**: `tools/check-appjs-decomposition-readiness.mjs` phải pass trước và sau.

### Functions tách sang `js/core/utils.js`:

| Function | Dòng app.js | Ghi chú |
|---|---|---|
| `getLocalToday()` | ~565 | Pure date helper |
| `formatDate()` | ~566 | Pure formatter |
| `formatMonth()` | ~567 | Pure formatter |
| `addMonthsToYYYYMM()` | ~569 | Pure date math |
| `normalizeYYYYMM()` | ~581 | Pure normalizer |
| `removeVietnameseTonesForQR()` | ~3813 | Pure string util |
| `maskAccountNumber()` | ~3870 | Pure masker |
| `formatMonthCompact()` | window assign | Pure formatter |
| `_ppAddM()` | ~2216 | Pure month helper |
| `_ppClean()` | ~2221 | Pure string cleaner |

> **Đã có**: `js/utils/helpers.js` chứa `normalizeSearchText`, `normalizePhone`, `buildStudentSearchIndex`.
> Các function trong Stage 1 sẽ đi vào `js/core/utils.js` (tạo mới) — không nhầm với `helpers.js`.

### Pattern:

```js
// js/core/utils.js
export function formatDate(dateStr) { ... }
export function getLocalToday() { ... }
// ...

// app.js — giữ bridge
import { formatDate, getLocalToday } from './js/core/utils.js';
// window bridge không cần cho pure utils (không được HTML gọi trực tiếp)
```

### Điều kiện pass Stage 1:

- [ ] `js/core/utils.js` được tạo với tất cả functions trên.
- [ ] `app.js` import từ `js/core/utils.js` thay vì define nội bộ.
- [ ] Không còn duplicate definition trong `app.js`.
- [ ] `check-syntax.mjs` pass.
- [ ] `check-appjs-decomposition-readiness.mjs` pass.

---

## Stage 2 — UI Helpers → `js/core/ui.js`

**Mục tiêu**: Tách helpers không có Firestore, chỉ DOM + state nhẹ.

**Prerequisite**: Stage 1 đã hoàn thành.

### Functions tách sang `js/core/ui.js`:

| Function | Ghi chú |
|---|---|
| `showToast()` | DOM only, no Firestore |
| `trackLargeListRender()` | metrics only |
| `getBeltBadge()` | pure string → HTML |
| `openMobileMenu()` / `closeMobileMenu()` | DOM only |
| `formatMonthCompact()` | *(nếu chưa đưa vào utils)* |

> `showToast` cần `window.showToast = showToast` vì nhiều module gọi qua `window.showToast(...)`.

### Pattern:

```js
// js/core/ui.js
export function showToast(msg, type) { ... }

// app.js bridge
import { showToast } from './js/core/ui.js';
window.showToast = showToast;
```

---

## Stage 3 — Payment/QR Helpers → `js/modules/payments.js`

**Mục tiêu**: Tách logic QR + bank payment ra module độc lập.

**Prerequisite**: Stage 1 + 2 đã hoàn thành.

### Functions:

| Function | Bridge cần? | Ghi chú |
|---|---|---|
| `normalizeBranchKeyForPayment()` | no | Pure helper |
| `getPaymentAccountForBranch()` | yes `window.*` | Gọi bởi nhiều nơi |
| `generateVietQR()` | yes `window.*` | |
| `maskAccountNumber()` | no | Đã ở Stage 1 |
| `ppOpenTransferSheet()` | yes | HTML gọi |
| `ppSelectBank()` | yes | HTML gọi |
| `ppOpenWallet()` | yes | HTML gọi |
| `ppTryBank()` | yes | HTML gọi |
| `ppLookupLogin()` | yes `window.ppLookupLogin` | HTML gọi |
| `copyParentCode()` | yes `window.copyParentCode` | HTML gọi |

> **Phụ thuộc**: `clubConfig`, `allProfiles` — cần truyền qua tham số hoặc `window.__store`.

---

## Stage 4 — Diagnostics → `js/core/diagnostics.js`

**Mục tiêu**: Tách toàn bộ debug/check functions khỏi production app.js.

**Prerequisite**: Stage 1–3 hoàn thành.

### Functions:

| Function | Bridge cần? |
|---|---|
| `printReadScaleMetrics()` | yes `window.*` |
| `printScaleReadiness()` | yes `window.*` |
| `printLoginPerformance()` | yes `window.*` |
| `printDataHydrationStatus()` | yes `window.*` |
| `printFirestorePathStatus()` | yes `window.*` |
| `getRuntimeHealthStatus()` | yes `window.*` |
| `bumpRuntimeDataVersion()` | yes `window.*` |
| `runRuntimeDataRecovery()` | yes `window.*` |
| `probeClubDataReadOnly()` | yes `window.*` |
| `recordReadMetric()` | yes `window.*` |
| `generateOnboardingReportText()` | yes `window.*` |
| `generateSuperAdminAuditReportText()` | yes `window.*` |
| `printSuperAdminAudit()` | yes `window.*` |
| `printOnboardingGate()` | yes `window.*` |

---

## Stage 5 — Domain Modules

**Mục tiêu**: Tách domain logic. Đây là stage rủi ro nhất.

**Prerequisite**: Stage 1–4 phải hoàn thành. Cần có E2E test (manual) trước mỗi sub-stage.

**CHỈ BẮT ĐẦU sau khi có test checklist manual.**

### Stage 5A — Inventory → `js/modules/inventory.js`

Ít phụ thuộc nhất trong domain modules.

| Functions chính | Bridge |
|---|---|
| `calcInv()`, `calcMiInvTotal()` | yes |
| `toggleInvType()`, `toggleInvCategory()` | yes |
| `getInvCategories()`, `populateInvCategorySelects()` | yes |
| `addInvCategory()`, `deleteInvCategory()` | yes `window.*` |
| `markInvPaid()`, `recalcMiInvDebt()` | yes `window.*` |
| `openEditInv()`, `saveEditInv()` | yes |
| `openManageCatModal()`, `closeManageCatModal()` | yes |

### Stage 5B — Attendance → `js/modules/attendance.js`

Đã có `js/modules/attendance.js` (hoặc trong js/listeners). Merge/tách cẩn thận.

| Functions chính | Bridge |
|---|---|
| `renderAttendanceList()` | yes |
| `renderAttMonthly()` | yes `window.*` |
| `toggleAttendance()`, `toggleAttendanceStatus()` | yes `window.*` |
| `bulkCheckIn()` | yes `window.*` |
| `syncOfflineAttendance()` | yes `window.*` |
| `addShift()`, `deleteShift()` | yes `window.*` |
| `onShiftChange()` | yes `window.*` |

### Stage 5C — Finance → `js/modules/finance.js`

Phụ thuộc nhiều nhất — tách sau cùng trong Stage 5.

| Functions | Bridge |
|---|---|
| `quickPay()` | yes `window.*` |
| `processCombo()` | yes |
| `processMultiItem()` | yes |
| `deleteTx()` | yes `window.*` |
| `skipMonth()` | yes `window.*` |

### Stage 5D — Reports → `js/modules/reports.js`

| Functions | Bridge |
|---|---|
| `executeExcelExport()` | yes |
| `executeTaxExport()` | yes |
| `exportToExcel()` | yes `window.*` |
| `fetchAllPagesForExport()` | yes `window.*` |

---

## Stage 6 — App.js Shell

**Mục tiêu**: Sau khi tất cả domain modules đã tách, `app.js` chỉ còn:

1. Firebase init + auth lifecycle
2. `initSaaSDatabase()` — orchestrator chính
3. `renderApp()` — delegate sang module renderers
4. `dispatchAppContextReady()` / `getAppContext()`
5. Module bridge registrations (import + window re-assign)
6. `onAuthStateChanged()` handler

**Mục tiêu kích thước**: `app.js` < 2000 dòng sau Stage 6.

---

## Check Requirements per Stage

Trước khi bắt đầu bất kỳ Stage nào:

```bash
node tools/check-syntax.mjs          # JS syntax valid
node tools/check-appjs-decomposition-readiness.mjs  # readiness checks
npm run check:all                     # toàn bộ checks
```

Sau khi hoàn thành Stage:

```bash
npm run local                         # chạy localhost:8000
# Manual test: login, navigation, forms
node tools/check-syntax.mjs
npm run check:all
```

---

## Không làm

- ❌ Tách Stage 5 trước Stage 1–4.
- ❌ Tách `initSaaSDatabase`, `renderApp`, `onAuthStateChanged` trong Stage 1–4.
- ❌ Xóa `window.*` của function nào đang được HTML gọi.
- ❌ Đổi tên function đang được HTML gọi.
- ❌ Tách nhiều domain cùng lúc (tách từng Stage nhỏ, test kỹ).
- ❌ Skip check tool sau mỗi Stage.
