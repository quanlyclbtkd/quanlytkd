# Migration Notes — Taekwondo Club App
## Monolithic → ES Modules Architecture

---

## Tại sao KHÔNG làm full refactor trong 1 lần?

| Rào cản | Chi tiết |
|---------|----------|
| **264 window.X functions** | HTML dùng `onclick="functionName()"` — phải giữ trên `window` |
| **Closure chain sâu 8.870 dòng** | `db`, `currentClubId`, `allProfiles` tham chiếu 300+ lần xuyên suốt |
| **Firebase CDN custom** | `window._fb_init` ≠ ES Module import — cần Import Map hoặc CDN thay đổi |
| **Không có test suite** | Không thể xác nhận refactor không phá vỡ tính năng |

**Kết luận:** Full refactor trong 1 lần = high risk. Phương án đúng là phased migration.

---

## Cấu trúc thư mục hiện tại

```
output/
├── app.js            ← /// OLD CODE — vẫn chạy 100%
├── index.html        ← Chưa thay đổi
├── style.css         ← Chưa thay đổi
├── firestore.rules   ← ✅ MỚI (Phase 2g) — Security Rules production-ready
└── js/               ← /// NEW ARCHITECTURE
    ├── main.js              ← ✅ Phase 2g — Global error handler, health check
    ├── store.js             ← ✅ Phase 2g — Tích hợp listeners.js (cleanupAll)
    ├── firebase/
    │   └── config.js        ← ✅ HOÀN CHỈNH — Firebase init + SDK export
    ├── utils/
    │   ├── format.js        ← ✅ HOÀN CHỈNH — Pure formatting functions
    │   ├── constants.js     ← ✅ HOÀN CHỈNH — App-wide constants
    │   ├── helpers.js       ← ✅ HOÀN CHỈNH — DOM & logic utilities
    │   └── listeners.js     ← ✅ HOÀN CHỈNH — Centralized listener manager
    ├── ui/
    │   ├── toast.js         ← ✅ HOÀN CHỈNH — showToast()
    │   ├── modal.js         ← ✅ HOÀN CHỈNH — openModal/closeModal helpers
    │   ├── tabs.js          ← ✅ Phase 2c — Tất cả 9 tab store-based
    │   └── render.js        ← ✅ Phase 2c — Delegation wrappers (không regression risk)
    └── modules/
        ├── students.js      ← ✅ Phase 2d — Đã implement đầy đủ
        ├── finance.js       ← ✅ Phase 2e — Đã implement đầy đủ
        ├── inventory.js     ← ✅ Phase 2f — Đã implement đầy đủ
        ├── attendance.js    ← 🔶 Stub Phase 2g — app.js fallback (ổn định)
        ├── exam.js          ← 🔶 Stub Phase 2g — app.js fallback (ổn định)
        ├── dashboard.js     ← 🔶 Stub Phase 2g — app.js fallback (ổn định)
        └── superadmin.js    ← 🔶 Stub Phase 2g — app.js fallback (ổn định)
```

---

## Phase 1 — ĐÃ HOÀN THÀNH ✅

*(Xem chi tiết trong bản MIGRATION_NOTES.md Phase 1)*

Tóm tắt: `format.js`, `constants.js`, `helpers.js`, `store.js`, `firebase/config.js`, `toast.js`, `modal.js` — tất cả hoàn chỉnh.

---

## Phase 2 — TIẾN ĐỘ

### Bước 2a ✅ HOÀN THÀNH — Kích hoạt main.js

`index.html` có cả 2 script tags:
```html
<script defer src="app.js"></script>
<script type="module" src="js/main.js"></script>
```
→ app.js chạy trước (business logic), main.js override sau (tabs, toast, modules).

---

### Bước 2b ✅ HOÀN THÀNH — Extract `ui/tabs.js`

`window.switchTab` được override bởi module version.
Fallback: `window._legacySwitchTab` (từ app.js) khi cache chưa sẵn sàng.

---

