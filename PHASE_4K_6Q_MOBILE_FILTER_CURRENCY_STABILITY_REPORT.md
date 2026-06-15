# Phase 4K-6Q — Mobile Filter Responsive + Currency Input Stability

Ngày kiểm tra: 15/06/2026

## 1. Phạm vi kiểm tra

- Kiểm tra cấu trúc dự án Firebase + Vanilla JavaScript hiện tại.
- Phân tích lỗi chồng/lệch giữa bộ lọc **Kỳ / Tháng** và **Cơ sở** trên mobile.
- Kiểm tra trường **Học phí mặc định / tháng** khi nhập tiền trên máy tính.
- Sửa lỗi theo hướng production-safe, không đổi Firestore schema, không đổi business logic học phí.
- Chạy lại kiểm tra syntax, deploy package, GitHub Pages paths, runtime stability và scale/write safety.

## 2. Kết quả audit tổng thể

- Dự án có khoảng 310 file; 97 file JavaScript runtime trong thư mục `js/`; 155 công cụ kiểm tra trong `tools/`.
- `app.js`: khoảng 791 KiB, 13.188 dòng, 583 phép gán `window.*`.
- Có 174 global trùng giữa `app.js` và các module `js/**/*.js`.
- `app.js` vẫn là legacy kernel, trong khi hệ thống đã có module theo domain, service, listener, render isolation và diagnostics.
- Mức rủi ro tách file hiện tại: **MEDIUM**. Không nên rewrite toàn bộ; nên tiếp tục incremental extraction có ownership gate.

## 3. Nguyên nhân lỗi giao diện mobile

### Hiện tượng

Trên một số iPhone/Android/WebView, `input[type="month"]` rộng hơn cột grid và lấn sang ô chọn cơ sở.

### Nguyên nhân kỹ thuật

1. Mobile đang dùng hai cột `1fr 1fr`.
2. CSS Grid mặc định dùng minimum size theo nội dung (`min-width:auto`).
3. Native month/select control có intrinsic minimum width khác nhau theo trình duyệt, locale và font scaling.
4. `width:100%` không đủ để ép grid item/native control co nhỏ khi min-content width lớn hơn track.
5. Ở màn hình rất hẹp, hai trường tiếp tục bị ép nằm cùng hàng.

### Cách sửa

- Đổi track thành `minmax(0, 1fr)` để cho phép co thực sự.
- Đặt `min-width:0` cho từng grid child.
- Khóa input/select bằng `box-sizing:border-box`, `width/min-width/max-width` an toàn.
- Với viewport dưới 360px, tự động chuyển thành một cột.
- Không dùng user-agent detection hoặc danh sách model điện thoại; responsive theo kích thước thực tế.

## 4. Kiểm tra Học phí mặc định / tháng

### Kết luận trước sửa

- Không phát hiện luồng làm thay đổi ngẫu nhiên giá trị số trong hidden field.
- Giá trị lưu vẫn được lọc về chữ số và `updateAddPackageAmount()` chỉ tính `baseFee × package`, sau đó áp dụng giảm giá nếu có.
- Tuy nhiên có lỗi UX thật: handler cũ format lại toàn bộ chuỗi ở mỗi `input`, khiến caret thường bị đưa về cuối. Khi người dùng sửa ở giữa chuỗi trên máy tính, cảm giác như số bị “nhảy loạn”.
- Handler cũ cũng chưa có guard chống bind lặp và chưa xử lý IME composition.

### Cách sửa

- Tách sanitize và format thành các hàm ổn định, không dùng `Number/parseInt` để định dạng chuỗi dài.
- Giữ hidden raw value chỉ gồm chữ số.
- Khôi phục caret theo số lượng chữ số đứng trước caret, thay vì đưa caret về cuối.
- Thêm `compositionstart/compositionend` để tránh format giữa quá trình nhập.
- Dùng `WeakSet` chống gắn listener hai lần.
- Thêm `inputmode="numeric"`, tắt autocomplete và hướng dẫn định dạng.

## 5. File đã thay đổi

- `index.html`
  - Thêm responsive patch cho `#filterArea`.
  - Thêm thuộc tính bàn phím số và trợ giúp cho học phí mặc định.
- `style.css`
  - Đồng bộ responsive patch với CSS nguồn.
- `app.js`
  - Thay currency input handler bằng bản giữ caret, composition-safe, duplicate-binding-safe.
  - Thêm `APP_PATCH_VERSION` cho Phase 4K-6Q.
- `tools/check-mobile-filter-currency-stability.mjs`
  - Thêm static check và runtime simulation cho nhập `300000`, sửa giữa chuỗi, giá trị khởi tạo và chuỗi số lớn.
- `package.json`
  - Đăng ký check mới và đưa vào `npm run check`.

## 6. Kết quả kiểm tra

Đã pass:

- `npm run check`
- `npm run check:mobile-filter-currency-stability`
- `npm run check:legacy-app-reduction-readiness`
- `npm run check:deploy-package`
- `npm run check:github-pages-paths`
- `npm run check:runtime-stability-gate`
- `npm run check:scale-readiness-write-safety`
- Toàn bộ chuỗi `check:all:critical` được chạy thành hai lượt do giới hạn thời gian lệnh; tất cả script quan sát được đều pass.

Currency runtime simulation xác nhận:

- `300000` → hiển thị `300.000`.
- hidden raw value vẫn là `300000`.
- caret không bị đẩy về cuối khi sửa giữa chuỗi.
- bind lặp không làm callback chạy hai lần.
- `250000` khởi tạo thành `250.000`.
- Chuỗi số lớn không bị sai do floating-point khi chỉ định dạng hiển thị.

## 7. Bước nâng cấp tiếp theo

Nên bắt đầu giảm `app.js` ngay, nhưng không rewrite và không tách các luồng tài chính ghi Firestore trước.

### Phase đề xuất: 4K-6R — Legacy Global Ownership Consolidation + Low-Risk UI Extraction

Thứ tự an toàn:

1. Lập ownership map cho 174 global trùng; mỗi global chỉ có một owner chính.
2. Tách các helper thuần: currency/date/month/text normalization, modal helpers, input binding.
3. Chuyển các legacy body tương ứng thành bridge mỏng có fallback, không để hai implementation chạy song song.
4. Thêm static gate kiểm tra duplicate global và runtime gate kiểm tra double-binding.
5. Sau khi ổn định mới chuyển student UI actions; chưa đụng `processMultiItem`, `quickPay`, auth bootstrap, listener bootstrap và các write path tài chính.

Mục tiêu gate đầu tiên:

- `app.js` dưới 700 KiB.
- Dưới 11.500 dòng.
- Duplicate global dưới 120.
- Không tăng Firestore reads/writes.
- Tất cả critical checks và smoke test vẫn pass.
