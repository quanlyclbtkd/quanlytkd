# PHASE 4K-6Q — MOBILE FILTER & CURRENCY INPUT STABILITY

**Ngày kiểm tra:** 15/06/2026  
**Phạm vi:** Bản `Phase 4K-6P — Tailwind CDN Removal / Static CSS Build Complete`  
**Mục tiêu:** Kiểm tra tổng thể, sửa lệch bộ lọc trên mobile, xác minh hiện tượng nhập “Học phí mặc định / tháng”, bổ sung kiểm thử hồi quy và tạo bản triển khai hoàn chỉnh.

---

## 1. Kết luận điều hành

Bản hiện tại có nền tảng triển khai tốt: cú pháp hợp lệ, đường dẫn GitHub Pages đúng, cấu trúc deploy đầy đủ, Tailwind static CSS hoạt động và các cổng kiểm tra trọng yếu đều vượt qua.

Hai nội dung người dùng phản ánh đã được kiểm tra và xử lý:

1. **Bộ lọc Kỳ/Tháng – Cơ sở trên mobile thực sự có lỗi bố cục.** Nguyên nhân không nằm ở dữ liệu mà ở cách CSS Grid tính kích thước tối thiểu của `input[type="month"]`, đặc biệt khi trình duyệt WebKit/iOS hiển thị chuỗi tháng dài theo ngôn ngữ Việt Nam. Bản sửa đã chuyển sang lưới có khả năng co đúng, ép các phần tử con được phép thu nhỏ, đồng thời tự đổi sang một cột trên màn hình rất hẹp.
2. **“Học phí mặc định / tháng” không có lỗi tính sai số tiền khi nhập liên tục từ cuối chuỗi.** Tuy nhiên, logic cũ có lỗi trải nghiệm thật khi sửa hoặc xóa ở giữa số: mỗi lần nhập đều gán lại toàn bộ `.value`, làm con trỏ bị đẩy về cuối và tạo cảm giác số “nhảy loạn”. Bản sửa giữ đúng vị trí con trỏ, chống gắn listener trùng và vẫn lưu giá trị số thuần vào input ẩn.

**Trạng thái sau sửa:** phù hợp để triển khai pilot, với điều kiện upload đầy đủ toàn bộ gói và xóa cache bản cũ sau khi cập nhật.

---

## 2. Phân tích lỗi giao diện mobile

### 2.1. Hiện tượng từ ảnh thực tế

Tại vùng bộ lọc:

- Ô **KỲ / THÁNG** rộng bất thường.
- Ô **CƠ SỞ** bị dồn hoặc chồng sang vùng bên cạnh.
- Hai control không còn cân đối dù container vẫn nằm trong màn hình.
- Lỗi có xu hướng xuất hiện khác nhau giữa các kích thước mobile và trình duyệt.

### 2.2. Nguyên nhân gốc

CSS cũ dùng hai cột:

```css
grid-template-columns: 1fr 1fr !important;
```

Cấu hình này nhìn như hai cột bằng nhau, nhưng mỗi track vẫn chịu giới hạn `min-width:auto`/min-content của phần tử con. Native month input có kích thước nội tại riêng. Trên iOS Safari, tháng được hiển thị dạng chuỗi như “tháng 6 năm 2026”, nên kích thước tối thiểu của ô có thể lớn hơn phần chiều rộng được chia.

Chuỗi nguyên nhân:

1. `input[type="month"]` có intrinsic/min-content width.
2. Grid track dùng `1fr` nhưng không dùng `minmax(0, 1fr)`.
3. Grid item và input không có `min-width:0`.
4. Cột đầu bị phép nở theo nội dung; cột cơ sở bị ép hoặc tràn.
5. Selector cũ dựa vào `#filterArea > div:last-child` không bền vững vì phần tử cuối thực tế là ghi chú ẩn, không phải ô tìm kiếm.

Đây là lỗi responsive/CSS sizing, không phải lỗi Firebase, dữ liệu cơ sở hay Tailwind static build.

### 2.3. Phương án đã triển khai

Đã thêm lớp ổn định `PHASE 4K-6Q — MOBILE FILTER LAYOUT STABILITY` vào CSS runtime trong `index.html` và bản nguồn `style.css`:

- Dùng `repeat(2, minmax(0, 1fr))` thay vì `1fr 1fr`.
- Thêm `min-width:0` và `max-width:100%` cho mọi grid item trực tiếp.
- Ép `filterMonth`, `filterBranch`, `searchInput` dùng `width:100%`, `min-width:0`, `max-width:100%`, `box-sizing:border-box`.
- Bổ sung safeguard cho phần inner field của WebKit date/month input.
- Dùng selector cấu trúc rõ ràng cho ô tìm kiếm thay vì phụ thuộc `:last-child`.
- **320–409 px:** tự chuyển thành một cột; Tháng, Cơ sở và Tìm kiếm đều chiếm toàn hàng.
- **410–767 px:** giữ hai cột bằng nhau; Tìm kiếm chiếm cả hai cột.
- **Từ 768 px:** tiếp tục dùng bố cục desktop hiện có.

Cách này không dùng chiều rộng cố định theo từng model điện thoại, nên phù hợp với iPhone SE, iPhone tiêu chuẩn/Plus/Pro Max và nhiều thiết bị Android có viewport khác nhau.

### 2.4. Ma trận kiểm tra responsive

Đã kiểm tra các viewport mô phỏng bằng Chromium:

`320, 360, 375, 390, 409, 410, 414, 430, 480, 767, 768, 820 px`

Kết quả:

- Không control nào vượt khỏi `#filterArea`.
- Ở `<=409 px`, bố cục tự chuyển một cột.
- Ở `410–767 px`, hai cột bằng nhau và giữ khoảng cách 8 px.
- Ô tìm kiếm luôn chiếm trọn hàng bên dưới.
- Không còn hiện tượng tháng đè lên ô cơ sở.

**Giới hạn kiểm tra:** môi trường kiểm thử không chạy trực tiếp Safari thật trên iPhone. Tuy nhiên, bản sửa xử lý đúng nguyên nhân CSS min-content và có thêm rule dành cho WebKit. Cần thực hiện một vòng smoke test ngắn trên iPhone thật sau deploy để xác nhận phần hiển thị native cuối cùng.

---

## 3. Kiểm tra “Học phí mặc định / tháng”

### 3.1. Đánh giá logic cũ

Logic cũ thực hiện trên mỗi sự kiện `input`:

1. Xóa ký tự không phải số.
2. Gán số thuần vào input ẩn.
3. Format lại input hiển thị bằng dấu phân cách hàng nghìn.

Với thao tác gõ liên tục ở cuối, ví dụ `300000` thành `300.000`, dữ liệu vẫn đúng. Vì vậy nhận định “có thể phần này không lỗi” là đúng đối với luồng nhập cơ bản.

Tuy nhiên, khi đặt con trỏ vào giữa số rồi thêm/xóa, việc gán lại `target.value` khiến browser đưa caret về cuối. Người dùng thấy chữ số thay đổi vị trí và dễ nghĩ rằng số tiền bị nhảy. Ngoài ra, nếu hàm khởi tạo bị gọi lại trong lifecycle, listener cũ có thể bị gắn nhiều lần.

### 3.2. Bản sửa đã triển khai

Đã thay helper định dạng tiền bằng phiên bản `Phase 4K-6Q — Currency Input Stability`:

- Ghi nhớ số lượng chữ số đứng trước caret.
- Format chuỗi bằng dấu chấm phân cách nhưng không chuyển qua `Number` để tránh rủi ro precision với chuỗi lớn.
- Khôi phục caret về đúng vị trí logic sau khi format.
- Dùng `requestAnimationFrame` để tránh xung đột cập nhật selection của trình duyệt.
- Thêm cờ `data-currency-input-bound` để chặn bind listener trùng.
- Hỗ trợ `compositionstart/compositionend` cho bàn phím/IME.
- Đặt `inputMode="numeric"`, `autocomplete="off"`, `enterkeyhint="done"`.
- Đồng bộ input ẩn bằng chuỗi chỉ gồm chữ số.
- Vẫn gọi callback hiện có, bao gồm cập nhật tổng gói học phí.

Các trường quan trọng được áp dụng gồm:

- `add_fee_default_display` ↔ `add_fee_default_actual`
- `m_fee_display` ↔ `m_fee_actual`
- Các ô thu học phí, lệ phí thi, chi phí, kho đồ và thu gộp đang dùng cùng helper.

### 3.3. Tình huống đã xác minh

- Gõ `300000` → hiển thị `300.000`, giá trị thực `300000`.
- Chèn số ở giữa → caret giữ đúng theo vị trí chữ số, không nhảy về cuối.
- Backspace ở giữa → xóa đúng chữ số mong muốn.
- Dán `1.250.000 đ` → chuẩn hóa thành `1.250.000`, giá trị thực `1250000`.
- Gọi hàm bind lần thứ hai → không tạo listener thứ hai.
- Giá trị có nhiều số 0 đầu → được chuẩn hóa ổn định.

