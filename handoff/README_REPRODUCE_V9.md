# Tái hiện kiểm tra V9 — local/staging, không production

Nguồn mới nhất và quyết định: `START_HERE_V9.md`, `handoff/QR_V9_BAO_CAO_SUA_LOI_VA_KIEM_TOAN.md`.

Môi trường đã dùng: Node 24.19.0, Firebase CLI 15.22.3 trong lockfile, Firestore Emulator 1.21.0, Java 21, Python 3.12, Playwright 1.56.0, Chromium 1194 và ZXing-C++ 2.3.0. Các công cụ này không được app tải vào production.

## Chuẩn bị trên Windows PowerShell

Trong thư mục nguồn đã giải nén; Java 21 phải có trong PATH/JAVA_HOME:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tools/requirements-qa.txt
.\.venv\Scripts\python.exe -m playwright install chromium
$env:PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
```

Chromium mặc định do Playwright cài được sử dụng; nếu dùng bản riêng, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE` đến executable. Linux/macOS có thể dùng virtualenv tương ứng và `PYTHON=/đường/dẫn/python`. Không cần sửa mã hay giả lập kết quả để chọn trình duyệt.

## Kiểm tra không dùng dữ liệu thật

```powershell
npm run check:root-public-parity
npm run check:syntax
npm run check:assets
npm run check:qr-v8-actual-handlers
npm run check:qr-v8-network
npm run check:qr-v9-attendance-batches
npm run check:qr-v9-cost-approval
npm run check:d1c3b7r2-mobile-css-runtime
npm run check:d1c3b7r2r5-shift-touch-closure
npm run check:d1c3b-debt-authoritative-profile-coverage
npm run check:d1c3b7-release-security
npm run check:d1c3b6-release-blockers
```

Security gate tự khởi động Emulator trên `127.0.0.1:8180` với project `demo-b7-coach-proof`, chạy 108 ca Rules và 6 kịch bản số đo. Không chạy song song hai gate cần cùng cổng. Nó phải FAIL/BLOCKED nếu chưa có quyết định READS của chủ hệ thống; JSON `pending` không làm gate xanh.

Sau khi nhận được bản ghi chấp thuận thật, đặt `D1C3B7_COST_APPROVAL_FILE` đến tệp đó rồi chạy lại security, B6, `check:all:critical` và `check:release`. Tệp phải khớp hash ứng viên và phép đo; sửa Rules/listener/phạm vi phải đánh giá lại. Không dùng tệp giả với `issuedBy: system_owner` để đóng gate.

Các script Chromium QR ở `tools/qr-v8/` còn cần Node Playwright ở runtime hoặc môi trường QA của người chạy và Python ZXing/Pillow; bộ chuẩn `check:qr-v8-actual-handlers`/network có thể chạy trực tiếp bằng Node. Nếu tái hiện browser suite ở máy khác, cài `playwright@1.56.0` vào môi trường QA riêng; các script V8 dùng biến `CODEX_PRIMARY_RUNTIME_NODE_MODULES` để xác định Node modules, `QR_CHROMIUM_EXECUTABLE` để chọn executable và `CODEX_PRIMARY_RUNTIME_PYTHON` để chọn Python. Những biến này chỉ dành cho tái hiện QA, không đưa vào code production. Log V9 đính kèm phân biệt component/fixture với provider thật. Chưa có kết quả Safari/iPhone vật lý.

`check:all:critical`/`check:release` đang BLOCKED vì quyết định READS; 12 gate lịch sử khác còn FAIL như báo cáo. Không dùng chỉ một lệnh PASS để suy ra toàn hệ thống RELEASE READY.
