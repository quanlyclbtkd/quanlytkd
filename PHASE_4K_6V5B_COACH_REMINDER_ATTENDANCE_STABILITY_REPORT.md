# Phase 4K-6V5B — Coach Reminder + Attendance Stability

## Mục tiêu

1. Khóa/ẩn nhắc nhở tải file tổng kết tháng trên tài khoản HLV, không ảnh hưởng Admin/SuperAdmin/Viewer.
2. Sửa hiện tượng thao tác điểm danh trên tài khoản HLV bị “nhảy loạn” khi bấm trạng thái:
   - ✅ Có mặt
   - 📝 Nghỉ có phép
   - ❌ Nghỉ không phép

## Nguyên nhân phát hiện

### 1. HLV thấy nhắc tải tổng kết tháng

Luồng `_checkMonthlyReminder()` được gọi sau khi hệ thống sẵn sàng nhưng không có role gate cho HLV. Vì vậy HLV vẫn có thể nhìn thấy banner `monthlyReminder` với nội dung “Nhắc nhở: Tải file tổng kết Tháng ...”, dù HLV chỉ nên dùng tab Điểm danh.

### 2. Điểm danh bị nhảy trạng thái

Có 3 nguyên nhân kỹ thuật:

- Card điểm danh dùng `idx` theo vị trí render để xác định võ sinh khi bấm. Nếu danh sách render lại, lọc lại, hoặc dữ liệu đang cập nhật, index có thể không còn là định danh ổn định.
- Khi HLV bấm nhanh nhiều lần trên mobile, nhiều lệnh ghi Firestore/offline có thể chạy chồng nhau. Lệnh cũ có thể hoàn tất sau lệnh mới, làm UI/server trạng thái đảo ngược.
- Chu kỳ bấm đang theo mã lưu trữ `0 → 1 → 2 → 3`, trong khi thao tác thực tế người dùng mong muốn là `Chưa điểm danh → Có mặt → Nghỉ có phép → Nghỉ không phép`.

## Đã sửa

### Monthly reminder

- Thêm role gate cho monthly reminder:
  - HLV/Coach: luôn ẩn banner và chặn mở export tổng kết tháng.
  - Admin/SuperAdmin/Viewer: giữ nguyên chức năng.
- Áp dụng ở cả canonical UI shell và legacy fallback:
  - `js/ui/legacyUiShell.js`
  - `public/js/ui/legacyUiShell.js`
  - `js/legacy/legacyUiFallbacks.js`
  - `public/js/legacy/legacyUiFallbacks.js`

### Attendance stability

- Thêm định danh bấm ổn định theo `data-att-name`, không còn phụ thuộc `idx` render.
- Thêm `window.toggleAttendanceFromCard(this)` để card truyền đúng võ sinh đang bấm.
- Giữ lại `window.toggleAttendance(...)` để không phá luồng cũ/rollback.
- Thêm khóa ghi theo từng attendance document:
  - Nếu đang ghi trạng thái cho một võ sinh, lần bấm tiếp theo trên cùng võ sinh sẽ bị bỏ qua cho tới khi ghi xong.
- Thêm pending local status để render/reload trong lúc ghi không kéo UI quay lại trạng thái cũ.
- Điều chỉnh chu kỳ bấm thân thiện với HLV:
  - `0 → 1 → 3 → 2 → 0`
  - Tức là: Chưa điểm danh → Có mặt → Nghỉ có phép → Nghỉ không phép → Chưa điểm danh.
- Giữ nguyên ý nghĩa dữ liệu lưu trữ:
  - `1 = Có mặt`
  - `2 = Nghỉ không phép`
  - `3 = Nghỉ có phép`
- Attendance write dùng branch chuẩn từ `_profileBranchValue(profile)` trước khi fallback legacy.

## File chính đã cập nhật

- `js/modules/attendance.js`
- `public/js/modules/attendance.js`
- `js/ui/legacyUiShell.js`
- `public/js/ui/legacyUiShell.js`
- `js/legacy/legacyUiFallbacks.js`
- `public/js/legacy/legacyUiFallbacks.js`
- `js/core/globalOwnershipRegistry.js`
- `public/js/core/globalOwnershipRegistry.js`
- `js/legacy/legacyAttendanceFallbacks.js`
- `public/js/legacy/legacyAttendanceFallbacks.js`
- `app.js`
- `public/app.js`
- `js/main.js`
- `public/js/main.js`
- `index.html`
- `public/index.html`
- `package.json`
- `public/package.json`
- `tools/check-v5b-coach-reminder-attendance-stability.mjs`

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5b-coach-reminder-attendance-stability` — PASS
- `npm run check:attendance-canonical-ownership` — PASS
- `npm run check:global-ownership-adoption-cleanup` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS
- `npm run check:security-coach-branch-boundary` — PASS
- `npm run check:v5a-canonical-read-adoption-legacy-fallback-gate` — PASS
- `npm run check:v5-canonical-profile-status-branch-boundary` — PASS
- `npm run check:quit-tab-completeness` — PASS
- `npm run check:quit-tab-authoritative-completeness` — PASS
- `npm run check:quit-tab-mobile-parity` — PASS
- `npm run check:debt-authoritative-tuition-coverage` — PASS
- `npm run check:v4d11-attendance-excel-tx-delete-reconcile` — PASS
- `npm run check:v4d12-superadmin-access-recovery` — PASS
- `npm run check` — PASS toàn bộ pipeline

## Deploy note

Bản V5B chủ yếu là source/runtime UI fix, không thay đổi Firestore Rules. Chỉ cần deploy Hosting/source nếu Rules production đã ở bản V4D7/V5 trở lên. Nếu Rules production vẫn rất cũ, nên deploy kèm `firestore.rules` từ package để giữ đủ quyền HLV/Admin/SuperAdmin hiện tại.
