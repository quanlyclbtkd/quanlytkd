# Phase 4K-6V4B4 — Quit Tab Mobile Parity

Ngày hoàn thành: 27/06/2026

## 1. Hiện tượng

Desktop đã load đủ danh sách tab **Đã nghỉ** sau V4B3, nhưng trên giao diện điện thoại vẫn không load hoặc bị trống/thiếu danh sách.

## 2. Nguyên nhân chính xác

Lỗi không còn nằm ở Firestore query Đã nghỉ. V4B3 đã lấy đủ `quitProfiles`. Lỗi nằm ở pipeline render mobile và cache ES modules.

### Nguyên nhân 1 — Mobile vẫn dùng module cũ vì cache-bust chưa đồng bộ

Một số module liên quan Đã nghỉ vẫn dùng query string cũ:

```text
modules/students.js?v=coach-branch-runtime-repair-20260627-v4b1
studentsRenderer.js?v=quit-tab-completeness-20260627-v4b2
```

Desktop sau khi hard refresh thường tải lại đủ, nhưng mobile có thể giữ cache module cũ. Vì vậy app.js/main.js mới đã deploy, nhưng mobile vẫn chạy logic render/pagination cũ.

### Nguyên nhân 2 — Mobile fallback đếm sai row của tab Đã nghỉ

Renderer authoritative của Đã nghỉ tạo row dạng:

```text
<tr data-quit-id="...">
```

Nhưng fallback pagination mobile lại kiểm tra:

```text
#quitList tr[data-student-id]
```

Do không thấy row, nó tưởng render island thất bại và có thể chạy fallback.

### Nguyên nhân 3 — Mobile dùng shared pagination của tab Đang tập cho Đã nghỉ

Control ngoài table trên mobile `pgWrap_quitList` dùng pagination chung `pgState`. `pgState` thường là trang Đang tập hoặc một trang partial, không phải toàn bộ `quitProfiles`. Khi fallback chạy, nó có thể ghi đè `#quitList` bằng dữ liệu rỗng/partial.

## 3. Thay đổi đã thực hiện

### 3.1. Đồng bộ cache-bust V4B4

Cập nhật entrypoints và nested imports liên quan Đã nghỉ sang:

```text
quit-tab-mobile-parity-20260627-v4b4
```

Bao gồm:

- `app.js`
- `main.js`
- `js/modules/students.js`
- `js/ui/render.js`
- `js/ui/render/renderStudents.js`
- `js/ui/render/renderInvalidation.js`
- `js/ui/render/listComputationRefresh.js`
- `js/ui/render/computation/studentsRenderer.js`
- `js/listeners/profiles.listeners.js`

### 3.2. Khóa quyền sở hữu #quitList cho authoritative quitProfiles

Sau khi `studentProfileStore.isQuitLoaded()` là true:

- `renderQuitIsland()` chỉ render từ `quitRows` được build từ `quitProfiles`.
- Không fallback sang shared server pagination.
- Không để active pagination ghi đè `#quitList`.

### 3.3. Sửa mobile external load-more control

`pgWrap_quitList` không còn dùng `renderPaginationControls(pgState, 'students_quit')` sau khi `quitProfiles` đã load.

Nó chuyển sang cùng logic desktop:

```text
window._loadMore('quit')
```

và tính số còn lại từ authoritative `quitProfiles`.

### 3.4. Sửa row-count và fallback selector

Mobile fallback hiện đếm cả:

```text
tr[data-quit-id]
tr[data-student-id]
```

và không được overwrite nếu `quitProfiles` authoritative đã loaded.

### 3.5. Sửa debug diagnostics

`debugStudentStatusSeparation()` hiện đếm đúng row Đã nghỉ dạng `data-quit-id`.

## 4. Ảnh hưởng Reads

Không thêm Firestore query mới.

V4B4 chỉ sửa render/cache/mobile DOM. Cơ chế V4B3 vẫn giữ nguyên:

- Admin mở Đã nghỉ: targeted load + full reconciliation một lần/session.
- HLV không đọc tab Đã nghỉ.
- Các tab Học phí, Báo nợ, Kho đồ, Điểm danh không bị đổi nguồn đọc.

## 5. Kiểm thử

Đã chạy:

```text
npm run check
npm run check:all:critical
node tools/check-syntax.mjs
node tools/check-deploy-package.mjs
node tools/check-github-pages-paths.mjs
node tools/check-firestore-indexes.mjs
node tools/check-runtime-stability-gate.mjs
node tools/check-production-stability-gate.mjs
```

Kết quả chính:

```text
Quit Tab Mobile Parity V4B4: 10/10 PASS
Quit Tab Authoritative Completeness V4B3: 9/9 PASS
Quit Tab Completeness V4B2: 12/12 PASS
Security Coach Branch Boundary: 35/35 PASS
Coach Branch Runtime Repair: 25/25 PASS
Syntax: 232 items PASS
Deploy package: 12/12 PASS
GitHub Pages paths: 18/18 PASS
Firestore indexes: 16/16 PASS
Runtime stability: 17/17 PASS
Production stability: 22/22 PASS
```

## 6. Kiểm tra sau deploy

Trên điện thoại cần xóa cache hoặc mở bằng bản cache-bust mới:

1. Deploy V4B4.
2. Trên điện thoại mở lại trang, ưu tiên đóng tab cũ rồi mở mới.
3. Nếu vẫn thấy cũ, xóa cache trình duyệt hoặc dùng chế độ ẩn danh để xác nhận.
4. Đăng nhập Admin.
5. Mở tab **Đã nghỉ**.
6. Chờ full reconciliation hoàn tất vài giây.
7. Kiểm tra Console:

```js
printProfileScaleMetrics?.()
debugStudentStatusSeparation?.()
getStudentsCacheMetrics?.()
```

Kỳ vọng:

```text
quitListDOMRows > 0
quit rows dùng data-quit-id
pgWrap_quitList dùng _loadMore('quit') hoặc thông báo Đã tải hết
không dùng shared students pagination để ghi đè #quitList
```
