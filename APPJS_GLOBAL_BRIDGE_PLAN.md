# APPJS_GLOBAL_BRIDGE_PLAN — Phase 4.0C-1

> Kế hoạch giữ global bridge khi tách module khỏi app.js.
> **Không đổi tên, không xóa, không phá HTML inline handlers.**

---

## 1. window.* bắt buộc giữ để HTML không vỡ

Các function dưới đây đang được gọi trực tiếp từ `onclick/onchange/oninput/onsubmit` trong `index.html`.
**Phải luôn tồn tại trên `window.*` bất kể function được chuyển sang module nào.**

### Group A — Gọi bằng tên thuần (không có `window.` prefix trong HTML)

| Function | Handler type | Risk nếu xóa |
|---|---|---|
| `addNewStudent` | onclick | CRITICAL — vỡ form thêm võ sinh |
| `updateProfile` | onclick | CRITICAL — vỡ form sửa hồ sơ |
| `deleteProfile` | onclick | CRITICAL — không xóa được |
| `openProfile` | onclick | HIGH |
| `openAddModal` / `closeAddModal` | onclick | HIGH |
| `closeModal` | onclick | HIGH |
| `handleLogin` | onclick | CRITICAL — không đăng nhập được |
| `handleLogout` | onclick | CRITICAL |
| `switchTab` | onclick | CRITICAL — mất navigation |
| `renderApp` | - | CRITICAL — mất render |
| `renderAttendanceList` | onchange | HIGH |
| `renderExamList` | onchange | HIGH |
| `saveClubSettings` | onclick | HIGH |
| `saveClubExpiry` | onclick | HIGH |
| `processCombo` | onclick | CRITICAL |
| `processMultiItem` | onclick | CRITICAL |
| `executeExcelExport` | onclick | HIGH |
| `executeTaxExport` | onclick | HIGH |
| `calcInv` | - | HIGH |
| `toggleTxFormType` | onchange | HIGH |
| `toggleInvType` | onchange | HIGH |
| `updateAmountByPackage` | onchange | HIGH |
| `handleImportExcel` | onchange | HIGH |
| `downloadExcelTemplate` | onclick | MEDIUM |
| `createNewClubSystem` | onclick | HIGH |
| `selectBranchCard` | onclick | HIGH |
| `exportAchievementsExcel` | onclick | MEDIUM |
| `exportExamPaidList` | onclick | MEDIUM |
| `finishExamSession` | onclick | HIGH |
| `processBatchUpgrade` | onclick | HIGH |
| `openBulkZaloModal` | onclick | MEDIUM |
| `startSequentialBulkZalo` | onclick | MEDIUM |
| `addAchievementRow` | onclick | LOW |
| `openComboModal` | onclick | HIGH |
| `openMultiItemModal` | onclick | HIGH |
| `openSettingsModal` | onclick | MEDIUM |
| `openChangePasswordModal` | onclick | MEDIUM |
| `openExcelExportModal` | onclick | MEDIUM |
| `openTaxModal` | onclick | MEDIUM |
| `openMobileMenu` / `closeMobileMenu` | onclick | MEDIUM |
| `saveEditExpense` | onclick | HIGH |
| `saveEditInv` | onclick | HIGH |
| `closeTaxModal` | onclick | MEDIUM |

### Group B — Gọi bằng `window.X(...)` trong HTML

| Function | Handler type |
|---|---|
| `window.filterSAClubs` | onchange |
| `window.loadLoginHistory` | onchange |
| `window.onShiftChange` | onchange |
| `window.renderAttMonthly` | onchange |
| `window.toggleBank2Fields` | onchange |
| `window.toggleMiTuitionSection` | onchange |
| `window.addInvCategory` | onclick |
| `window.addShift` | onclick |
| `window.bulkCheckIn` | onclick |
| `window._clearLoginError` | - |
| `window.closeManageCatModal` | onclick |
| `window.closeShiftModal` | onclick |
| `window.copyParentCode` | onclick |
| `window.createCoachAccount` | onclick |
| `window.dismissAdminNotifications` | onclick |
| `window._dismissMonthlyReminder` | onclick |
| `window.exportAttendanceExcel` | onclick |
| `window.loadSARevenue` | onclick |
| `window.loadSuperAdminData` | onclick |
| `window.migrateCoachAccounts` | onclick |
| `window.openCoachAccountsModal` | onclick |
| `window.openManageCatModal` | onclick |
| `window._openMonthlyExport` | onclick |
| `window.openNewClubModal` | onclick |
| `window.openShiftModal` | onclick |
| `window.ppLookupLogin` | onclick |
| `window.saDeleteTransactions` | onclick |
| `window.saveBranchUpgrade` | onclick |
| `window.saveSessionNote` | onclick |
| `window.submitChangePassword` | onclick |
| `window.switchAttSubTab` | onclick |
| `window.switchSATab` | onclick |
| `window.switchLoginTab` | onclick |

