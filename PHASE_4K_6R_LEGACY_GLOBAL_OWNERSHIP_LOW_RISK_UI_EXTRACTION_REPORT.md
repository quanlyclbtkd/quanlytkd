# PHASE 4K-6R — MOBILE FILTER HARDENING + LEGACY GLOBAL OWNERSHIP CONSOLIDATION + LOW-RISK UI EXTRACTION

**Ngày hoàn tất:** 15/06/2026  
**Bản nguồn:** Phase 4K-6Q — Mobile Filter + Currency Stability  
**Build:** `4K-6R-legacy-global-ownership-low-risk-ui-extraction-20260615`

---

## 1. Kết luận cuối sau khi kiểm tra lại bản 4K-6Q

Bản 4K-6Q **đã xác định đúng một phần nguyên nhân** của lỗi lệch vùng **Kỳ / Tháng – Cơ sở**, nhưng cách sửa chưa đủ chắc chắn cho các thiết bị iPhone/Android có chiều rộng phổ biến 375–430 CSS px.

Các khai báo `minmax(0, 1fr)`, `min-width: 0` và `box-sizing: border-box` là đúng hướng, nhưng bản 6Q vẫn giữ hai ô nằm cùng một hàng trên hầu hết điện thoại. Nó chỉ chuyển sang một cột khi màn hình nhỏ hơn hoặc bằng 359 px. Vì vậy, trên thiết bị 375, 390, 393, 412 hoặc 414 px, trường `input[type="month"]` vẫn có thể rộng hơn cột Grid do phần hiển thị native đã được bản địa hóa thành chuỗi dài như **“tháng 6 năm 2026”**.

Bản 6Q còn có một điểm chưa an toàn khác: rule ID `#filterArea` có `!important` được áp dụng không giới hạn theo breakpoint, nên có thể ghi đè `md:grid-cols-3` và làm vùng bộ lọc desktop tiếp tục chỉ có hai cột.

Bản 4K-6R đã sửa lại theo nguyên tắc không phụ thuộc model thiết bị:

- `<= 519px`: mỗi bộ lọc chiếm một hàng đầy đủ.
- `520–767px`: hai cột `minmax(0, 1fr)`.
- `>= 768px`: khôi phục đúng ba cột desktop.
- Wrapper và control đều có `min-width: 0`, `min-inline-size: 0`, giới hạn chiều rộng và chặn tràn native control.
- Không dùng user-agent sniffing.
- Không thay đổi ID, giá trị hoặc event của `filterMonth`, `filterBranch`, `searchInput`.

Đây là thay đổi quan trọng nhất so với 6Q: **không tiếp tục cố ép hai native control vào hai nửa màn hình trên điện thoại dọc**.

---

## 2. Phân tích chi tiết lỗi mobile

### 2.1. Cấu trúc thực tế

Vùng lọc gồm bốn Grid item:

1. `input#filterMonth` — `type="month"`.
2. `select#filterBranch`.
3. Ô tìm kiếm — `col-span-2` ở mobile.
4. Dòng ghi chú — ẩn ở mobile, `md:col-span-3` ở desktop.

Trên mobile, container còn bị trừ chiều rộng bởi:

- padding của `.app-container`;
- padding của `#filterArea`;
- khoảng cách Grid;
- padding và border của input/select.

Ở viewport 414 px, chiều rộng hữu dụng của mỗi cột chỉ còn khoảng 175–185 px. Trường tháng native tiếng Việt có thể cần chiều rộng lớn hơn mức này.

### 2.2. Bản 6Q đã sửa gì

Bản 6Q đã thêm:

- `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`;
- `min-width: 0` cho Grid item;
- `box-sizing: border-box` và `max-width: 100%` cho input/select;
- một breakpoint một cột ở `max-width: 359px`.

Những thay đổi này xử lý được trường hợp Grid item bị `min-width:auto`, nhưng chưa xử lý triệt để native form control trên các điện thoại rộng hơn 359 px.