### Bước 2c ✅ HOÀN THÀNH — `ui/render.js` (Delegation Pattern)

**Quyết định kiến trúc:** Thay vì extract toàn bộ `renderApp()` 1.300 dòng (high risk),
đã dùng **delegation wrapper pattern**:
- `render.js` export functions delegate sang `window.renderXxx` của app.js
- Tất cả 9 tab đều **store-based** (đọc từ `window.__store.tabHtmlCache`)
- Chart sync: `financeChartInstance` và `memberChartInstance` → `window.__store`

**Kết quả của 9 tabs:**

| Tab | Trạng thái |
|-----|------------|
| tx | ✅ store-based (tabHtmlCache) |
| debt | ✅ store-based (tabHtmlCache) |
| active | ✅ store-based (tabHtmlCache + paging) |
| quit | ✅ store-based (tabHtmlCache + paging) |
| inventory | ✅ store-based (tabHtmlCache) |
| expense | ✅ store-based (tabHtmlCache) |
| exam | ✅ store-based (tabHtmlCache + render) |
| attendance | ✅ store-based (date init + render) |
| dashboard | ✅ store-based (charts từ __store) |

---

### Bước 2d ✅ HOÀN THÀNH — `modules/students.js`

Toàn bộ functions quản lý võ sinh đã extract:
- `openAddModal / closeAddModal / addNewStudent`
- `editProfile / saveProfile / deleteStudent`
- `sendZaloMsg / openBulkZaloModal / sendBulkZaloOne`
- `addAchievement / removeAchievement`

---

### Bước 2e ✅ HOÀN THÀNH — `modules/finance.js`

Toàn bộ functions tài chính đã extract:
- `quickPay` — thu học phí nhanh (tính số tháng thực tế đóng được)
- `openQuickPayModal` — modal chọn số tháng
- `deleteTx` — xóa giao dịch + cập nhật paidUntil từ Firestore
- `skipMonth / removeSkip` — báo nghỉ tháng / hủy miễn
- `handleQuitOption` — hỏi nghỉ hẳn hay báo nghỉ
- `quickCollectExam` — thu lệ phí thi
- `processCombo` — combo gia đình

---

### Bước 2f ✅ HOÀN THÀNH — `modules/inventory.js`

Toàn bộ functions kho đã extract:
- `getInvCategories / getCategoryOptionHtml / populateInvCategorySelects`
- `loadInvCategories` — tải từ Firestore
- `openManageCatModal / closeManageCatModal / renderManageCatList`
- `addInvCategory / deleteInvCategory / toggleInvCategory / toggleEditInvSize`
- `inventoryForm.onsubmit` — nhập/xuất kho
- `openEditInv / closeEditInvModal / markInvPaid / saveEditInv`
- `toggleMultiItemInv / toggleMiInvCategory / calcMiInvTotal`

---

### Bước 2g ✅ HOÀN THÀNH — Ổn Định Hệ Thống (Phase 2g)

**Mục tiêu:** Stabilize toàn bộ kiến trúc trước khi extract các module phức tạp.

#### Thay đổi đã thực hiện:

**1. `js/utils/listeners.js` — Tích hợp hoàn chỉnh**
- Centralized listener manager với Map-based registry
- `addListener(key, unsub)` — thay thế `activeListeners.push()`
- `cleanupAll()` — hủy cả key-based + legacy listeners trong 1 lần gọi

**2. `js/store.js` — Upgrade resetStore()**
- Gọi `cleanupAll()` từ `listeners.js` trước khi cleanup legacy array
- Đảm bảo KHÔNG có listener nào còn sống sau khi logout
- Thứ tự cleanup: listeners → charts → data fields

**3. `js/main.js` — Global Error Handlers**
- `window.onerror` — bắt runtime errors
- `window.addEventListener('unhandledrejection')` — bắt Promise rejections
- Module health check sau bootstrap — cảnh báo nếu global functions bị thiếu
- Debug log cải tiến: hiện `listenerCount()` và `getActiveKeys()`

