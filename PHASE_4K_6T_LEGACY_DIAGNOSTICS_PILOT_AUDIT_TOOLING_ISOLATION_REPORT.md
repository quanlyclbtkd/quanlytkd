# Phase 4K-6T — Legacy Diagnostics, Pilot & Audit Tooling Isolation

**Ngày thực hiện:** 16/06/2026  
**Nguồn nâng cấp:** Phase 4K-6S1 — Exam Upgrade / Finance Separation  
**Mục tiêu:** giảm thực tế `app.js`, tách công cụ diagnostics/pilot/onboarding/SuperAdmin audit khỏi legacy kernel, giữ nguyên các luồng Auth, Firestore listener, render kernel và ghi tài chính.

---

## 1. Kết quả tổng quan

Phase 4K-6T đã hoàn thành theo chiến lược **read-only extraction + lazy loading + canonical global ownership**.

- 15 global diagnostics được đưa ra khỏi `app.js`.
- 9 runtime-readiness diagnostics được tải cùng facade để giữ tương thích console/runtime.
- 6 công cụ onboarding và SuperAdmin audit chỉ tải khi được gọi lần đầu.
- Không chuyển bất kỳ API ghi Firestore, realtime listener, Auth bootstrap, render kernel hoặc financial write flow nào.
- Global Ownership Registry hiện quản lý đầy đủ 26 owner bắt buộc: 11 owner UI từ 4K-6S và 15 owner diagnostics từ 4K-6T.
- Không phát hiện ownership collision trong kiểm thử runtime.

---

## 2. Mức giảm thực tế của `app.js`

| Chỉ số | Trước 4K-6T | Sau 4K-6T | Chênh lệch |
|---|---:|---:|---:|
| Dung lượng `app.js` | 806.859 bytes | **758.250 bytes** | **-48.609 bytes (-6,02%)** |
| Số dòng `app.js` | 13.140 | **12.110** | **-1.030 dòng (-7,84%)** |

Ngoài phần implementation diagnostics, comment Firestore Rules cũ ở đầu `app.js` cũng được xóa. File `firestore.rules` vẫn là nguồn rules chính thức và không bị thay đổi.

### Ảnh hưởng đến tải khởi động

Bản trước có:

- `app.js`: 806.859 bytes
- `js/diagnostics/legacyDiagnostics.js`: 8.552 bytes

Bản mới tải ngay:

- `app.js`: 758.250 bytes
- `js/diagnostics/legacyDiagnostics.js`: 5.913 bytes
- `js/diagnostics/runtimeReadinessDiagnostics.js`: 19.696 bytes

Tổng mã nguồn tải ngay của nhóm này giảm khoảng **31.552 bytes**. Hai module nặng hơn, tổng **19.928 bytes**, được trì hoãn cho đến khi thực sự chạy onboarding hoặc SuperAdmin audit.

---

## 3. Cấu trúc module mới

### `js/diagnostics/runtimeReadinessDiagnostics.js`

Sở hữu 9 hàm chỉ đọc:

- `debugMobileSuperAdminGate`
- `printDataHydrationStatus`
- `printTabDataStatus`
- `printFirestorePathStatus`
- `printPilotTabReadiness`
- `printPilotLaunchStatus`
- `printTenClubPilotReadiness`
- `generatePilotLaunchSnapshot`
- `printOneClubPilotGate`

Các truy vấn kiểm tra Firestore đều bị giới hạn bằng `limit(1)`.

### `js/diagnostics/onboardingDiagnostics.js`

Được dynamic import khi gọi lần đầu:

- `runOnboardingGate`
- `printOnboardingGate`
- `generateOnboardingReportText`

### `js/diagnostics/superAdminAuditDiagnostics.js`

Được dynamic import khi gọi lần đầu:

- `probeClubDataReadOnly`
- `runSuperAdminAudit`
- `printSuperAdminAudit`
- `generateSuperAdminAuditReportText`

Các probe chỉ đọc, mỗi collection tối đa một document cho mỗi lần kiểm tra path.

### `js/diagnostics/legacyDiagnostics.js`

Được chuyển thành compatibility facade:

- Giữ entrypoint `initLegacyDiagnostics()` hiện có.
- Đăng ký canonical globals qua `GlobalOwnershipRegistry`.
- Chỉ dynamic import onboarding/SuperAdmin audit khi người dùng gọi công cụ tương ứng.
- Cung cấp `debugDiagnosticsToolingIsolation()` để kiểm tra owner và trạng thái lazy loading.

---

## 4. Các phần đã xóa khỏi `app.js`

15 implementation global diagnostics và helper `probeClubDataReadOnly` không còn tồn tại trong legacy file.

Không còn tình trạng cùng một diagnostic function body tồn tại đồng thời trong `app.js` và module.

---

## 5. Các ranh giới được giữ nguyên

Các kernel và write flow sau vẫn nằm ở owner cũ, không được chuyển sang diagnostics:

