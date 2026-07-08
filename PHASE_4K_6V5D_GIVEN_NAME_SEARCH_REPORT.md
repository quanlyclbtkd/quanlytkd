# Phase 4K-6V5D — Given-Name Focused Student Search

## Mục tiêu

Tập trung sửa đúng yêu cầu tìm kiếm tên võ sinh: khi người dùng nhập một tên gọi ngắn như `Uyên`, hệ thống phải ưu tiên tìm đúng võ sinh có **tên gọi/cuối tên** là `Uyên`, không trả tràn những hồ sơ chỉ chứa chuỗi gần giống trong họ hoặc chữ lót như `Nguyễn`, `Nguyên`, `Tuyên`.

## Nguyên nhân lỗi trước đó

Bản V5C đã nâng cấp token search, nhưng vẫn còn các nhánh broad matching:

- `name-token-contains`
- `compact-name-contains`
- `blob.includes(term)`

Với truy vấn `uyên` → normalize thành `uyen`, các chuỗi sau đều có thể bị match sai:

- `Nguyễn` → `nguyen` chứa `uyen`
- `Nguyên` → `nguyen` chứa `uyen`
- `Tuyên` → `tuyen` chứa `uyen`

Do đó hệ thống không còn yêu cầu nhập đủ họ tên, nhưng lại quá rộng, làm trả về cả họ/chữ lót gần giống.

## Thay đổi chính

### 1. StudentSearchIndex chuyển sang given-name focused search

Trong `js/core/studentSearchIndex.js` thêm helper:

- `_isPlainNameLookup()`
- `_givenNameTokensFromName()`
- `_givenNameMatches()`
- `givenNameToken`
- `givenNameTokens`

Khi người dùng nhập một từ tên thuần chữ, ví dụ:

- `uyên`
- `nguyên`
- `anh`
- `nhi`

hệ thống chỉ so với **token cuối của tên võ sinh**, không còn quét rộng toàn blob/họ/chữ lót.

### 2. Loại bỏ nhánh gây false-positive

Đã loại khỏi plain-name lookup:

- `name-token-contains`
- `compact-name-contains`
- `blob.includes(term)`

Nhờ vậy tìm `Uyên` không còn kéo theo `Nguyễn`, `Nguyên`, `Tuyên` chỉ vì chứa chuỗi `uyen`.

### 3. SearchRuntime fallback cũng được chặn broad match

Nếu vì lý do nào đó `StudentSearchIndex` chưa sẵn sàng và hệ thống rơi về legacy local fallback, `js/modules/searchRuntime.js` cũng kiểm tra theo tên cuối trước. Không để fallback cũ `blob.includes(term)` làm lỗi quay lại.

### 4. Server-side search thêm `searchGivenName`

Trong `app.js`, khi thêm/sửa hồ sơ mới sẽ ghi thêm:

- `searchGivenName`

Trong `students.service.js`, khi truy vấn một từ tên thuần chữ, server-side search ưu tiên:

```js
orderBy('searchGivenName')
```

Điều này giúp dữ liệu mới tìm theo tên cuối chuyên nghiệp hơn. Dữ liệu cũ vẫn được hỗ trợ bằng local index khi đã load vào bộ nhớ.

## Hành vi sau sửa

Ví dụ dữ liệu:

- `Bảo Uyên`
- `Nguyễn Minh Anh`
- `Bảo Nguyên`
- `Lê Tuyên`
- `Trần Uyển Nhi`

Tìm `Uyên`:

- Có: `Bảo Uyên`
- Không có: `Nguyễn Minh Anh`
- Không có: `Bảo Nguyên`
- Không có: `Lê Tuyên`
- Không có: `Trần Uyển Nhi` nếu `Nhi` là tên cuối

Tìm `Bảo Uyên` vẫn hoạt động theo full-name search.

Tìm `Nguyên` sẽ khớp người có tên cuối là `Nguyên`, ví dụ `Bảo Nguyên`, nhưng không khớp người chỉ có họ `Nguyễn`.

## Files đã sửa

- `js/core/studentSearchIndex.js`
- `js/modules/searchRuntime.js`
- `js/services/students.service.js`
- `app.js`
- `tools/backfill-student-search-index.mjs`
- `tools/check-v5c-tx-delete-reconcile-smart-search.mjs`
- `tools/check-v5d-given-name-search.mjs`
- `package.json`
- public mirror tương ứng

## Kiểm tra đã chạy

- `npm run check:syntax` — PASS
- `npm run check:v5d-given-name-search` — PASS 15/15
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:student-search-index` — PASS
- `npm run check:search-runtime-v2` — PASS
- `npm run check:search-latency-optimization` — PASS

Đã thử `npm run check` đầy đủ; pipeline chạy qua nhiều nhóm, không thấy lỗi trong log trước khi môi trường tool timeout. Các nhóm trọng yếu liên quan trực tiếp đến tìm kiếm và bảo toàn V5C đều PASS.

## Ghi chú deploy

Bản này chủ yếu là source/runtime search. Nếu bạn đã deploy Firestore Rules V5C để sửa xóa giao dịch thì V5D chỉ cần deploy Hosting/source. Sau deploy nên hard refresh hoặc xóa cache site để chắc chắn bundle mới `attendance-status-quit-sync-20260704-v5m` được tải.
