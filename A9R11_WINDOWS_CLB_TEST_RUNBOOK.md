# A9R11 — HƯỚNG DẪN KIỂM TRA BẰNG CLB TEST

1. Giải nén source vào `D:\A9R11\source`.
2. Chạy `npm.cmd ci --no-audit --no-fund`.
3. Trước khi chạm Firebase thật, chạy Emulator:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R11-Coach-Attendance-Emulator.ps1`
4. Nếu Emulator PASS, có thể chạy local UI bằng `npm.cmd run local`.
5. Muốn test với tài khoản CLB test trên Firebase thật, server phải dùng A9R11 `firestore.rules`; nếu server vẫn là Rules cũ thì HLV sẽ bị `permission-denied` dù UI A9R11 đã mở.
6. Việc deploy Rules A9R11 lên project chung sẽ mở quyền server cho mọi Coach hợp lệ theo `allowedBranches`; production website cũ vẫn chặn ở client, nhưng authorization server đã mở.
7. Kiểm tra bằng ngày/ca chưa có attendance authority cũ. Không xóa/migrate attendance cũ để ép test PASS.
8. Test: login Coach → chọn CS1 → Ca tập → roster → Có mặt/Nghỉ → reload → chọn CS2 → lặp lại → thử cơ sở ngoài quyền (phải deny) → Học phí/Báo nợ/Kho vẫn không truy cập.
9. Nếu có permission/branch/CAS lỗi, dừng và lưu Console; không tạo writer khác.
10. Rollback Rules: copy `firestore.rules.a9r11.rollback` thành `firestore.rules` rồi deploy rules để khóa Coach attendance; không xóa dữ liệu.

A9R11 không tự deploy production.
