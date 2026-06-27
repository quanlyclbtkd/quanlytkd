# Phase 4K-6V4B6 — Quit Tab Mobile Full Authoritative List

Ngày hoàn thành: 27/06/2026

## 1. Vấn đề còn lại sau V4B5

Desktop đã hiện đủ danh sách võ sinh ở tab **Đã nghỉ**, nhưng mobile vẫn có thể chỉ hiện một phần danh sách.

Điểm quan trọng: Firestore và `quitProfiles` không còn là nguyên nhân chính. Bản V4B3/V4B5 đã lấy đủ dữ liệu. Lỗi còn lại nằm ở tầng render mobile.

## 2. Nguyên nhân chính xác

### 2.1. Mobile vẫn chấp nhận HTML cache có phân trang

Trong V4B5, khi `studentProfileStore.isQuitLoaded() === true`, `renderQuitIsland()` vẫn ưu tiên dùng:

```js
getStudentsCachedHtml('quitRows')
```

HTML cache này được tạo bởi computation renderer và vẫn bị giới hạn bởi `quitPage * PAGE_SIZE`.

Vì vậy trên điện thoại, dù `quitProfiles` đã đủ, renderer vẫn có thể dùng `quitRows` đã bị giới hạn trang đầu. Đây là lý do mobile vẫn không hiện toàn bộ danh sách.

### 2.2. Mobile control vẫn tính theo page limit

Control ngoài bảng `pgWrap_quitList` trong `js/modules/students.js` vẫn tính:

```js
_quitLimit = (window._quitPage || 1) * PAGE_SIZE
```

Nên mobile tiếp tục nghĩ rằng danh sách Đã nghỉ còn đang phân trang, thay vì hiển thị đủ toàn bộ.

### 2.3. V4B5 sửa cache miss, nhưng chưa sửa cache hit

V4B5 đã xử lý trường hợp cache rỗng. Nhưng trường hợp nguy hiểm hơn là cache **có dữ liệu nhưng chỉ là dữ liệu đã bị giới hạn**, thì V4B5 vẫn render cache đó. Đây là nguyên nhân chính khiến lỗi còn tái diễn trên mobile.

## 3. Bản sửa V4B6

### 3.1. Mobile bỏ qua cache phân trang khi dữ liệu Đã nghỉ đã sẵn sàng

Trong `js/ui/render/renderStudents.js`, nếu đang ở mobile và `quitProfiles` đã load, hệ thống luôn render trực tiếp từ nguồn authoritative:

```js
_buildAuthoritativeQuitRows({ mobileFull: true, forceAll: true })
```

Không dùng cache `quitRows` trong tình huống này.

### 3.2. Mobile render đủ toàn bộ `quitProfiles`

V4B6 thêm `forceAll`:

```js
const limit = forceAll ? entries.length : (page * pageSize)
```

Kết quả: trên mobile, số dòng render ra bằng toàn bộ số võ sinh đã nghỉ đã được load trong `quitProfiles`.

### 3.3. Mobile control không còn hiện nút tải thêm cho Đã nghỉ

`pgWrap_quitList` trên mobile hiện báo:

```text
Đã hiển thị đủ N võ sinh đã nghỉ
```

thay vì tiếp tục hiển thị nút tải thêm dựa trên page limit.

### 3.4. Desktop không bị thay đổi

Desktop vẫn giữ hành vi cũ:

- có thể dùng cache computation;
- vẫn có load-more nếu danh sách rất dài;
- không bị ảnh hưởng bởi logic mobile full render.

### 3.5. Không thêm Firestore reads

Bản sửa chỉ thay renderer. Không thêm query, không thêm listener, không dùng Cloud Functions, không cần migration.

## 4. Phạm vi file thay đổi

- `app.js` — đổi phase marker.
- `index.html` — cache-bust V4B6 cho app/main.
- `js/main.js` — cache-bust V4B6 cho các module liên quan Đã nghỉ.
- `js/ui/render/renderStudents.js` — mobile render đủ toàn bộ `quitProfiles`.
- `js/modules/students.js` — mobile control Đã nghỉ tính theo full authoritative list.
- `js/ui/render.js`, `js/ui/render/renderInvalidation.js`, `js/ui/render/listComputationRefresh.js` — cache-bust để tránh module mobile cũ.
- `tools/check-quit-tab-mobile-parity.mjs` — thêm kiểm tra V4B6.
- `tools/check-inventory-ledger-reconciliation.mjs` và `tools/check-coach-branch-runtime-repair.mjs` — cập nhật cache-bust regression check.

## 5. Kết quả kiểm thử

- `npm run check`: PASS.
- `npm run check:all:critical`: PASS.
- `check:quit-tab-mobile-parity`: 17/17 PASS.
- `check:quit-tab-authoritative-completeness`: 9/9 PASS.
- `check:quit-tab-completeness`: 12/12 PASS.
- `check-deploy-package`: 12/12 PASS.
- `check-github-pages-paths`: 18/18 PASS.
- `check-firestore-indexes`: 16/16 PASS.

## 6. Kiểm tra sau deploy

Trên điện thoại:

1. Đóng hẳn tab cũ.
2. Mở lại trang mới.
3. Đăng nhập Admin.
4. Mở tab **Đã nghỉ**.
5. Chờ reconciliation hoàn tất.
6. Danh sách phải hiện đủ toàn bộ võ sinh đã nghỉ, không cần bấm Tải thêm.

Console kiểm tra:

```js
debugStudentStatusSeparation?.()
getStudentsCacheMetrics?.()
```

Kỳ vọng:

```text
quitListDOMRows === số lượng quitProfiles đã load
pgWrap_quitList hiển thị "Đã hiển thị đủ ... võ sinh đã nghỉ"
renderQuitIsland trên mobile không dùng cache quitRows phân trang
```