- `bumpRuntimeDataVersion`
- `activateLegacyRootFallback`
- `runRuntimeDataRecovery`
- `initSaaSDatabase`
- `listenToData`
- `renderApp`
- `scheduleRender`
- `processMultiItem`
- `quickPay`
- `deleteTx`
- `markInvPaid`
- `cancelExamPayment`
- `processBatchUpgrade`

Phase này không thay đổi:

- Firestore schema, collection path hoặc index.
- Firestore Security Rules.
- Logic Học phí, Báo nợ, Thu gộp khoản, Kho đồ và Thi Đai.
- Fix tách nghiệp vụ `⚡ Xác nhận thăng đai` khỏi thu lệ phí ở Phase 4K-6S1.
- Authentication và phân quyền.
- Realtime listener ownership.
- Pagination, server-side search hoặc read-cost policy.

---

## 6. Global ownership

Manifest được mở rộng thêm 15 diagnostics globals.

Kết quả runtime simulation:

- Owner bắt buộc đã đăng ký: **26/26**
- UI owners kế thừa từ 4K-6S: **11/11**
- Diagnostics owners mới: **15/15**
- Ownership collision: **0**
- Canonical reference bị mất: **0**
- Classic UI fallback được bảo toàn: **11/11**

Onboarding và SuperAdmin audit wrappers có owner chính thức ngay khi bootstrap, nhưng implementation chỉ tải khi gọi lần đầu.

---

## 7. Regression gates đã cập nhật

Các checker dựa vào vị trí code cũ đã được điều chỉnh để kiểm tra canonical module mới:

- `check-data-hydration.mjs`
- `check-pilot-readiness.mjs`
- `check-ten-club-pilot.mjs`
- `check-one-club-pilot-gate.mjs`
- `check-onboarding-gate.mjs`
- `check-superadmin-audit.mjs`
- `check-tenant-isolation.mjs`
- `check-mobile-superadmin-gate.mjs`
- `check-global-ownership-adoption-cleanup.mjs`

Đã bổ sung gate mới:

```text
npm run check:diagnostics-tooling-isolation
```

Gate mới có **113 assertions**, bao gồm:

- Kiểm tra file/module và lazy import.
- Cấm Firestore write API và `onSnapshot` trong diagnostics.
- Kiểm tra bounded reads `limit(1)`.
- Xác nhận implementation cũ đã rời `app.js`.
- Xác nhận runtime recovery/render/Auth/listener kernel vẫn ở legacy boundary.
- Kiểm tra build marker và cache bust.
- Runtime simulation cho ownership, hydration, tab readiness, onboarding lazy load và SuperAdmin audit lazy load.

---

## 8. Kết quả kiểm tra toàn hệ thống

### Syntax

- JavaScript files: **104**
- Inline scripts trong `index.html`: **8**
- Tổng mục kiểm tra: **112**
- Kết quả: **PASS**

### Default gate

```text
npm run check
```

- **11 command groups**
- Kết quả: **PASS**

### Full system gate

```text
npm run check:all
```

- **57 command groups**
- Kết quả: **PASS**

### Critical production gate

```text
npm run check:all:critical
```

- **79 command groups**
- Kết quả: **PASS**

Ba log kiểm tra không chứa `FAIL`, `npm ERR`, `SyntaxError`, `ReferenceError` hoặc `TypeError`.

---

## 9. Đánh giá rủi ro còn lại

Automated gates xác nhận cấu trúc, ownership, source contract và runtime simulation đều đạt. Tuy nhiên, các kiểm thử này không thay thế hoàn toàn:

- Đăng nhập bằng tài khoản thật trên Firebase production.
- Firestore Rules/permission behavior của từng CLB.
- Kiểm tra trên iPhone/Android thật.
- Theo dõi console/network khi GitHub Pages cache phiên bản cũ.

Khuyến nghị triển khai canary trên một CLB trước, làm mới mạnh trình duyệt hoặc mở tab ẩn danh, rồi kiểm tra:

1. Login Admin/HLV/SuperAdmin.
2. Chuyển toàn bộ tab.
3. Học phí, Thu gộp khoản, Báo nợ, Kho đồ và Thi Đai.
4. Thu lệ phí thi và `⚡ Xác nhận thăng đai` độc lập.
5. Chạy `printPilotLaunchStatus()`, `runOnboardingGate()` và `runSuperAdminAudit()` từ console khi cần.
6. Xác nhận không có module 404 và ownership collision.

---

## 10. Kết luận

Phase 4K-6T đạt mục tiêu giảm `app.js` thực tế, tách đúng nhóm diagnostics có tỷ lệ hiệu quả/rủi ro tốt, đồng thời giữ nguyên toàn bộ kernel và luồng ghi dữ liệu nhạy cảm.

Bước tiếp theo chỉ nên bắt đầu sau canary ổn định: **Phase 4K-6U — Report/Excel Legacy Duplicate Cleanup**, tiếp tục theo nguyên tắc module ownership trước, xóa duplicate sau, không gộp với Finance/Exam write-flow migration.
