# Phase 4K-6V4B5 — Quit Tab Mobile Authoritative Render

Ngày hoàn thành: 27/06/2026

## 1. Vấn đề còn lại sau V4B4

Desktop đã hiển thị đủ tab **Đã nghỉ**, nhưng mobile vẫn có thể chưa hiển thị đủ hoặc bị rỗng trong một số phiên.

V4B4 đã sửa cache-bust và pagination mobile, nhưng khi kiểm tra sâu lại phát hiện thêm các điểm rủi ro chỉ xuất hiện rõ trên mobile:

1. `renderQuitIsland()` có thể chạy khi `studentProfileStore.isQuitLoaded() === true` nhưng cache HTML `quitRows` chưa được rebuild kịp.
2. Trong trạng thái đó, code cũ gọi `_applyHtml(_target, _htmlQ || '')`, nên nếu `_htmlQ` rỗng, mobile có thể bị xóa `#quitList` dù dữ liệu authoritative đã có.
3. `pgWrap_quitList` chỉ được tạo bởi pagination controller. Nếu mobile chưa chạy `_injectControls()`, `_syncQuitMobileControl()` không có DOM control để hiển thị nút tải thêm ngoài bảng.
4. Legacy `renderApp()` vẫn render quit rows không có `data-quit-id`, nên nếu mobile rơi vào legacy path/fallback path, các bộ đếm mobile vẫn có thể không nhận diện đúng rows.
5. Legacy row chỉ hiển thị `quitDate`, chưa lấy các trường nghỉ cũ như `ngayNghi`, `inactiveDate`, `stoppedDate`, `leftDate`, `nghiDate`.

## 2. Nguyên nhân chính xác

Lỗi không còn nằm ở Firestore query. Dữ liệu `quitProfiles` đã đầy đủ ở V4B3/V4B4.

Nguyên nhân còn lại là **thời điểm render mobile**:

```text
quitProfiles authoritative đã load
nhưng computation cache quitRows chưa kịp có HTML
→ renderQuitIsland xóa #quitList
→ mobile nhìn như chưa load danh sách Đã nghỉ
```

Desktop thường được render lại sau đó nên nhìn đúng, còn mobile dễ gặp blank/partial do tab switch, cache cũ hoặc island render chạy sớm hơn.

## 3. Nội dung sửa V4B5

### 3.1. Không xóa mobile quit list khi cache HTML rỗng

`renderQuitIsland()` hiện làm theo thứ tự:

1. Nếu `quitRows` cache có sẵn → render cache.
2. Nếu authoritative `quitProfiles` đã load nhưng cache rỗng → gọi `refreshListComputation('students.quitList')`.
3. Nếu cache vẫn rỗng → build trực tiếp từ authoritative `quitProfiles`.
4. Không dùng shared `pgState` của tab Đang tập.
5. Không clear `#quitList` trong trạng thái cache miss.

### 3.2. Tạo control mobile nếu chưa tồn tại

`_syncQuitMobileControl()` không còn chỉ `return` khi thiếu `pgWrap_quitList`.

Nó tự tạo:

```html
<div id="pgWrap_quitList" data-mobile-quit-control="1"></div>
```

và đặt ngoài `.table-wrapper`, để nút **Tải thêm** hiển thị rõ trên điện thoại, không bị kẹt trong vùng cuộn ngang/dọc của bảng.

### 3.3. Mobile control dùng đúng dữ liệu authoritative

Số lượng còn lại được tính từ:

```text
studentProfileStore.getQuitProfiles()
+ __store.profiles đã classify là quit
```

không dùng `pgState.currentItems`.

### 3.4. Legacy path cũng có `data-quit-id`

`renderApp()` legacy quit rows đã được bổ sung:

```html
<tr data-quit-id="..." data-profile-name="...">
```

Nhờ vậy nếu mobile rơi vào legacy fallback, bộ đếm DOM vẫn nhận diện đúng row Đã nghỉ.

### 3.5. Ngày nghỉ legacy được hiển thị đủ hơn

Module và legacy renderer đều dùng các trường:

```text
quitDate
ngayNghi
inactiveDate
stoppedDate
leftDate
nghiDate
```

## 4. Ảnh hưởng Reads

Không thêm Firestore query mới.

V4B5 chỉ sửa render/mobile DOM/cache. Nguồn dữ liệu vẫn là authoritative `quitProfiles` đã có từ V4B3.

## 5. Kiểm thử

- `npm run check`: PASS, exit code 0.
- `npm run check:all:critical`: PASS, exit code 0.
- Quit Tab Mobile Parity V4B5: 14/14 PASS.
- Quit Tab Authoritative Completeness V4B3: 9/9 PASS.
- Quit Tab Completeness V4B2: 12/12 PASS.
- Syntax: 232 items PASS.
- Inventory/Finance/Coach/Security gates vẫn đạt trong default và critical suite.

## 6. Kiểm tra sau deploy

Trên mobile:

1. Đóng tab trình duyệt cũ.
2. Mở lại trang sau deploy.
3. Đăng nhập Admin.
4. Mở tab **Đã nghỉ**.
5. Chờ reconciliation vài giây.
6. Nếu danh sách nhiều hơn trang đầu, nút **Tải thêm** phải xuất hiện bên ngoài bảng.
7. Bấm **Tải thêm** phải tăng số dòng `#quitList`.

Console:

```js
printProfileScaleMetrics?.()
debugStudentStatusSeparation?.()
getStudentsCacheMetrics?.()
```

Kỳ vọng:

```text
quitListDOMRows > 0
#quitList rows có data-quit-id
pgWrap_quitList tồn tại sau khi renderQuitList()
không clear #quitList khi quitRows cache miss
```
