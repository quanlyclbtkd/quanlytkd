# Phase 4K-6V5C — Coach Attendance Tap Stability

## Yêu cầu
- Tài khoản HLV trên web/mobile vẫn bị hiện tượng trạng thái điểm danh nhảy loạn khi bấm.
- Tài khoản Admin không bị lỗi, nên cần kiểm tra riêng nhánh HLV.
- Không thay chức năng điểm danh bằng chức năng khác.

## Phân tích nguyên nhân

### 1. UI vẫn còn phụ thuộc vào `idx` render
V5B đã thêm lock theo docId nhưng phần update DOM vẫn dùng id dạng `att_card_${idx}` và `att_lbl_${idx}`.
Nếu danh sách HLV render lại trong lúc lệnh ghi đang chạy, index có thể đổi. Khi đó lệnh hoàn tất/catch/finally có thể cập nhật nhầm card khác, tạo cảm giác trạng thái nhảy loạn.

### 2. HLV bị Firestore Rules chặn với bản ghi attendance legacy
Admin không lỗi vì Admin được update/delete mọi attendance trong CLB. HLV bị kiểm tra `resource.data.branch`.
Một số bản ghi điểm danh cũ có thể thiếu `branch`, `branch` rỗng, hoặc chỉ có branch legacy như `branchCode`, `trainingBase`, `coSoTap`... Khi HLV bấm, UI đổi tạm trạng thái, nhưng Firestore reject update do resource cũ không match branch. Catch block quay UI về trạng thái cũ, nhìn như thao tác bị nhảy.

### 3. Đọc trạng thái hiện tại còn ưu tiên `currentAttendanceData[name]`
Trường hợp render lại hoặc có dữ liệu pending, đọc theo name dễ kém ổn định hơn docId. Điểm danh là theo document: `name + date + shiftId`, nên trạng thái hiện tại cần ưu tiên `_attendanceCache[docId]`.

## Phương án đã chọn
Chọn phương án sửa tận gốc nhưng ít rủi ro:

1. UI định danh card bằng `data-att-doc-id` ổn định.
2. Click card truyền cả `name` và `docId`.
3. Toggle resolve lại entry theo docId trước, sau đó mới fallback theo name/index.
4. Update DOM/saving state theo docId, không chỉ theo render index.
5. Current status đọc từ `_attendanceCache[docId]` trước.
6. Firestore Rules cho phép HLV repair/update bản ghi attendance legacy thiếu branch **chỉ khi request mới có branch đúng cơ sở được gán**.
7. Giữ rule đọc vẫn branch-scoped, không mở cho HLV đọc toàn bộ attendance.

## File thay đổi chính
- `js/modules/attendance.js`
- `public/js/modules/attendance.js`
- `firestore.rules`
- `public/firestore.rules`
- `index.html`
- `public/index.html`
- `app.js`, `public/app.js`
- `js/main.js`, `public/js/main.js`
- `tools/check-v5c-coach-attendance-tap-stability.mjs`
- cập nhật các regression checks cache-bust tương thích V5C

## Kiểm tra đã chạy
- `npm run check` — PASS toàn bộ pipeline
- `npm run check:syntax` — PASS
- `npm run check:v5c-coach-attendance-tap-stability` — PASS
- `npm run check:v5b-coach-reminder-attendance-stability` — PASS
- `npm run check:attendance-canonical-ownership` — PASS
- `npm run check:coach-attendance-only-read-boundary` — PASS
- `npm run check:security-coach-branch-boundary` — PASS
- `npm run check:coach-branch-runtime-repair` — PASS
- `npm run check:v5a-canonical-read-adoption-legacy-fallback-gate` — PASS
- `npm run check:v5-canonical-profile-status-branch-boundary` — PASS
- `npm run check:quit-tab-mobile-parity` — PASS
- `npm run check:v4d12-superadmin-access-recovery` — PASS

## Ghi chú triển khai
Bản này có sửa `firestore.rules`, vì vậy cần deploy cả Hosting/source và Firestore Rules. Nếu chỉ deploy source, HLV vẫn có thể bị Firestore chặn khi thao tác trên attendance legacy thiếu branch, dẫn đến UI tiếp tục nhảy ngược.