---

## 2. Biến closure cần chuyển sang window.__store

Các biến closure hiện trong IIFE của app.js cần được expose ra `window.__store` hoặc `window.*` trước khi tách module.

| Biến | Hiện tại | Kế hoạch |
|---|---|---|
| `db` | closure (initSaaSDatabase) | `window._fb_init.db` hoặc `window.__store.db` |
| `auth` | closure | `window.__store.auth` |
| `currentClubId` | `window.currentClubId` | ✅ đã expose |
| `clubConfig` | closure | `window.__store.clubConfig` |
| `allProfiles` | closure | `window.__store.allProfiles` |
| `allTransactions` | closure | `window.__store.allTransactions` |
| `allInventory` | closure | `window.__store.allInventory` |
| `allAttendance` | closure | `window.__store.allAttendance` |
| `userRole` | `window.userRole` | ✅ đã expose |
| `coachBranch` | `window.coachBranch` | ✅ đã expose |
| `invCustomCategories` | `window.invCustomCategories` | ✅ đã expose |

**Ưu tiên**: Trước khi tách bất kỳ module nào cần đọc `allProfiles`, `allTransactions`, `db`... phải đảm bảo các biến này có thể truy cập từ ngoài closure.

---

## 3. Pattern extract an toàn

### Pattern 1 — Re-export qua window (an toàn nhất)

```js
// Sau khi move function sang module:
import { someFn } from './modules/x.js';
window.someFn = someFn;
```

### Pattern 2 — Wrapper bridge (khi function cần closure vars)

```js
// Module export function thuần:
export function formatDate(dateStr) { ... }

// app.js giữ bridge:
import { formatDate } from './js/core/utils.js';
window.formatDate = formatDate;  // nếu HTML gọi
```

### Pattern 3 — Delegating wrapper (khi module chưa load)

```js
window.someFn = (...args) => {
    if (typeof _moduleSomeFn === 'function') return _moduleSomeFn(...args);
    console.warn('[Bridge] someFn module chưa load');
};
```

### Pattern 4 — Legacy fallback giữ nguyên

```js
// Giữ function cũ trong app.js nhưng đánh dấu deprecated:
// [DEPRECATED — Phase 4.0C-X] dùng import từ module thay thế
function legacySomeFn(...args) { return someFn(...args); }
window.legacySomeFn = legacySomeFn;
```

---

## 4. Function chưa được tách vì phụ thuộc closure lớn

| Function | Lý do chưa tách |
|---|---|
| `initSaaSDatabase` | Định nghĩa và inject toàn bộ closure (db, auth, allProfiles...) |
| `renderApp` | Dùng tất cả closure state để render |
| `listenToData` | Subscribe tất cả listeners, inject vào closure |
| `quickPay` / `processCombo` | Dùng allProfiles, db, clubConfig, currentClubId |
| `toggleAttendance` | Dùng allAttendance, db, currentClubId, coachBranch |
| `handleImportExcel` | Dùng allProfiles, db để check duplicate + write |
| `saveClubSettings` | Dùng db, currentClubId, clubConfig |
| `loadSuperAdminData` | Dùng auth, isSuperAdmin logic riêng |

---

## 5. Quy tắc bắt buộc khi extract

1. **KHÔNG** đổi tên bất kỳ global function nào đang được HTML gọi.
2. **KHÔNG** xóa `window.X` assignments cho bất kỳ function nào trong Group A/B trên.
3. **PHẢI** giữ fallback nếu module load thất bại (try/catch hoặc check typeof).
4. **PHẢI** re-expose qua `window` sau khi move sang module.
5. **KHÔNG** phá `js/main.js` — không đổi import order.
6. **PHẢI** run `node tools/check-appjs-decomposition-readiness.mjs` sau mỗi extraction.
7. Tách theo Stage (Stage 1 trước Stage 2, etc.) — không nhảy Stage.

---

## 6. Module nào đã expose ra window (kiểm tra trước khi tách)

Một số function đã được tách sang module nhưng vẫn dùng được qua `window.*`:

- `window.mountActiveProfilesListener` — từ `js/listeners/`
- `window.renderExamList`, `window.updateNextBeltPreview` — từ `js/modules/`
- `window.exportReceipt` — từ `js/modules/`
- `window.searchProfilesServerSide` — từ `js/services/students.service.js`

Không tách lại những function này trong Phase 4.0C-1.
