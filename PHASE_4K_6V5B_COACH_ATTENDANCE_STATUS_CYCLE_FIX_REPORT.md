# Phase 4K-6V5B — Coach Attendance Status Cycle Fix

## Mục tiêu
Sửa lỗi trong tài khoản HLV khi điểm danh trên web/mobile: thao tác chuyển trạng thái 📝 Nghỉ có phép / ❌ Nghỉ không phép bị nhảy về ✅ Có mặt.

## Nguyên nhân tìm được

Code lưu điểm danh vẫn dùng đúng mã số:

- `1 = Có mặt`
- `2 = Nghỉ không phép`
- `3 = Nghỉ có phép`

Nhưng UI legend/luồng thao tác của người dùng đang theo thứ tự:

`Chưa ĐD → Có mặt → Nghỉ có phép → Nghỉ không phép → Chưa ĐD`

Trong khi `toggleAttendance()` trước đây dùng công thức:

`newStatus = (currentStatus + 1) % 4`

Nên thứ tự thực tế lại là:

`Chưa ĐD → Có mặt → Nghỉ không phép → Nghỉ có phép → Chưa ĐD`

Vì vậy khi HLV đang ở trạng thái 📝 Nghỉ có phép và bấm tiếp để đổi sang ❌ Nghỉ không phép, hệ thống đi qua `0` rồi về `1 = Có mặt`, gây cảm giác thao tác bị nhảy sai. Admin ít gặp vì thường thao tác ít liên tiếp hoặc không đi qua đúng chuỗi này.

## Sửa đổi

### `js/modules/attendance.js`

- Giữ nguyên meaning dữ liệu lưu Firestore/report:
  - `1 = Có mặt`
  - `2 = Nghỉ không phép`
  - `3 = Nghỉ có phép`
- Đổi UI cycle sang explicit order:

`0 → 1 → 3 → 2 → 0`

- Thay:

`const newStatus = (currentStatus + 1) % 4;`

bằng:

`const newStatus = _nextAttendanceStatus(currentStatus);`

- Cập nhật label:
  - `Vắng mặt` → `Nghỉ không phép`
  - `Có phép` → `Nghỉ có phép`

## Vì sao đây là cách sửa đúng

- Không đổi mã dữ liệu đã lưu cũ.
- Không ảnh hưởng thống kê tháng, báo cáo Zalo, xuất Excel.
- Không ảnh hưởng Admin.
- Chỉ sửa thứ tự thao tác UI để khớp với hướng dẫn trạng thái đang hiển thị.
- HLV thao tác trên web/mobile sẽ đi đúng thứ tự mong muốn.

## Kiểm tra đã chạy

- `node -c js/modules/attendance.js` — PASS
- `npm run check:coach-attendance-status-cycle-v5b` — PASS 7/7
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:coach-branch-runtime-repair` — PASS 25/25

## Lưu ý

Package trong phiên hiện tại có cache/version marker cũ hơn các bản V5A đã xuất trước đó. Nếu áp dụng vào bản V5A production, nên chép chính xác patch này vào `js/modules/attendance.js` của V5A thay vì thay toàn bộ source bằng package này nếu package đang deploy của bạn mới hơn.
