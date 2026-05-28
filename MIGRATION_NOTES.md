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