Kết luận: **không phát hiện lỗi tính toán tiền**, nhưng đã sửa một lỗi caret/format có thể tạo cảm giác số tiền nhảy loạn khi thao tác trên máy tính.

---

## 4. Tệp đã thay đổi

### `app.js`

- Thay helper format tiền bằng bản caret-safe.
- Chống listener trùng.
- Giữ tương thích với toàn bộ ID/input và callback cũ.

### `index.html`

- Thêm CSS runtime ổn định bộ lọc mobile.
- Thêm cache-bust cho `app.js`:

```html
app.js?v=mobile-filter-money-stability-20260615
```

### `style.css`

- Đồng bộ cùng block CSS responsive 4K-6Q để tránh mất sửa khi dùng file nguồn này về sau.

### `tools/check-mobile-filter-layout.mjs`

- 12 cổng kiểm tra cấu trúc CSS và responsive của vùng bộ lọc.

### `tools/check-currency-input-stability.mjs`

- 12 cổng kiểm tra helper tiền, caret, IME, normalize và listener guard.

### `package.json`

- Thêm:
  - `check:mobile-filter-layout`
  - `check:currency-input-stability`
- Ghép hai gate mới vào `check`, `check:all`, `check:all:critical`.

---

## 5. Kết quả kiểm thử sau sửa

### Kiểm tra chính

- `npm run check`: **PASS**
- Syntax: **106/106 mục hợp lệ**
- Mobile filter gate: **12/12 PASS**
- Currency input gate: **12/12 PASS**
- Mobile startup performance: **PASS**
- Lazy assets loading: **PASS**
- Tailwind static CSS build: **PASS**
- Listener ownership boundary: **PASS**
- Inventory multi-item read-only UI: **PASS**
- Financial action audit guard: **PASS**

### Kiểm tra triển khai

- `npm run check:deploy`: **PASS**
- GitHub Pages paths: **18/18 PASS**
- Deploy package structure: **12/12 PASS**
- Runtime smoke test: **12/12 PASS**
- Bộ `check:all` toàn hệ thống đã chạy thành công sau thay đổi.

Không phát hiện lỗi cú pháp, thiếu file triển khai, đường dẫn module tuyệt đối sai hoặc phá vỡ các gate nghiệp vụ hiện có.

---

## 6. Đánh giá tổng thể hệ thống hiện tại

### Điểm tốt

- Không có ID HTML bị trùng: **517 ID duy nhất**.
- Hệ thống có bộ kiểm thử regression rất rộng cho học phí, báo nợ, thi đai, dashboard, search, pagination, runtime và deploy.
- Đường dẫn module tương thích GitHub Pages.
- Firebase Hosting contract hợp lệ.
- Tailwind CDN đã được thay bằng static CSS, giảm phụ thuộc runtime.
- Các luồng tài chính trọng yếu đã có write intent guard và audit trail.
- Các module mới đang dần cô lập listener, render và inventory UI khỏi legacy kernel.

### Rủi ro còn tồn tại

#### 1. Hai nguồn CSS runtime chưa thống nhất — mức ưu tiên cao

`index.html` đang chứa khoảng **40.431 ký tự inline CSS**, trong khi `style.css` chứa khoảng **70.577 ký tự CSS** và hai nội dung không giống nhau. Runtime hiện dựa nhiều vào inline CSS, nên người sửa có thể chỉnh `style.css` nhưng giao diện thật không thay đổi, hoặc chỉnh inline mà bỏ quên file nguồn.

Đây là nguyên nhân tiềm ẩn khiến lỗi giao diện “đã sửa nhưng deploy vẫn còn” tái diễn.

#### 2. `app.js` vẫn là legacy monolith — mức ưu tiên cao

- Kích thước khoảng **810 KB**.
- Khoảng **13.186 dòng**.
- Có khoảng **582 phép gán `window.*`**.
- Có khoảng **174 tên global trùng** giữa `app.js` và hệ module.

Hệ thống vẫn chạy, nhưng nguy cơ shadow function, thứ tự tải, bridge bị ghi đè và khó xác định source-of-truth còn cao.

#### 3. Inline event handler còn nhiều — mức ưu tiên trung bình

Trong `index.html` còn ít nhất:

