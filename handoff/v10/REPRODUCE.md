# Tái hiện V10

Chỉ dùng project demo-* và Firestore Emulator, dữ liệu giả lập. Đợt này đã dùng Node 24 và JDK 21; dùng npm ci theo lockfile. Không chạy các bài fault injection lên Firebase production.

Các gate không cần Emulator chạy bằng `python3 tools/run-v10-audit.py`. Hai script mới có thể chạy riêng:

```bash
node tools/check-v10-legacy-mutations.mjs
node tools/check-v10-offline-authority.mjs
```

Thiết lập Python Playwright/Pillow/zxing-cpp trong môi trường QA; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` trỏ Chromium và `PYTHONPATH` trỏ dependency Python nếu chưa cài trong interpreter hiện tại. QR browser suites dùng Node Playwright trong `CODEX_PRIMARY_RUNTIME_NODE_MODULES` hoặc môi trường tương ứng; kiểm phiên bản/bản quyền vendor như các thư mục tools/qr-v7, qr-v8.

```bash
firebase emulators:exec --only firestore --project demo-coach-v10 "node tools/check-v10-coach-join.mjs"
firebase emulators:exec --only firestore --project demo-mobile-coach-v10 "node tools/v10/mobile-staging.mjs"
```

Để chạy bộ phát hành, đặt `D1C3B7_COST_APPROVAL_FILE=handoff/OWNER_READS_APPROVAL_V10.json`. Không sửa hash/giới hạn trong hồ sơ để làm gate xanh khi đổi candidate. Phải đo lại và đối chiếu phạm vi chủ hệ thống đã chấp thuận.

```bash
npm run check:release
npm run check:all:critical
```

**Kết quả hiện tại phải exit 1 tại check:v10-release-risk-boundary**, vì còn lỗi S01/O01. Có thể tái hiện riêng bằng `node tools/check-v10-release-risk-boundary.mjs`; cần CLI/JDK/Emulator như trên. `diagnose-release-risks.mjs` là reproducer tìm phản ví dụ, exit 0 của reproducer không có nghĩa an toàn.

QR có kiểm soát:

```bash
QR_BROWSER_SKIP_LIVE=1 QR_PROVIDER_SVG=tools/qr-v8/fixtures/provider-synthetic.svg node tools/qr-v8/browser.mjs
node tools/qr-v8/svg-security.mjs
```

QR live chạy riêng từng nút bằng QR_BROWSER_LIVE_ONLY=1 và QR_BROWSER_ENTRY=debt hoặc multiitem. Ghi cả lỗi transport, reason, stage, MIME, redirect, thời gian và build. Không đổi timeout/bỏ xác minh để biến ca mạng thất bại thành PASS. Không thực hiện chuyển tiền.

Tất cả cấu hình Pixel/iPhone trong script mobile-staging dùng Chromium touch emulation. Nghiệm thu điện thoại vật lý và Safari là bước riêng. Source production không chứa các cấu hình giả lập hoặc mock principal của harness.