### 2.3. Vì sao lỗi vẫn còn

Có bốn nguyên nhân:

1. **Breakpoint quá thấp.** Hầu hết điện thoại hiện dùng viewport 375–430 px nên vẫn chạy bố cục hai cột.
2. **Month input là native replaced element.** Cách trình duyệt hiển thị tháng, biểu tượng picker và chuỗi bản địa hóa không hoàn toàn giống input text thông thường.
3. **Chuỗi tiếng Việt dài.** “tháng 6 năm 2026” cần nhiều không gian hơn dạng ngắn `06/2026`.
4. **Kiểm thử 6Q chỉ kiểm tra source bằng regex.** Nó xác nhận CSS tồn tại nhưng chưa mô phỏng ma trận chiều rộng và native intrinsic width.

### 2.4. Lỗi phụ được phát hiện trong 6Q

Rule 6Q:

```css
#filterArea {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
}
```

không nằm trong media query. Vì selector ID có `!important`, nó có thể thắng utility `md:grid-cols-3`, khiến desktop không trở về ba cột như thiết kế ban đầu.

### 2.5. Phương án sửa được chọn

```text
Điện thoại dọc nhỏ / trung bình  → 1 cột
Điện thoại lớn / tablet nhỏ      → 2 cột
Desktop                           → 3 cột
```

Phương án này được chọn thay vì:

- giảm font hoặc padding để cố nhét hai ô;
- dùng `-webkit-appearance:none` có thể làm hỏng month picker;
- dò tên iPhone/Android;
- thay `input[type="month"]` bằng custom picker, phạm vi quá lớn và tăng rủi ro logic ngày tháng.

---

## 3. Nội dung sửa mobile trong 4K-6R

### 3.1. CSS runtime trong `index.html`

- Xóa breakpoint cũ `359px`.
- Thêm breakpoint an toàn `519px`.
- Khôi phục breakpoint desktop `768px`.
- Thêm logical sizing `min-inline-size`/`max-inline-size`.
- Chặn overflow tại wrapper để native control không đè sang cột bên cạnh.

### 3.2. CSS nguồn trong `style.css`

`style.css` được cập nhật đồng bộ với inline CSS. Trong build hiện tại, CSS chính đang được inline trong `index.html`; vì vậy cả hai nguồn phải giống nhau để tránh lần build sau đưa code cũ quay trở lại.

### 3.3. Regression checker

`tools/check-mobile-filter-currency-stability.mjs` được nâng cấp để bắt buộc kiểm tra:

- điện thoại phổ biến dùng một cột;
- mobile trung bình dùng hai cột;
- desktop trở lại ba cột;
- breakpoint 359 px cũ đã bị xóa;
- wrapper có khả năng shrink và clip overflow;
- `check`, `check:all`, `check:all:critical` đều chứa regression gate này.

### 3.4. Ma trận mô phỏng layout

Đã kiểm thử các viewport:

`320, 360, 375, 390, 393, 412, 414, 430, 480, 519, 520, 600, 767, 768, 1024 px`.

Bài kiểm thử còn mô phỏng trường tháng native có intrinsic width khoảng 220 px. Kết quả:

- không overlap giữa tháng và cơ sở;
- không vượt khỏi container;
- 320–519 px xếp dọc;
- 520–767 px hai cột;
- từ 768 px ba cột.

---

## 4. Kiểm tra lại Học phí mặc định / tháng

Phase 4K-6Q đã xử lý đúng phần nhập tiền:

- giá trị hiển thị có dấu chấm hàng nghìn;
- hidden value giữ chuỗi số thô;
- sửa ở giữa chuỗi không đẩy caret về cuối;
- không bind listener lặp;
- an toàn khi dùng IME/composition;
- không chuyển chuỗi tiền lớn qua floating-point để định dạng.