**4. Stub modules ổn định (attendance, exam, dashboard, superadmin)**
- Bỏ import store không cần thiết
- `console.info` thay `console.warn` (không gây alarm)
- Bridge helpers được comment sẵn — copy-paste khi extract

**5. `firestore.rules` — Security Rules Production-Ready**
- Phân quyền đầy đủ: superadmin / admin / coach / viewer
- fee_audit: chỉ CREATE (không UPDATE, DELETE) — bảo toàn audit trail
- coaches: viewer không đọc được (bảo mật thông tin nội bộ)
- Catch-all cho subcollection mới

---

## Phase 3 — Future (Sau khi production ổn định)

### 3a: Extract 4 module còn lại
**Thứ tự ưu tiên:** attendance → exam → dashboard → superadmin

Mỗi module:
1. Uncomment import trong main.js
2. Implement đầy đủ (xem bridge helpers trong stub)
3. Test thủ công toàn bộ tính năng
4. Comment `/// MOVED TO js/modules/X.js` trong app.js
5. Commit → production 1 tuần → xóa khỏi app.js

### 3b: Cloud Functions cho debt calculation
*(Xem FIRESTORE_INDEXES.md §Tại sao KHÔNG thể paginate Profiles)*

### 3c: Chuyển sang ES Module Firebase SDK thật
*(Xem Phase 3 trong bản MIGRATION_NOTES.md cũ)*

### 3d: Loại bỏ window.X globals (HIGH RISK)
- Viết lại tất cả `onclick=""` → `addEventListener`
- Chỉ làm khi có E2E test suite đầy đủ

---

## Quy tắc Migration An Toàn (Bất biến)

