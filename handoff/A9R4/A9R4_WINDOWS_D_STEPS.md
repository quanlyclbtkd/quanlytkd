# A9R4 — Cách chạy kiểm tra trên Windows, lưu ổ D, không production

1. Giữ bản A9R3 đang hoạt động tại `D:\A9R3\source`. Tạo `D:\A9R4\source`, giải nén ZIP A9R4 vào đây. Không upload GitHub.
2. Trong PowerShell: `cd D:\A9R4\source` rồi `npm.cmd ci --no-audit --no-fund` (nếu đã có đúng dependencies trong thư mục riêng thì bước này không lặp).
3. Xác minh Rules bằng `(Get-FileHash .\firestore.rules -Algorithm SHA256).Hash`: phải là `23AAE5FCB7F0376E4DD14AC324942233DC1BF2690304F4B7521E86C878CC7DAD`.
4. Chạy `node tools/a9r4/coach-create-orphan-source.test.mjs` (dự kiến 6/6).
5. Chạy `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R4-Coach-Emulator.ps1` (bộ Rules thực 5 ca, demo project trên loopback; cần Node, Java, Firebase CLI/Emulator). *Chưa chạy ở môi trường tác giả*.
6. Đóng gói `qa_emulator_results_a9r4` để gửi kiểm tra. Lưu cả `coach-onboarding.json` và `coach-onboarding.raw.log`.
7. Không thử khôi phục UID Auth thật trên localhost vì JS đang cấu hình Firebase `quanly-tst`. Trước khi kiểm thử giao diện tạo/khôi phục Auth cần tạo **một bộ Auth+Firestore emulator cùng project demo**, tài khoản, clubId và settings giả lập, chứng minh primary+secondary Auth cùng trỏ demo.
8. Trong Firebase Console production, chỉ được **đọc/đối soát** Auth UID và tình trạng `clubs/{clubId}/coaches/{uid}` + `users/{uid}`. Không tự xóa UID, đổi Club, hoặc deploy Rules từ source TEST ONLY.
9. Khi đã có môi trường staging cách ly, kiểm thử tạo mới và khôi phục UID demo. Nếu xuất hiện `permission-denied`, xác minh Rules SHA của staging và nguyên nhân chính xác trước khi sửa.
10. QR: khi lỗi báo `QR_EMV_MISMATCH`, chỉ gửi snapshot an toàn của `qrPixelAudit.fieldsMatch`, `memoTransform`, `expectedMemoLength`, `qrMemoLength`; không gửi QR thô, số tài khoản, tên võ sinh, mật khẩu hay số tiền.

**Kết quả `Run-A9R4-Coach-Emulator.ps1` cần đạt 5 PASS, 0 FAIL. Điều này KHÔNG thay thế 34/34 A9R3, Playwright, QR provider thật hay S01/Journal.**
