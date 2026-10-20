# D1C3B7R2R6R3 — QR Phiếu báo V7 EXPERIMENTAL / TEST ONLY

SOURCE PATCH TESTED — NOT DEPLOYED. GLOBAL RELEASE BLOCKED. IPHONE FIX NOT CERTIFIED.

Đây là bản FULL của dự án gốc đã sửa trong sandbox, không phải patch rời hay gói chỉ có public. Chưa đủ điều kiện triển khai. Đọc QR_V7_BAO_CAO_KET_QUA.md trước khi sử dụng. Những báo cáo phase cũ trong dự án là lịch sử và không thay thế quyết định V7.

Giới hạn cần thấy ngay: production renderer cần BarcodeDetector để đối chiếu pixel QR; nếu thiếu sẽ trả QR_VERIFICATION_UNAVAILABLE. jsQR dưới tools/ chỉ phục vụ kiểm thử, không được âm thầm đưa vào public. Tích hợp decoder dùng được trên Safari cần một change request riêng. Chưa có xác nhận Safari/iPhone, bank app hoặc CORS iPhone.

Không thay ngân hàng/cơ sở thật theo fixture. Không chuyển tiền vào tài khoản giả lập trong ảnh thử nghiệm.

Chạy kiểm tra từ thư mục gốc của dự án:

```sh
node tools/check-qr-v7-actual-handlers.mjs
npm run check:h8r2-1c1f-quickpay
npm run build:public
npm run check:root-public-parity
npm run check:all:critical
npm run check:release
```

109 kiểm thử V7 gồm thân hàm thực tế, DOM double, spy SDK và jsQR đọc PNG; không phải chứng nhận thiết bị thật. Một số fixture được mã hóa độc lập bằng Python nên cần Python 3, reportlab và Pillow. pngjs 7.0.0 và jsQR 1.4.0 được giữ dưới tools/qr-v7/vendor cho kiểm thử; không làm tăng production bundle. Browser component test cần Node Playwright/Chromium và html2canvas cache đã kèm dưới tools; có thể chỉ định QR_CHROMIUM_EXECUTABLE. Trong môi trường Work, CODEX_PRIMARY_RUNTIME_NODE_MODULES được dùng để tìm Playwright; ngoài Work phải cài dependency kiểm thử tương ứng. Không có Python playwright / /usr/bin/chromium cho hai gate CSS kế thừa thì chúng vẫn phải báo FAIL, không bỏ qua.

```sh
node tools/qr-v7/browser.mjs
```

Browser test cố ý loại Firebase bootstrap, dùng HTML/control/handler thật, fixture và test-only pixel decoder. Có thể đặt QR_PROVIDER_IMAGE tới PNG provider đã kiểm độc lập để phát lại ảnh; không dùng cơ chế này để tự nhận CORS thực đã đạt. Không có xác thực thiết bị thì không gọi QR END-TO-END CLOSED.