Phase 4K-6R không thay đổi business logic học phí. Regression test vẫn xác nhận:

- `300000` hiển thị `300.000`;
- hidden value là `300000`;
- sửa giữa chuỗi giữ caret đúng;
- giá trị lớn vẫn định dạng chính xác.

---

## 5. Kế hoạch Phase 4K-6R trước khi thực hiện

### Bước 1 — Đóng băng phạm vi

Cho phép:

- UI thuần DOM;
- localStorage không quan trọng;
- helper điều phối modal/read-only;
- ownership diagnostics.

Không cho phép:

- thay schema Firestore;
- thay query hoặc listener;
- thay Auth/bootstrap;
- thay write path tài chính;
- thay render kernel;
- rewrite toàn bộ `app.js`.

### Bước 2 — Xác nhận thứ tự bootstrap

Thứ tự thực tế:

```text
index.html
  → app.js legacy
  → đánh dấu legacy ready
  → main.js module
  → module override các API được duyệt
```

Điều kiện an toàn:

- `app.js` phải tiếp tục chạy được khi module lỗi/404 hoặc khi mở `file://`;
- module chỉ nhận owner sau khi legacy fallback đã tồn tại;
- inline handlers cũ vẫn gọi cùng tên global.

### Bước 3 — Lập inventory global

Baseline scanner chính xác chỉ đếm phép gán thật `window.X =`:

| Chỉ số | Trước 6R |
|---|---:|
| Kích thước `app.js` | 810.410 bytes |
| Số dòng | 13.188 |
| Phép gán `window.X =` thật | 344 |
| Global duy nhất trong `app.js` | 297 |
| Global duy nhất trong modules | 596 |
| Tên trùng app/module | 107 |

Checker legacy cũ dùng regex rộng nên báo 585 assignments và 174 duplicates. Hai cách đo phục vụ mục đích khác nhau; Phase 6R dùng bộ đếm chính xác để quyết định ownership.

### Bước 4 — Phân loại rủi ro

**Nhóm xanh — được chuyển canonical owner**

- `openMobileMenu`
- `closeMobileMenu`
- `_checkMonthlyReminder`
- `_dismissMonthlyReminder`
- `_openMonthlyExport`
- `openTaxModal`
- `closeTaxModal`

**Nhóm vàng — chỉ khai báo manifest, chưa chuyển trong phase này**

- `showToast`
- `closeModal`
- `switchTab`
- `openComboModal`
- `formatMonthCompact`

**Nhóm đỏ — cấm chuyển**

- `processMultiItem`
- `quickPay`
- `deleteTx`
- `markInvPaid`
- `cancelExamPayment`
- `initSaaSDatabase`
- `listenToData`
- `renderApp`
- `scheduleRender`

### Bước 5 — Tạo ownership manifest

Mỗi global phải có:

- canonical owner path;
- risk level;
- policy;
- quyền có/không được register.

Registry phải từ chối:

- global chưa có manifest;
- owner path không khớp;
- protected flow;
- owner collision.

### Bước 6 — Chuyển UI thấp rủi ro sang module

File mới `js/ui/legacyUiShell.js` chỉ chứa:

- DOM lookup;
- class/style toggle;
- localStorage safe access;
- read-only modal orchestration.

Không import Firebase và không chứa Firestore API.

### Bước 7 — Giữ guarded legacy fallback

Không xóa implementation khỏi `app.js` ngay. Chuyển phép gán sang:

```js
window.someFunction = window.someFunction || (() => { /* fallback */ });
```

Module là owner chính khi tải thành công; legacy vẫn bảo vệ slow network, module failure và rollback.

### Bước 8 — Khởi tạo registry sớm

Trong `main.js`:

1. `initGlobalOwnershipRegistry()`;
2. `initLegacyUiShell()`;
3. tiếp tục các initializer cũ.

Không để Auth hoặc Firestore write phụ thuộc registry mới.

### Bước 9 — Diagnostics và test

