# Phase 4.0C-1 — App.js Decomposition Readiness Report

## Objective

- Chuẩn bị tách `app.js` (~10,274 dòng) thành nhiều module nhỏ hơn.
- Không thay đổi business logic, Firestore schema, HTML IDs, global function names.
- Lập bản đồ dependency, phân nhóm function, xác định global bridge.
- Tạo roadmap tách file an toàn theo giai đoạn.

---

## Findings — app.js Scan Results

| Chỉ số | Số lượng |
|---|---|
| Tổng dòng code app.js | 10,274 |
| Function declarations (named function) | 50 |
| window.* exports (tổng cộng) | 226 |
| Inline handlers trong index.html | 171 |
| Function được HTML gọi trực tiếp | 66 |
| External modules scanned | 20 |
| Safe to extract now (Stage 1) | 14 |
| Unsafe to extract (Phase 4.0C-1) | 22 |
| Domain groups | 13 |

---

## Domain Groups

| Domain | Số function | Ghi chú |
|---|---|---|
| Bootstrap/Auth | ~10 | initSaaSDatabase, handleLogin — giữ nguyên trong app.js |
| Store/Bridge | ~10 | renderApp, listenToData, switchTab — giữ nguyên |
| Students/Profiles | ~20 | Nhiều function HTML gọi trực tiếp |
| Finance/Học phí | ~25 | processCombo, quickPay, deleteTx — phụ thuộc closure nhiều |
| Debt/Báo nợ | ~5 | Ít phụ thuộc |
| Inventory/Kho đồ | ~15 | Tách được ở Stage 5A |
| Attendance/Điểm danh | ~20 | Phức tạp nhất — tách ở Stage 5B |
| Reports/Export | ~15 | exportToExcel, fetchAllPagesForExport |
| Payment/QR/Bank | ~12 | getPaymentAccountForBranch, generateVietQR — tách Stage 3 |
| SuperAdmin | ~20 | Ít risk — dùng riêng |
| UI/Modal | ~20 | showToast, openMobileMenu — tách Stage 2 |
| Debug/Diagnostics | ~15 | printReadScaleMetrics etc. — tách Stage 4 |
| Pure Utilities | ~14 | **Tách đầu tiên — Stage 1** |

---

## High-Risk Functions (KHÔNG tách trong Phase 4.0C-1)

| Function | Lý do |
|---|---|
| `initSaaSDatabase` | Định nghĩa toàn bộ closure state (db, auth, allProfiles…) |
| `renderApp` | Dùng tất cả state để render toàn bộ UI |
| `onAuthStateChanged` handler | Auth lifecycle — phá vỡ toàn bộ app |
| `listenToData` | Subscribe realtime listeners toàn hệ thống |
| `handleLogin` / `handleLogout` | Auth critical path |
| `processCombo` / `processMultiItem` | Payment + write Firestore + allProfiles |
| `quickPay` / `quickCollectExam` | Payment critical path |
| `toggleAttendance` | Write Firestore + attendance state |
| `bulkCheckIn` | Write Firestore hàng loạt |
| `saveClubSettings` | Write Firestore + reload config |
| `switchTab` | UI navigation — gọi nhiều nơi |
| `getAppContext` / `scheduleRender` | App lifecycle bridge |

---

## First Recommended Extraction (Stage 1)

### Target: `js/core/utils.js`

Tách các pure helper functions — **không phụ thuộc Firestore, DOM, hay closure state**:

| Function | Dòng app.js | Ghi chú |
|---|---|---|
| `getLocalToday()` | ~565 | Pure date |
| `formatDate()` | ~566 | Pure formatter |
| `formatMonth()` | ~567 | Pure formatter |
| `addMonthsToYYYYMM()` | ~569 | Pure date math |
| `normalizeYYYYMM()` | ~581 | Pure normalizer |
| `removeVietnameseTonesForQR()` | ~3813 | Pure string — bỏ dấu |
| `maskAccountNumber()` | ~3870 | Pure masker |
| `formatMonthCompact()` | window assign | Pure formatter |
| `_ppAddM()` | ~2216 | Pure month helper |
| `_ppClean()` | ~2221 | Pure string cleaner |

**Không cần window bridge** cho các function này vì không có HTML handler nào gọi trực tiếp.

Sau Stage 1, tiếp tục với Stage 2 (UI helpers: `showToast`, `getBeltBadge`).

---

## Global Bridge — Danh sách bắt buộc giữ

Có **66 function** được HTML gọi trực tiếp qua inline handlers.
Tất cả phải duy trì trên `window.*` sau khi tách module.

### Critical (không được xóa bao giờ)

- `window.handleLogin`, `window.handleLogout`
- `window.switchTab`, `window.renderApp`
- `window.addNewStudent`, `window.updateProfile`, `window.deleteProfile`
- `window.processCombo`, `window.processMultiItem`
- `window.executeExcelExport`, `window.executeTaxExport`
- `window.saveClubSettings`, `window.saveClubExpiry`
- `window.toggleAttendance`, `window.bulkCheckIn`
- `window.renderAttendanceList`, `window.renderExamList`

### Inline handler examples (sample từ index.html)

- `onclick="addNewStudent()"`
- `onclick="processCombo('pay')"`
- `onchange="toggleTxFormType()"`
- `onchange="renderAttendanceList()"`
- `onclick="window.bulkCheckIn(...)"`

---

## Deliverables Phase 4.0C-1

| File | Tạo lúc | Status |
|---|---|---|
| `tools/analyze-appjs-dependencies.mjs` | Phase 1 | ✅ Done |
| `APPJS_DEPENDENCY_MAP.md` | Phase 2 | ✅ Done (52KB) |
| `APPJS_GLOBAL_BRIDGE_PLAN.md` | Phase 3 | ✅ Done |
| `APPJS_EXTRACTION_ROADMAP.md` | Phase 4 | ✅ Done |
| `tools/check-appjs-decomposition-readiness.mjs` | Phase 6 | ✅ Done |
| `PHASE_4C1_APPJS_DECOMPOSITION_READINESS_REPORT.md` | Phase 7 | ✅ Done |
| `package.json` scripts updated | Phase 6 | ✅ Done |

---

## Safety

| Tiêu chí | Kết quả |
|---|---|
| Business logic changed | **No** — chỉ audit |
| Firestore schema changed | **No** |
| HTML IDs changed | **No** |
| Global function names changed | **No** |
| window.* exports removed | **No** |
| Deploy executed | **No** |
| Firestore Rules changed | **No** |
| React/Vue added | **No** |

---

## Next Phase

### Phase 4.0C-2 — Extract Pure Utilities From app.js

1. Tạo `js/core/utils.js` với các pure functions từ Stage 1.
2. Import vào `app.js` thay vì define nội bộ.
3. Xác nhận không có duplicate definition.
4. Chạy `npm run check:all`.
5. Chạy `npm run local` → test thủ công toàn bộ app.

**Bắt buộc trước Phase 4.0C-2**: `node tools/check-appjs-decomposition-readiness.mjs` phải pass 100%.
