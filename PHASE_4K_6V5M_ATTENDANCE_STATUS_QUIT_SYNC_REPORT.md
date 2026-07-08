# Phase 4K-6V5M — Attendance Status + Quit Tab Sync

## Mục tiêu

Sửa đồng bộ trạng thái võ sinh giữa các tab:

- `Đang tập` là nguồn danh sách cho `Điểm danh`.
- Võ sinh `🚫 Nghỉ` không được còn trong danh sách điểm danh.
- Võ sinh `⏸ Báo nghỉ` trong tháng của ngày điểm danh không được còn trong danh sách điểm danh.
- Tab `🛑 Đã Nghỉ` không bị thiếu danh sách do local store/lazy loader/pagination cũ.

## Nguyên nhân đã phát hiện

### 1. Điểm danh lọc `skippedMonths` quá thô

Trong `js/modules/attendance.js`, danh sách điểm danh đã có filter `skippedMonths`, nhưng chỉ kiểm tra trực tiếp:

```js
p.skippedMonths.includes(selMon)
```

Điều này bỏ sót dữ liệu cũ/không chuẩn như:

- `2026-6`
- `Tháng Sáu 2026`
- `T6/2026`
- các field cũ như `skipMonths`, `pausedMonths`, `baoNghiMonths`

Kết quả: võ sinh đã `⏸ Báo nghỉ` vẫn có thể còn trong danh sách điểm danh.

### 2. Sau khi bấm `🚫 Nghỉ`, local canonical store chưa được cập nhật ngay

`syncStudentStatusLocal()` chỉ cập nhật `window.__store.profiles`, nhưng chưa merge ngay vào `studentProfileStore`. Vì vậy tab `Đã Nghỉ` có thể chưa hiện ngay hoặc bị thiếu cho tới khi Firestore snapshot/lazy load hoàn tất.

### 3. Tab `Đã Nghỉ` vẫn thiếu một số legacy quit signals

Lazy loader đã có nhiều query, nhưng vẫn thiếu vài biến thể dữ liệu cũ như:

- `🚫 Nghỉ`
- `Nghỉ học`
- `ngayNghiTap`
- `ngayNghiHoc`
- `nghiTapDate`
- `nghiHocDate`
- `quitAt`, `leftAt`, `stoppedAt`

## Thay đổi chính

### `js/modules/attendance.js`

- Thêm `_normalizeAttendanceMonth()` để normalize tháng báo nghỉ.
- Thêm `_profileSkippedForAttendanceMonth()` để kiểm tra `skippedMonths` theo tháng của ngày điểm danh.
- Hỗ trợ các field cũ: `skipMonths`, `pausedMonths`, `pauseMonths`, `breakMonths`, `nghiThang`, `baoNghiMonths`.
- Thêm `_profileExplicitlyExcludedFromAttendance()` để loại các hồ sơ bị đánh dấu riêng là không điểm danh.
- Không còn dùng `p.skippedMonths.includes(selMon)` trực tiếp.
- `Hiển thị tất cả` trong tab Điểm danh chỉ bỏ qua lịch tập/ca, không được đưa võ sinh đã nghỉ hoặc đã báo nghỉ tháng quay lại roster.

### `js/modules/students.js`

- `syncStudentStatusLocal()` merge profile vào `studentProfileStore` ngay.
- Khi võ sinh chuyển `quit`, invalidate `attendance.list` để danh sách điểm danh cập nhật ngay.
- Khi báo nghỉ tháng, invalidate `attendance.list` để tháng tương ứng cập nhật ngay.
- Sau `markStudentQuitFromDebt()`, render lại cả `debt` và `quit`.

### `js/listeners/profiles.listeners.js`

- Mở rộng lazy loader Đã nghỉ để nhận thêm legacy quit aliases và date signals.
- Giữ nguyên nguyên tắc: Coach không đọc quit list, chỉ Admin/SuperAdmin/role đủ quyền mới lazy load.

### `js/data/profileStatusConfig.js`

- Classifier nhận thêm các field ngày nghỉ cũ.
- Nhận diện `🚫 Nghỉ` là quit signal.

## Cache-bust

Build marker mới:

```text
attendance-status-quit-sync-20260704-v5m
```

APP patch:

```text
4K-6V5M-attendance-status-quit-sync-20260704
```

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5m-attendance-status-quit-sync` — PASS 19/19
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:attendance-shift-filter` — PASS 10/10
- `npm run check:quit-tab-completeness` — PASS 12/12
- `npm run check:quit-tab-authoritative-completeness` — PASS 9/9
- `npm run check:quit-tab-mobile-parity` — PASS 17/17
- `npm run check:v5g-given-name-priority-search-unification` — PASS 15/15
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:v5k-superadmin-access-admin-provisioning-recovery` — PASS 16/16
- `npm run check:v5l-superadmin-revenue-cache-fallback` — PASS 18/18

## Lưu ý deploy

Bản này chủ yếu sửa Hosting/source. Nếu production đã deploy Rules từ V5K/V5H thì không cần đổi Rules. Sau deploy cần hard refresh hoặc xóa cache site để trình duyệt tải đúng marker V5M.