1. **Một module một lần** — không extract 2 module cùng lúc
2. **Test thủ công đầy đủ** sau mỗi lần extract
3. **Giữ `app.js` cho đến khi module ổn định** ít nhất 1 tuần production
4. **Comment rõ** `/// MOVED TO js/modules/X.js` tại chỗ xóa trong app.js
5. **KHÔNG dùng store.db ở ngoài scope hàm** — luôn gọi `_db()` tại call-time
6. **Chạy health check** (main.js #6) sau mỗi lần thêm module mới

---

## Store Pattern — Hướng dẫn dùng

```javascript
// modules/finance.js — Pattern đúng
import { addListener, removeListener } from '../utils/listeners.js';

export function initFinance() {
    window.quickPay = async (name, ...) => {
        // ✅ Đọc từ bridge tại call-time (luôn up-to-date)
        const { db, colRef, clubId, profiles } = getFromBridge();

        // ✅ Dùng listeners.js thay vì activeListeners.push()
        const unsub = onSnapshot(ref, handler);
        addListener('finance-tx', unsub); // ← tự cleanup trùng lặp
    };
}

// ❌ KHÔNG làm: capture closure lúc init
// const db = store.db; // null khi initFinance() chạy
// activeListeners.push(unsub); // không cleanup được theo key
```

---

*Cập nhật: Phase 2g — $(date)*
*Xem thêm: firestore.rules, FIRESTORE_INDEXES.md, PHASE_2G_STABILITY.md*

---

## Phase 4.0B-4A — Bootstrap Stabilization (bắt đầu lại từ 4.0B-3)

**Lý do:** Source 4.0B-3 ổn định nhưng thiếu bộ kiểm tra bootstrap/deploy. Phase 4.0B-4A tạo toàn bộ tooling cần thiết trước khi tiếp tục các phase nâng cấp.

**Thay đổi:**
- `index.html` — Chỉ sửa đoạn inline bootstrap script: thêm visible banner đỏ khi chạy bằng `file://`
- `package.json` — Thêm scripts: `check:syntax`, `check:assets`, `check:deploy`, `check:functions`, `check:all`, `local`
- `tools/check-assets.mjs` — Kiểm tra file tĩnh + imports trong main.js
- `tools/check-deploy-contract.mjs` — Kiểm tra firebase.json và public root deploy
- `tools/check-functions.mjs` — Kiểm tra Cloud Functions source + syntax
- `tools/local-server.mjs` — Static HTTP server port 8000
- `tools/check-http-assets.mjs` — Kiểm tra HTTP 200 cho tất cả assets
- `PHASE_4B4A_BOOTSTRAP_STABILIZATION_REPORT.md` — Report đầy đủ

**Không thay đổi:** business logic, Firestore schema, Firestore Rules, app.js, js/main.js, các modules.

*Xem thêm: PHASE_4B4A_BOOTSTRAP_STABILIZATION_REPORT.md*

---

## Phase 4.0B-4B — Runtime Bootstrap Guard + Health Check Classification

**Mục tiêu:** Phân loại health check theo severity (critical/warning/info) và thêm runtime guard phát hiện module/bridge thiếu sau login, mà không làm hỏng app.js legacy core.

**Thay đổi trong `js/main.js`:**
- Thêm `RUNTIME_HEALTH_CHECKS` array (module-level) — 12 checks phân loại severity + phase
- Thêm `window.getRuntimeHealthStatus(options?)` — trả object kết quả phân loại
- Thêm `window.printRuntimeHealth(options?)` — in console đúng level: error/warn/info
- Thêm `window.ensureModuleRuntimeReady(name, globals[])` — guard nhẹ sau module init
- Thêm bootstrap health check `setTimeout` bên trong IIFE
- Thêm `app:context-ready` event listener cho after-login health check
- Giữ nguyên `_runHealthCheck()` cũ (backward compat, guard bởi `_isDev`)

**File mới:**
- `tools/check-runtime-bootstrap.mjs` — kiểm tra source tĩnh
- `PHASE_4B4B_RUNTIME_BOOTSTRAP_GUARD_REPORT.md`

**Scripts mới:**
- `npm run check:runtime-bootstrap`
- `check:all` cập nhật thêm `check-runtime-bootstrap.mjs`

**Không thay đổi:** business logic, Firestore schema, Firestore Rules, app.js.

*Xem thêm: PHASE_4B4B_RUNTIME_BOOTSTRAP_GUARD_REPORT.md*

---

## Phase 4.0B-4C — App Context Ready Dispatch từ app.js

**Mục tiêu:** `app.js` dispatch event `app:context-ready` sau khi login + `initSaaSDatabase` đã set context cơ bản, để after-login health check trong `main.js` chạy thật.

**Thay đổi trong `app.js`:**
- Thêm `window.__appContextReadyState` — trạng thái context ready (ready, clubId, generation, reason)
- Thêm hàm `dispatchAppContextReady(reason)` — có guard idempotent, không throw, chỉ warn nếu chưa đủ context
- Expose `window.dispatchAppContextReady`
- Trong `initSaaSDatabase`: thêm `window.__store.currentClubId`, `window.currentClubId`, `window.__store.currentUser` và gọi `dispatchAppContextReady('initSaaSDatabase-store-synced')`
- Trong logout: reset `__appContextReadyState`, `window.currentClubId = null`, `window.__store.currentClubId = null`

**Cập nhật `tools/check-runtime-bootstrap.mjs`:**
- Thêm Phần B — 16 checks mới cho app.js (dispatchAppContextReady, aliases, logout reset, idempotent guard)

**File mới:**
- `PHASE_4B4C_APP_CONTEXT_READY_REPORT.md`

**Không thay đổi:** business logic, Firestore schema, Firestore Rules, login flow, logout cleanup hiện tại.

*Xem thêm: PHASE_4B4C_APP_CONTEXT_READY_REPORT.md*

---

## Phase 4.0B-4D — Data Hydration Diagnostics

**Mục tiêu:** Thêm công cụ runtime diagnostics để xác nhận dữ liệu thật có hydrate vào app và từng tab hay không.

**Thêm vào `app.js`:**
- `window.__dataHydrationMetrics` — object theo dõi số snapshot/doc của từng collection + trạng thái settings/club
- `_updateHydrationMetrics(patch)` — helper nội bộ cập nhật metrics
- Cập nhật metrics tại: `dispatchAppContextReady`, `_clubCb`, `_settingsCb`, `_syncAllProfilesLegacy`, fallback profiles listener, `_invCb`, `_mergeAndRender`
- `window.printDataHydrationStatus()` — in count/status ra console (không log PII)
- `window.printTabDataStatus()` — kiểm tra từng tab có đủ data để render không
- `window.printFirestorePathStatus()` — async, kiểm tra path Firestore nào có doc (limit 1, không ghi)

**File mới:**
- `tools/check-data-hydration.mjs` — kiểm tra source tĩnh (33 patterns)
- `PHASE_4B4D_DATA_HYDRATION_DIAGNOSTICS_REPORT.md`

**Scripts mới:**
- `npm run check:data-hydration`
- `check:all` cập nhật thêm `check-data-hydration.mjs`

**Không thay đổi:** business logic, Firestore schema, Firestore Rules, không ghi Firestore, không log PII.

*Xem thêm: PHASE_4B4D_DATA_HYDRATION_DIAGNOSTICS_REPORT.md*

---

## Phase 4.0B-4E — Data Source Decision + Runtime Recovery Mode

**Mục tiêu:** Xác định nguồn dữ liệu thực sự (primary SaaS path vs legacy root collections) và bật read-only legacy fallback nếu primary rỗng. Đưa hệ thống đến ngưỡng pilot thương mại có kiểm soát.

**Phase 0 — Pre-flight config patch:**
- Tạo `firestore.indexes.json` (firebase.json trỏ tới file này nhưng chưa tồn tại)
- Thêm script `lint` vào `functions/package.json` (firebase.json predeploy gọi `npm run lint`)

**Phase 1 — `printFirestorePathStatus()` mở rộng:**
- Kiểm tra cả 6 paths: primary (clubs/{clubId}/...) + legacy root (tst_profiles, tst_transactions, tst_inventory)
- Trả về `{ clubId, primary: {...}, legacy: {...}, recommendation }`

**Phase 2+3+4 — Data Source Decision Engine + Recovery Mode:**
- `window.__firestoreDataSourceMetrics` — object theo dõi activeDataSource, fallbackUsed, fallbackReason
- `window.resolveActiveDataSource()` — async, trả về `{ source, primary, legacy, reason, safeToRender }`. source: 'primary' | 'legacy-root' | 'empty' | 'permission-error' | 'unknown'
- `window.activateLegacyRootFallback()` — đọc read-only tst_profiles/tst_transactions/tst_inventory (limit 500), sync vào store, bump _dataVersion, invalidate tabs. KHÔNG ghi Firestore. KHÔNG migration.

**Phase 5 — Primary empty overwrite guard:**
- 4 guards `[DataSourceLock]` trong: `_syncAllProfilesLegacy`, fallback profiles onSnapshot, `_invCb`, `_mergeAndRender`
- Logic: nếu `activeDataSource === 'legacy-root'` AND primary snapshot rỗng AND store đã có data → skip overwrite

**Phase 6 — `window.printPilotTabReadiness()`:**
- Trả về readiness cho từng tab: tuitionReady, debtReady, activeStudentsReady, quitStudentsReady, inventoryReady, dashboardReady
- Không log PII

**File mới:**
- `firestore.indexes.json`
- `tools/check-pilot-readiness.mjs` — 42 patterns
- `PHASE_4B4E_PILOT_READINESS_REPORT.md`

**Scripts cập nhật:**
- `npm run check:pilot`
- `npm run check:all` (thêm check-pilot-readiness.mjs)

**Không thay đổi:** business logic, Firestore schema, Firestore Rules, không ghi Firestore, không log PII, không deploy.

*Xem thêm: PHASE_4B4E_PILOT_READINESS_REPORT.md*
