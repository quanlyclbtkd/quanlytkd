# Phase 4K-6V4B12 — Render Warning Coalescing + Production Console Safety

## Mục tiêu

Xử lý các cảnh báo console mà Admin đang thấy khi mở/lọc danh sách lớn, đặc biệt các cảnh báo:

- `[studentsRenderer] 🐢 Slow computation ... (638 profiles)`
- `[ListComputationSlow] domain="students" ...`
- `[LegacyRenderWarning] _moduleRenderApp() called ...`

Các cảnh báo này không phải lỗi Firestore hoặc lỗi dữ liệu học phí. Chúng là cảnh báo hiệu năng/render. Tuy nhiên chúng lặp lại nhiều lần vì hệ thống đang refresh cùng một computation nhiều lần trong một thao tác UI.

## Dấu hiệu từ log người dùng

Log cho thấy trình duyệt đang chạy asset có cache-bust `debt-canonical-filter-boundary-20260627-v4b10`, nghĩa là thiết bị đang tải mã V4B10 tại thời điểm copy log. Dòng log cũng cho thấy mỗi lần tính danh sách đang xử lý 638 profiles và mất khoảng 16–47ms.

## Nguyên nhân chính xác

### 1. Ngưỡng cảnh báo quá thấp

Ngưỡng cũ là 16ms theo một animation frame 60fps. Với 638 hồ sơ võ sinh, việc tính list mất 20–45ms là bình thường trên máy yếu/mobile. Vì vậy console bị spam cảnh báo dù hệ thống vẫn chạy.

### 2. Refresh computation bị gọi trùng trong cùng một thao tác

Một số flow làm theo chuỗi:

1. `refreshListsComputation([...])`
2. `invalidateList(...)` hoặc `invalidateCurrentTab(...)`
3. `invalidateStudents(...)`
4. `computeAndCacheStudents(...)` chạy lại lần nữa

Do đó cùng một search/filter/load-more có thể tính lại students domain 2–3 lần.

### 3. UI-only invalidation vẫn bị xử lý như data-change invalidation

Các thao tác như search, filter cơ sở, lọc nợ, load-more chỉ thay đổi tham số UI. Nhưng code cũ vẫn bump `_dataVersion` và clear cache toàn domain students, khiến cache miss cưỡng bức và recompute toàn bộ.

### 4. Legacy warning vẫn in ra production console

`LegacyRenderWarning` hữu ích cho developer, nhưng không nên hiện dày đặc trên production nếu không bật debug.

## Đã sửa

### 1. Coalescing refresh cùng domain

Thêm cơ chế ghi nhận domain vừa refresh:

- domain
- params hiện tại
- `_dataVersion`
- pagination/search/filter state
- thời điểm refresh

Nếu trong 250ms có một call refresh trùng cùng signature, hệ thống reuse cache mới thay vì chạy lại `computeAndCacheStudents()`.

File sửa:

- `js/ui/render/listComputationRefresh.js`

### 2. Tách UI-only invalidation khỏi data-change invalidation

Các reason như `search`, `filter-branch`, `load-more`, `pagination`, `debt-overdue`, `active-new-filter` được xử lý bằng list-level invalidation thay vì clear toàn bộ students domain.

File sửa:

- `js/ui/render/renderInvalidation.js`

### 3. Không bump `_dataVersion` lần hai cho search/filter/load-more

Nếu tham số UI đã thay đổi hoặc dataVersion đã được set ở nguồn, render invalidation không bump thêm lần nữa. Điều này tránh cache miss giả.

File sửa:

- `js/ui/render/renderInvalidation.js`

### 4. Production console warning safety

Các cảnh báo hiệu năng/legacy render vẫn giữ cho debug, nhưng chỉ in ra khi:

- chạy localhost / replit dev, hoặc
- bật thủ công `window.__ENABLE_PERF_WARNINGS = true`, hoặc
- bật thủ công `window.__ENABLE_LEGACY_RENDER_WARNINGS = true`

File sửa:

- `js/ui/render/listComputationRefresh.js`
- `js/ui/render/computation/studentsRenderer.js`
- `js/ui/render/renderInvalidation.js`

### 5. Cache-bust V4B12

Tất cả entrypoint và nested render imports được đổi sang:

`render-warning-coalescing-20260627-v4b12`

để thiết bị không tiếp tục tải file V4B10/V4B11 cũ.

## Không thay đổi

- Không đổi Firestore query.
- Không đổi logic tính nợ học phí V4B11.
- Không đổi rules.
- Không thêm reads.
- Không dùng Cloud Functions.
- Không migration dữ liệu.

## Kiểm thử đã chạy

- `npm run check:syntax` — PASS
- `npm run check:render-warning-coalescing` — 14/14 PASS
- `npm run check:debt-authoritative-tuition-coverage` — 32/32 PASS
- `npm run check` — PASS
- `npm run check:all:critical` — PASS
- `npm run check:production-stability-gate` — 22/22 PASS
- `npm run check:runtime-stability-gate` — 17/17 PASS
- `npm run check:deploy-package` — 12/12 PASS
- `npm run check:github-pages-paths` — 18/18 PASS

## Kỳ vọng sau deploy

Trên production console không còn spam:

- `[studentsRenderer] 🐢 Slow computation` cho case bình thường 638 profiles
- `[ListComputationSlow] domain="students"` cho các refresh 20–45ms
- `[LegacyRenderWarning] _moduleRenderApp() called` trừ khi bật debug flag

Nếu cần bật lại cảnh báo phục vụ debug:

```js
window.__ENABLE_PERF_WARNINGS = true;
window.__ENABLE_LEGACY_RENDER_WARNINGS = true;
```
