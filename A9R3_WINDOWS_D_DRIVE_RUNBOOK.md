# Chạy kiểm toán Firestore Emulator A9R3 trên Windows ổ D

**Chỉ DEMO, không deploy.** Không chỉnh mã gốc `D:\A9R2\source` và không đăng nhập Firebase production.

1. Tạo `D:\A9R3\source` và `D:\A9R3\evidence`. Giải nén **ZIP Full Source A9R3** vào `D:\A9R3\source`, sao cho trực tiếp có `firestore.rules`, `package.json`, `Run-A9R3-Emulator.ps1`, `tools\a9r3\coach-acl-emulator.test.mjs`.
2. Mở Windows PowerShell, chạy:

   ```powershell
   cd D:\A9R3\source
   (Get-FileHash .\firestore.rules -Algorithm SHA256).Hash
   ```

   SHA bắt buộc: `23AAE5FCB7F0376E4DD14AC324942233DC1BF2690304F4B7521E86C878CC7DAD`.
3. Có Node.js 22 và JDK 21 cùng Internet để tải phụ thuộc lần đầu. Kiểm tra `node -v`, `npm.cmd -v`, `java -version`.
4. Chạy:

   ```powershell
   cd D:\A9R3\source
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Run-A9R3-Emulator.ps1
   ```

5. Xem `D:\A9R3\source\qa_emulator_results_a9r3\A9R3_RULES_RESULTS.json`. Kỳ vọng 34 PASS, 0 FAIL, exit 0. **Kết quả này chưa được xác minh trong môi trường xây dựng ZIP.** DENY hiện PERMISSION_DENIED màu đỏ có thể là đúng; dựa vào JSON + exit code.
6. Gửi lại tệp ZIP evidence bằng PowerShell:

   ```powershell
   Compress-Archive -Path 'D:\A9R3\source\qa_emulator_results_a9r3\*' -DestinationPath 'D:\A9R3\A9R3_EMULATOR_RESULTS.zip' -Force
   ```

Đặc biệt xác minh case `DENY Rules-only direct batch with stale mirror expectedVersion` phải PASS (nghĩa là đã DENY) **và** case `ALLOW repair transaction with mismatched mirror assignmentVersion` vẫn PASS. Không nới Rules để chạy được. Nếu không đạt cả hai, giữ `RELEASE_HOLD`.

Giới hạn: Rules so `assignmentPreviousVersion` do request cung cấp với bản hiện tại, không chứng minh request là transaction. Transaction CAS từ `savePair()` vẫn bắt buộc trong repair. Khi Admin biết được version hiện tại và cố tình gửi batch ngoài ứng dụng, Rules không thể phân biệt nguồn giao dịch chỉ bằng trường previousVersion.