- 103 `onclick`
- 35 `onchange`
- 10 `oninput`
- 2 `onsubmit`
- 2 `onkeydown`

Điều này tiếp tục ràng buộc HTML với global `window`, làm chậm quá trình tách legacy kernel và khó quản lý listener lifecycle.

#### 4. Viewport đang khóa zoom — mức ưu tiên trung bình

Meta viewport hiện có `maximum-scale=1.0, user-scalable=0`. Cấu hình này có thể ảnh hưởng khả năng phóng to của người dùng và tiêu chí accessibility. Không liên quan trực tiếp đến lỗi lệch hiện tại, nhưng nên xem xét loại bỏ sau khi kiểm thử giao diện.

#### 5. Kiểm thử thiết bị thật chưa được tự động hóa — mức ưu tiên trung bình

Các gate hiện tại mạnh về code/static contract. Hệ thống vẫn cần visual regression bằng browser thật hoặc browser engine tương ứng, đặc biệt Safari/WebKit, để phát hiện lỗi native control, font rendering và safe-area.

---

## 7. Bước nâng cấp tiếp theo được đề xuất

# Phase 4K-6R — CSS Runtime Source-of-Truth Consolidation + Responsive Visual Regression Gate

Đây là bước nên thực hiện ngay sau 4K-6Q, trước khi tiếp tục tách nghiệp vụ lớn khỏi `app.js`.

### Mục tiêu

1. Chỉ còn **một nguồn CSS chính thức** cho giao diện runtime.
2. Không còn tình trạng inline CSS và `style.css` phát triển lệch nhau.
3. Mọi thay đổi responsive đều được test trên ma trận viewport cố định.
4. Không đổi business logic, Firestore structure, HTML ID hoặc giao diện đã ổn định.

### Phương án tốt nhất

- Tách inline runtime CSS từ `index.html` sang một file source rõ ràng, ví dụ `css/app.css`.
- `index.html` chỉ `<link>` tới CSS static đã build/versioned.
- Nếu cần tối ưu first paint, dùng build script để tạo critical CSS từ cùng source, không chỉnh hai nơi thủ công.
- Bảo toàn thứ tự cascade hiện tại bằng snapshot computed style trước/sau.
- Thêm visual/layout gate cho các viewport:
  - 320, 360, 375, 390, 414, 430, 768, 1024, 1366 px.
- Kiểm tra riêng các vùng dễ lỗi:
  - Header mobile và stat pills.
  - Tabs ngang.
  - Bộ lọc Tháng/Cơ sở/Tìm kiếm.
  - Dòng thu học phí và nút thao tác.
  - Modal cấu hình và input tiền.
  - Safe-area trên iPhone.
- Chỉ sau khi 4K-6R ổn định mới tiếp tục **Phase 4K-6S — Legacy app.js Kernel Reduction + Inline Handler Migration**.

### Tiêu chí hoàn thành 4K-6R

- Một CSS source-of-truth.
- Không khác biệt giao diện ngoài các sửa lỗi được phê duyệt.
- Không control tràn ngang tại toàn bộ viewport test.
- Visual snapshots có baseline và diff threshold.
- `npm run check`, `check:all:critical`, deploy checks đều PASS.

---

## 8. Hướng dẫn triển khai bản 4K-6Q

1. Upload **toàn bộ nội dung trong gói ZIP**, không chỉ riêng `index.html`, `app.js` hoặc `style.css`.
2. Giữ nguyên cấu trúc thư mục `js/`, `css/`, `tools/`.
3. Sau deploy, mở trang bằng tab ẩn danh hoặc hard refresh.
4. Trên iPhone/PWA đã cài, đóng hoàn toàn ứng dụng rồi mở lại để loại cache cũ.
5. Smoke test nhanh:
   - Mở tab Học phí ở màn hình 320–430 px.
   - Kiểm tra Tháng và Cơ sở không đè nhau.
   - Nhập `300000`, sửa/xóa một chữ số ở giữa.
   - Xác nhận giá trị vẫn đúng và con trỏ không nhảy về cuối.
   - Lưu cấu hình rồi tải lại trang để xác nhận dữ liệu giữ nguyên.

---

## 9. Trạng thái cuối

**Phase 4K-6Q hoàn thành.**  
Bản sửa không thay đổi schema Firestore, không thay đổi logic tính học phí, không đổi HTML ID và không can thiệp các luồng thu/chi. Phạm vi thay đổi được giới hạn ở responsive layout, helper nhập tiền, cache-bust và regression checks.
