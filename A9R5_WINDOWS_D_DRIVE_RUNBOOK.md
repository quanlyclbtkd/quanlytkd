# Windows D:\A9R5 — Firebase Auth + Firestore demo-only validation

**Không upload GitHub. Không đăng nhập tài khoản thật. Không mở `D:\A9R5\source\index.html` để kiểm thử Auth.**

1. Tạo `D:\A9R5\source`, giải nén `QR_V11R6_A9R5_AUTH_FIRESTORE_QA_QR_EVIDENCE_TEST_ONLY_FULL_SOURCE.zip` vào đó, đảm bảo `D:\A9R5\source\tools\a9r5\coach-auth-firestore-emulator.test.mjs` tồn tại.
2. Mở PowerShell, `cd D:\A9R5\source`.
3. Kiểm tra `node -v`, `java -version`; máy trước đó đã dùng Firebase CLI 15.22.3. Chạy `npm.cmd ci --no-audit --no-fund` nếu chưa có dependencies (không dùng `npm audit fix` tự động).
4. Kiểm tra Rules SHA: `(Get-FileHash .\firestore.rules -Algorithm SHA256).Hash` phải bằng `23AAE5FCB7F0376E4DD14AC324942233DC1BF2690304F4B7521E86C878CC7DAD`.
5. Chạy **chỉ bộ test cách ly**, không chạy web app production: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\a9r5\Run-A9R5-Auth-Firestore.ps1`.
6. Script từ chối chạy nếu 8180/9099 đang có listener, thiếu Firebase CLI hoặc Rules SHA sai. Phải thấy `demo-a9r5-coach-auth` và hai emulator Firestore/Auth cùng bật. Bài kiểm thử tạo các tài khoản `example.invalid` trong emulator, không truy cập `quanly-tst`.
7. Chờ `A9R5_AUTH_FIRESTORE_RESULT` và exit code 0. Xem `qa_emulator_results_a9r5\coach-auth-firestore.json` và `qa_emulator_results_a9r5\coach-auth-firestore.raw.log`. Dòng `PERMISSION_DENIED` có thể là một ca DENY mong đợi; cần đọc kết quả từng ca.
8. Đóng gói: `Compress-Archive -Path .\qa_emulator_results_a9r5\* -DestinationPath D:\A9R5\A9R5_AUTH_EMULATOR_RESULTS.zip -Force`. Gửi ZIP này để kiểm tra. Không chia sẻ password thực.

## QR thực tế

Với một ca PASS và FAIL đã ẩn danh, mở `[Receipt] -> qrPixelAudit` rồi sao chép CHỈ `fieldsMatch` (bốn boolean), `memoTransform` (boolean và lengthDelta), `expectedMemoLength`, `qrMemoLength`, `stage`, `reason`, `kind` và HTTP status; không sao chép ảnh QR, EMV, họ tên, STK hoặc URL ngân hàng. Có thể lưu mỗi ca thành JSON sạch rồi chạy `node .\tools\a9r5\qr-evidence-analyzer.mjs .\qr_fail_sanitized.json .\qr_pass_sanitized.json`. Nếu bộ phân loại báo `MEMO_CHANGE_UNDETERMINED`, không sửa memo theo suy đoán.

**Khi các gate chưa đạt, chỉ duy trì bản TEST ONLY — NO_DEPLOY.**
