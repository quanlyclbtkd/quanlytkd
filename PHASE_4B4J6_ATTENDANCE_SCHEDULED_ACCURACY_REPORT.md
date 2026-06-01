# PHASE_4B4J6 — ATTENDANCE SCHEDULED SESSION ACCURACY REPORT

**Phase:** 4.0B-4J-6  
**Ngày:** 2026-05-31  
**Trạng thái:** ✅ Hoàn thành

---

## Tổng quan

Nâng cấp tab **Điểm danh** để thống kê chuyên cần chính xác theo lịch học thực tế, không chỉ theo các bản ghi đã được điểm danh.

---

## Những gì đã thêm

### Phase 1 — Scheduled Session Calculation

- **Thêm helper `getScheduledTrainingDatesForProfile(profile, monthStr, options)`** trong `js/modules/attendance.js`
  - Đọc `profile.trainingDays` / `profile.scheduleDays` để biết lịch học trong tuần
  - Trả về danh sách ngày phải tập trong tháng dạng `[{ date, weekday, shiftId, branch, expected }]`
  - Nếu võ sinh không có lịch, trả `[]` (warning nhẹ, không log PII)
  - **Không ghi Firestore**

### Phase 2 — Monthly Attendance Accuracy

- **Thêm helper `computeMonthlyAttendanceAccuracy(profile, monthStr, attendanceMap, options)`** trong `js/modules/attendance.js`
  - Output: `{ expectedSessions, presentCount, absentCount, excusedCount, missingAttendanceCount, lateCount, attendanceRate, completionRate }`
  - `expectedSessions` = tổng buổi phải học theo lịch trong tháng
  - `attendanceRate` = `presentCount / expectedSessions` (tính theo lịch học, không chỉ bản ghi)
  - `completionRate` = `(present + absent + excused) / expectedSessions`
  - Guard chống chia cho 0 khi `expectedSessions === 0`
  - **Không làm hỏng thống kê cũ** — thống kê cũ vẫn giữ nguyên, thêm mới song song

### Phase 3 — UI Monthly Stats Upgrade

- **Cập nhật `renderAttMonthly`** trong `js/modules/attendance.js`
  - Bổ sung `dateMap: {}` vào grouped object để theo dõi ngày → trạng thái theo võ sinh
  - **Mobile cards:** Thêm block lịch học (Phải học / Chưa ĐD / CC Lịch + Hoàn tất) bên dưới 4 ô thống kê cũ
  - **Desktop table:** Thêm 3 cột mới (📅 Phải học / ⏳ Chưa ĐD / 📊 CC Lịch + 🏁 HT) sau cột Chuyên cần cũ
  - Nếu võ sinh không có lịch: hiển thị `"Chưa có lịch học để tính chuyên cần chuẩn"`
  - Mobile responsive
  - Không xóa hay thay thế thống kê cũ

- **Cập nhật `index.html`:** Thêm 3 cột vào thead bảng `tbl_att_monthly`
- **Cập nhật colspan** từ 7 → 10 ở các nơi trong JS và HTML

### Phase 4 — Today Unfinished Attendance Warning

- **Thêm `window.printAttendanceSessionCompletion()`** trong `initAttendance()`
  - Output: `{ date, branch, shiftId, expectedProfilesCount, markedCount, missingCount, completed }`
  - Cảnh báo console khi còn võ sinh chưa điểm danh: `"Còn X võ sinh trong ca này chưa được điểm danh."`
  - Không spam; chỉ log 1 lần khi gọi
  - Không ghi Firestore

### Phase 5 — Report by Branch / Shift

- **Thêm `window.printAttendanceBranchReport(monthStr)`** trong `initAttendance()`
  - Nhận `monthStr` dạng YYYY-MM (mặc định tháng hiện tại)
  - Tổng hợp thống kê theo cơ sở và ca tập: `{ branch, shiftId, expectedSessions, presentCount, absentCount, excusedCount, missingAttendanceCount, attendanceRate }`
  - Không log tên võ sinh trong console
  - Không ghi Firestore

### Phase 6 — Check Tool

- **Tạo `tools/check-attendance-scheduled-accuracy.mjs`**
  - 12 checks: helper tồn tại, expectedSessions, missingAttendanceCount, attendanceRate, completionRate, no Firestore write, no PII, UI message, v.v.
  - Chạy: `node tools/check-attendance-scheduled-accuracy.mjs`

### Phase 7 — Report

- File này: `PHASE_4B4J6_ATTENDANCE_SCHEDULED_ACCURACY_REPORT.md`

---

## Không thay đổi

- ❌ Không rewrite app
- ❌ Không đổi schema Firestore
- ❌ Không đổi logic học phí / công nợ / kho
- ❌ Không deploy
- ❌ Không mở Firestore Rules public
- ❌ Không log PII (tên võ sinh)
- ❌ Không chuyển React

---

## Scripts mới trong package.json

```
"check:attendance-schedule": "node tools/check-attendance-scheduled-accuracy.mjs"
```

`check:all` đã được cập nhật để chạy thêm check này.

---

## Giải thích (tiếng Việt)

### 1. Tổng buổi phải học được tính thế nào?

`getScheduledTrainingDatesForProfile` đọc `profile.trainingDays` (mảng số 0–6 tương ứng CN–T7), rồi duyệt qua từng ngày trong tháng, kiểm tra thứ trong tuần có khớp không. Ví dụ: võ sinh học T2/T4/T6 (giá trị 1, 3, 5) → tháng 5/2026 có 13 buổi phải tập.

### 2. Chưa điểm danh khác Vắng thế nào?

- **Vắng (absentCount):** HLV đã bấm điểm danh và chọn trạng thái "Vắng mặt" (status=2) — tức là HLV đã xử lý buổi đó.
- **Chưa điểm danh (missingAttendanceCount):** Hôm đó có lịch học nhưng không có bản ghi nào trong Firestore — HLV chưa xử lý buổi đó.

### 3. Tỷ lệ chuyên cần mới tính thế nào?

`attendanceRate = presentCount / expectedSessions`

Ví dụ: võ sinh phải tập 13 buổi, có mặt 10 buổi → `10/13 = 76.9%`. Khác với cách cũ (chỉ tính trên bản ghi đã có), cách mới tính trên tổng buổi theo lịch.

### 4. Tỷ lệ hoàn tất điểm danh là gì?

`completionRate = (present + absent + excused) / expectedSessions`

Đây là tỷ lệ HLV đã xử lý / tổng buổi theo lịch. Nếu HLV điểm danh đủ (kể cả đánh vắng, phép) thì `completionRate = 100%`. Nếu còn buổi chưa xử lý (`missingAttendanceCount > 0`) thì `completionRate < 100%`.

### 5. Có ảnh hưởng dữ liệu cũ không?

**Không.** Thống kê cũ (present, excused, absent dựa trên bản ghi) vẫn giữ nguyên. Thống kê mới (expectedSessions, missingAttendanceCount, attendanceRate theo lịch) là phần bổ sung, tính hoàn toàn ở client-side, không ghi gì vào Firestore.

### 6. Còn cần nâng cấp gì cho điểm danh không?

- Cho phép HLV đặt lịch học theo kỳ (nghỉ lễ, thay đổi lịch tháng)
- Cảnh báo tự động khi ca tập có `missingAttendanceCount > 0` vào cuối ngày
- Xuất báo cáo chuyên cần lịch theo tháng ra file Excel
- Sync `missingAttendanceCount` lên profile để cảnh báo trên dashboard
