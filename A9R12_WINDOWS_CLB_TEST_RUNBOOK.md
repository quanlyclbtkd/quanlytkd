# A9R12 — Hướng dẫn kiểm tra Điểm danh HLV bằng CLB test

## Nguyên nhân lỗi thực tế đã xác định

Giao diện roster và query trạng thái Điểm danh là hai luồng khác nhau. HLV có thể thấy tên võ sinh từ profile listener nhưng `AttendanceService.loadByDate()` vẫn bị Firestore từ chối. Khi đó `cacheReady=false`, nên write guard hiển thị “Danh sách ngày/cơ sở/ca này chưa tải xong”.

A9R11 Emulator 14/14 trước đây kiểm tra point get/create/update/deny, nhưng chưa kiểm tra chính `getDocs` collection query mà giao diện dùng. A9R12 bổ sung test list query.

A9R12 thay đổi:
- Coach attendance hiện tại chỉ dùng branch canonical `CS1..CS10`.
- Daily/monthly Coach query dùng `branch == CSn`, không dùng `branch in ['CS1','Mặc định']`.
- Rules Attendance dùng direct membership `branch in assignedBranches(currentUser())`, không tái sử dụng helper legacy/main_config cho list query.
- Writer/CAS/Journal V4/historyAuthority không đổi.
- Khi server Rules chưa đồng bộ, UI báo rõ lỗi permission thay vì chỉ báo “chưa tải xong”.

## Bước 1 — Cài dependencies

```powershell
cd D:\A9R12\source
npm.cmd ci --no-audit --no-fund
```

## Bước 2 — Chạy Emulator

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R12-Coach-Attendance-Emulator.ps1
```

Mục tiêu:
- `A9R12_QUERY_CLOSURE {"pass":8,"fail":0,"total":8}`
- `A9R12_OPERATIONAL {"pass":12,"fail":0,"total":12}`
- Emulator phải PASS cả 3 list-query mới: CS1, CS2 và deny CS3.

## Bước 3 — Đồng bộ Firestore Rules nếu CLB test dùng Firebase thật

Chỉ cập nhật source/hosting là chưa đủ. Nếu Firestore server vẫn dùng Rules cũ, `loadByDate()` sẽ tiếp tục `permission-denied`.

Chạy deploy Rules ONLY sau khi Emulator PASS:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R12-Deploy-Rules-Only.ps1 `
  -ProjectId quanly-tst `
  -ConfirmText "DEPLOY A9R12 COACH ATTENDANCE RULES"
```

**Lưu ý:** Lệnh trên thay Rules server cho project đã chỉ định. Không deploy Hosting. A9R12 Rules mở Coach Attendance cho mọi Coach hợp lệ theo `allowedBranches`, không riêng CLB test.

## Bước 4 — Cập nhật source A9R12 và kiểm tra CLB test

Đảm bảo trình duyệt tải build tag:
`qr-v11r6-a9r12-coach-attendance-query-closure-20261024`

Chuỗi kiểm tra:
1. HLV đăng nhập.
2. Chọn CS1 → Ca tập CS1 → roster đúng CS1.
3. Bấm một võ sinh → trạng thái thay đổi, không còn toast “danh sách chưa tải xong”.
4. Reload → trạng thái vẫn đúng.
5. Chọn CS2 → kiểm tra tương tự.
6. Cơ sở ngoài `allowedBranches` phải bị chặn.
7. Học phí/Báo nợ/Kho vẫn không truy cập được.

## Rollback khẩn cấp

Nếu phát hiện lỗi quyền/ghi sau khi deploy Rules, khóa server Coach Attendance mà không xóa dữ liệu:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R12-Emergency-Lock-Coach-Attendance.ps1 `
  -ProjectId quanly-tst `
  -ConfirmText "LOCK COACH ATTENDANCE"
```
