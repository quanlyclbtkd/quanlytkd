# Chạy kiểm thử Điểm danh HLV A9R7 trên Windows (không chạm production)

1. Giải nén Full Source A9R7 vào `D:\A9R7\source`. Giữ nguyên A9R6.
2. Mở PowerShell:

```powershell
cd D:\A9R7\source
npm.cmd ci --no-audit --no-fund
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R7-Coach-Attendance-Demo.ps1
```

3. Script xác minh A9R6 pin 128 tệp, sinh thư mục mới `D:\A9R7\A9R7_DEMO_ACTIVE_ONLY_YYYYMMDD-HHmmss`, chuyển **hai chủ sở hữu Firebase config** sang project demo, tạo marker lịch sử mới, rồi chạy Firestore Emulator trên `127.0.0.1:8180` (từ firebase.json).
4. Kết quả ở `D:\A9R7\source\qa_results_a9r7\coach-readiness-offline.json` và `coach-attendance-demo.json`.
5. Nén kết quả và gửi lại:

```powershell
Compress-Archive -Path D:\A9R7\source\qa_results_a9r7\* -DestinationPath D:\A9R7\A9R7_COACH_ATTENDANCE_RESULTS.zip -Force
```

**Không mở phiên bản DEMO qua website production. Không dùng tài khoản HLV thật. Không chạy `firebase deploy`.** Bản source mặc định vẫn giữ khóa. File trong thư mục DEMO chỉ là fixture để kiểm tra cổng quyền và ghi CAS bằng Firestore Emulator; không phải bộ Firebase Auth staging có giao diện đăng nhập và chưa bao gồm nghiệm thu Android/iPhone, S01 thật hay Journal thực.

Nếu gặp lỗi ``Emulator running`` hoặc port 8180 bận, đóng Emulator cũ trước; không đổi sang địa chỉ Firestore thật. Nếu bị lỗi cấp quyền, gửi đủ `coach-attendance-demo.json`, không nới Rules để làm PASS.