Bắt buộc có:

- `debugGlobalOwnership()`;
- `debugLegacyUiShell()`;
- collision count;
- canonical reference assertion;
- legacy fallback count;
- tests UI giả lập không cần Firebase.

### Bước 10 — Canary và rollback

- deploy một CLB trước;
- kiểm tra menu, reminder, Excel modal, tax modal;
- kiểm tra các write flow tài chính không đổi;
- có thể rollback bằng ZIP 6Q hoặc bỏ hai init mới trong `main.js`.

---

## 6. Tự rà soát kế hoạch trước khi code

Sau vòng rà soát thứ hai, các phương án sau bị loại:

1. **Xóa ngay code fallback khỏi `app.js`** — rủi ro module 404/slow network/file mode.
2. **Dùng Proxy chặn toàn bộ phép gán `window.*`** — có thể phá các module legacy ngoài phạm vi.
3. **Chuyển luôn `switchTab`, `showToast`, `closeModal`** — ownership cũ còn nhiều bridge, phạm vi quá rộng.
4. **Tách write flow tài chính để giảm số dòng nhanh** — không phù hợp low-risk phase.
5. **Đặt KPI giảm kích thước file ngay trong 6R** — dễ dẫn tới xóa fallback trước khi canary.

Phương án cuối được duyệt là:

> **module-primary + guarded legacy fallback + protected-flow manifest**.

---

## 7. Phase 4K-6R đã triển khai

### File mới

1. `js/core/globalOwnershipRegistry.js`
2. `js/ui/legacyUiShell.js`
3. `tools/check-global-ownership-ui-extraction.mjs`

### File cập nhật

1. `app.js`
   - guarded fallback cho 7 UI API;
   - guard thêm các bridge module đã có;
   - không sửa write/bootstrap/render flow.

2. `js/main.js`
   - import/init registry và UI shell;
   - build version 6R;
   - runtime smoke diagnostics.

3. `index.html`
   - cache-bust 6R;
   - mobile filter hardening;
   - desktop three-column restoration.

4. `style.css`
   - mirror mobile filter hardening.

5. `package.json`
   - thêm check 6R;
   - mobile filter gate nằm trong default/all/critical suites.

6. `tools/check-mobile-filter-currency-stability.mjs`
   - nâng cấp breakpoint/layout assertions.

7. `tools/check-mobile-superadmin-gate.mjs`
   - nhận canonical implementation từ `legacyUiShell.js`.

---

## 8. Kiến trúc ownership sau 6R

```text
app.js
  └─ guarded legacy fallback
       ↓ main.js tải thành công
GlobalOwnershipRegistry
  ├─ kiểm tra manifest
  ├─ lưu fallback reference
  ├─ chặn protected flow
  └─ cài canonical module function
       ↓
legacyUiShell.js
  └─ canonical owner của 7 UI globals
```

Runtime kỳ vọng:

- `registeredCount = 7`
- `manifestCount = 21`
- `collisionCount = 0`
- `fallbackCount = 7`
- tất cả canonical global có `installed = true`

---

## 9. Kết quả kiểm thử

### 9.1. Default suite

`npm run check` PASS:

- 100 JavaScript files;
- 8 inline scripts;
- tổng 108 syntax targets;
- mobile startup;
- lazy assets;
- Tailwind static build;
- mobile filter/currency regression;
- 98 ownership/UI extraction assertions;
- listener ownership;
- inventory read-only UI;
- financial action audit guard.

### 9.2. Deploy/runtime gates

PASS:

- `check:runtime-smoke-test`
- `check:deploy-package`
- `check:github-pages-paths`
- `check:mobile-superadmin-gate`
- `check:legacy-app-reduction-readiness`

### 9.3. Full and critical suites

`check:all` chạm giới hạn thời gian môi trường trong lần chạy gộp, không có test failure trước timeout. Các bước còn lại được chạy tiếp theo từng batch và đều PASS.

