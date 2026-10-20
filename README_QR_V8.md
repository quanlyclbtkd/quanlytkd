# V8 — Sửa tải QR SVG và bộ giải mã trên trình duyệt

Ngày: 20/10/2026. Bản làm việc riêng từ `QR_V7_FULL_SOURCE_PACKAGING_FIXED(1).zip`.

Đã sửa trong owner xuất phiếu hiện có: yêu cầu trực tiếp Quicklink QR-only SVG, cho phép đúng biến thể PNG/SVG cùng nguồn và cùng tham số, kiểm tra SVG rồi rasterize thành PNG, xác minh pixel bằng jsQR cục bộ và đối chiếu EMV/CRC. Không cài polyfill `window.BarcodeDetector` hay tạo owner xuất phiếu mới.

Thu gộp nhiều khoản và Báo nợ tiếp tục gọi cùng `window.exportReceipt` và cùng hàng đợi. Nội dung hàm `processMultiItem`, hai delegate Báo nợ, code ghi tài chính, cấu hình tài khoản, Rules và topology listener giữ nguyên so với V7. Không thêm Firestore reader/writer.

Điểm cần biết:

- VietQR Quicklink đã đổi engine: URL `.png` có thể chuyển hướng 301 sang `.svg`; đích có thể trả `image/svg+xml` thật. V7 chặn redirect và chỉ nhận PNG.
- V8 hỗ trợ cả SVG đã kiểm tra và PNG hợp lệ, vẫn xuất ảnh phiếu PNG không mất dữ liệu. SVG chỉ được chứa các phần tử đồ họa cho phép và raster PNG/JPEG nhúng hợp lệ; script, event, CSS, URL bên ngoài và nội dung lạ đều bị chặn.
- jsQR 1.4.0 được đóng gói tại `js/vendor/`, nạp khi xác minh QR. Không cần BarcodeDetector gốc. Bundle gốc đã đối chiếu npm integrity, có giấy phép và provenance trong `tools/qr-v8/`.
- Giới hạn tải/kiểm tra nguồn QR là 15 giây, có abort; lỗi mạng được báo `QR_FETCH_NETWORK`. Không đổi lỗi mạng thành kết luận CORS chưa được chứng minh.
- Query phiên bản trong `index.html` và import helper đã đổi sang `qr-v8-redirect-safari-20261020`. Chỉ số này nhận diện phần sửa QR, không thay đổi version toàn hệ thống.

Kết quả kiểm tra của lần sửa: network 16/16; bộ handler QR 109/109; SVG 25/25; Chromium với provider thật 2/2; ma trận Chromium có kiểm soát 22/22 (gồm 2 ca lỗi mạng phải bị chặn). Ảnh nguồn/xem trước/tải xuống được đọc bằng ZXing-C++ và kiểm tra TLV/CRC độc lập. Đây là component E2E với dữ liệu, principal và settings giả lập; không phải full Firebase bootstrap hoặc kiểm thử iPhone thực.

Hồi quy kế thừa: 143/148 gate đạt; 5 gate không đạt đã tồn tại ở V7. Chưa xác nhận WebKit/Safari/iPhone thực, Android/Zalo hoặc quét bằng ứng dụng ngân hàng. WebKit thiếu thư viện hệ thống và việc cài thêm bị phê duyệt tự động từ chối; không thực hiện biện pháp vượt chặn. Không gọi đây là RELEASE READY, không tự triển khai và không ghi production.

Các tài liệu `QR_V7_*` trong gói là lịch sử V7, không phải kết quả hiện tại. Xem báo cáo V8 và log V8 được bàn giao riêng để phân biệt các lần chạy. Không dùng thông tin tài khoản `TEST ONLY` trong fixture để chuyển tiền.

## Chạy kiểm tra cục bộ

```bash
node tools/check-qr-v8-network-safari.mjs
node tools/check-qr-v7-actual-handlers.mjs
npm run check:qr-v4-payment-account-authority
npm run check:qr-report-render-payment-intent
npm run build:public
npm run check:root-public-parity
```

Các test handler dùng fixture PNG và đọc pixel thật; không cần Firestore. Test trình duyệt nằm trong `tools/qr-v8/browser.mjs` và `svg-security.mjs`, cần Node Playwright, Chromium, Python/Pillow/numpy và ZXing-C++ 2.3.0. `QR_BROWSER_SKIP_LIVE=1` dùng fixture, mặc định có gọi provider thật với tài khoản giả. Các biến `QR_CHROMIUM_EXECUTABLE`, `QR_BROWSER_EVIDENCE`, `QR_PROVIDER_IMAGE`, `QR_PROVIDER_SVG` chỉ phục vụ QA. `QR_BROWSER_BASELINE=1` kết hợp `QR_TEST_SOURCE_ROOT` dùng để tái hiện V7; không dùng trên V8.