Toàn bộ 76 nhóm trong `check:all:critical` được chạy theo các batch để tránh timeout; các nhóm liên quan tài chính, học phí, nợ, thi đai, render, search, pagination, security, scale, listener, ownership đều PASS.

### 9.4. Mobile layout matrix

PASS tại 15 viewport từ 320 đến 1024 px, kể cả mô phỏng month input có intrinsic width 220 px.

---

## 10. Tình trạng `app.js` sau Phase 6R

| Chỉ số | 4K-6Q | 4K-6R |
|---|---:|---:|
| Dung lượng | 810.410 B | khoảng 810.455 B |
| Số dòng | 13.188 | 13.191 |
| Global duy nhất trong app | 297 | 297 |
| Duplicate theo scanner chính xác | 107 | 107 |

`app.js` chưa giảm là chủ đích. Phase 6R tạo ownership boundary trước khi xóa fallback. Giảm file ngay ở phase này sẽ làm rollback kém an toàn.

---

## 11. Canary checklist sau deploy

1. Xóa cache tab cũ hoặc mở cửa sổ riêng tư để chắc chắn nhận `index.html` mới.
2. Kiểm tra 375/390/414 px: Kỳ/Tháng, Cơ sở, Tìm kiếm phải xếp ba hàng, không đè nhau.
3. Kiểm tra 600 px: tháng và cơ sở cùng hàng, tìm kiếm hàng dưới.
4. Kiểm tra desktop >=768 px: tháng, cơ sở, tìm kiếm cùng ba cột.
5. Chạy Console:

```js
debugGlobalOwnership()
debugLegacyUiShell()
debugRuntimeSmokeTest()
```

6. Xác nhận không có:

- `owner-conflict`;
- `global-reference-replaced`;
- module 404;
- layout horizontal overflow.

7. Smoke test bằng dữ liệu test:

- thu học phí;
- thu gộp;
- xóa giao dịch;
- thu nợ kho;
- hủy lệ phí thi.

Các flow trên không được thay đổi bởi 6R nhưng vẫn cần xác nhận canary production.

---

## 12. Rollback

Không có migration dữ liệu.

Rollback nhanh:

1. deploy lại ZIP 4K-6Q; hoặc
2. bỏ import/init `globalOwnershipRegistry` và `legacyUiShell` trong `main.js`.

Guarded fallback trong `app.js` vẫn hoạt động.

---

## 13. Bước tiếp theo đề xuất

**Phase 4K-6S — Existing Module Global Ownership Adoption + Duplicate Formatter/UI Bridge Cleanup**

Phạm vi phù hợp:

- register thật `showToast`, `closeModal`, `openComboModal` qua registry;
- chốt một owner duy nhất cho `formatMonthCompact`;
- audit `switchTab` nhưng chưa chuyển nếu lifecycle chưa tương đương;
- thêm guard cấm module ghi đè global đã register;
- sau ít nhất một chu kỳ canary ổn định mới xóa 7 fallback của 6R khỏi `app.js`.

Không đưa vào 6S:

- write path tài chính;
- Auth/bootstrap;
- Firestore listeners;
- `renderApp`/`scheduleRender`;
- schema/query migration.

---

## 14. Kết luận

Phase 4K-6R đã hoàn thành theo hướng production-safe:

- sửa triệt để hơn lỗi lệch Kỳ/Tháng – Cơ sở trên điện thoại phổ biến;
- khôi phục đúng layout desktop ba cột;
- giữ nguyên currency input stability;
- tạo ownership manifest và registry;
- chuyển 7 UI global rủi ro thấp sang canonical module owner;
- giữ legacy fallback để rollback;
- bảo vệ toàn bộ write/bootstrap/listener/render flows;
- vượt qua các automated gate và layout matrix đã nêu.

Bản này phù hợp để deploy canary một CLB trước khi triển khai rộng.
