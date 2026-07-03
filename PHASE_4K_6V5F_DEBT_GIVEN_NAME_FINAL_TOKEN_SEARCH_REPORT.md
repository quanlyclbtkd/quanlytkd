# Phase 4K-6V5G — Given-Name Priority Search Unification

## Mục tiêu

Sửa triệt để lỗi tìm kiếm trong tab Báo nợ/Đang tập/Đã nghỉ khi nhập một từ tên như `uyên` nhưng hệ thống vẫn kéo nhầm các võ sinh có họ/chữ lót chứa chuỗi tương tự như `Nguyễn`, `Nguyên`, `Tuyên`, hoặc `Quyên`.

Yêu cầu vận hành:

- Khi nhập `uyên`, ưu tiên tìm đúng võ sinh có **tên gọi cuối** là `Uyên`.
- Không cần nhập đầy đủ họ tên như `Bảo Uyên`.
- Không trả tràn các dòng có họ hoặc chữ lót gần giống.
- Không làm hỏng tìm full name, số điện thoại, mã võ sinh, VTF.

## Nguyên nhân xác định

Bản V5D đã sửa `StudentSearchIndex`, nhưng tab Báo nợ trong ảnh vẫn đi qua legacy render path trong `app.js`.

Legacy path cũ vẫn dùng:

```js
_legacyNormalizeSearch(name).includes(search)
```

Vì vậy:

- `Nguyễn` normalize thành `nguyen` và có chứa `uyen`.
- `Nguyên` normalize thành `nguyen` và có chứa `uyen`.
- `Tuyên` normalize thành `tuyen` và có chứa `uyen`.
- `Quyên` normalize thành `quyen` và có chứa `uyen`.

Do đó khi tìm `uyên`, danh sách Báo nợ vẫn hiện sai nhiều dòng như trong ảnh.

## Thay đổi chính

### 1. Sửa legacy render path trong `app.js`

Thêm các helper:

- `_legacyIsPlainGivenNameLookup(search, raw)`
- `_legacyMatchesGivenNameOnly(name, search)`
- `_legacyStudentProfileMatchesSearch(name, profile, search, rawSearch)`

Luồng render profile trong `app.js` đã đổi từ broad contains sang:

```js
matchesSearch = _legacyStudentProfileMatchesSearch(name, p, search, _rawSearch);
```

Với truy vấn một từ thuần chữ như `uyên`, helper chỉ match token cuối của tên võ sinh.

### 2. Mở rộng `StudentSearchIndex`

Thêm API dùng chung:

- `isPlainGivenNameLookup(rawTerm)`
- `matchesGivenNameOnly(name, rawTerm)`
- `matchesStudentProfileSearch(name, profile, rawTerm)`

Điều này giúp SearchRuntime và legacy render cùng một quy tắc.

### 3. Mở rộng `SearchRuntime`

Expose các helper lên `window`:

- `window.isPlainStudentGivenNameLookup`
- `window.matchesStudentGivenNameOnly`
- `window.matchesStudentProfileSearch`

### 4. Cache-bust V5F

Đổi build marker sang:

```text
login-history-large-list-guard-20260703-v5h
```

để tránh trình duyệt giữ lại bundle V5E/V5D.

## Hành vi sau sửa

Dữ liệu mẫu:

- `Đỗ Bảo Uyên`
- `Lê Đoàn Thảo Quyên`
- `Bùi Nguyên Chí Thành`
- `Chu Khang Nguyên`
- `Khúc Nguyên Phương`
- `Lê Tuyên`
- `Trần Uyển Nhi`

Khi tìm:

```text
uyên
```

Kết quả đúng:

- Có: `Đỗ Bảo Uyên`
- Không có: `Lê Đoàn Thảo Quyên`
- Không có: `Bùi Nguyên Chí Thành`
- Không có: `Chu Khang Nguyên`
- Không có: `Khúc Nguyên Phương`
- Không có: `Lê Tuyên`
- Không có: `Trần Uyển Nhi`

Tìm full name vẫn hoạt động:

```text
Đỗ Bảo Uyên
```

## Kiểm tra đã chạy

### Search / Báo nợ

- `npm run check:syntax` — PASS
- `npm run check:v5f-debt-given-name-final-token-search` — PASS 16/16
- `npm run check:v5d-given-name-search` — PASS 15/15
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:student-search-index` — PASS
- `npm run check:search-runtime-v2` — PASS
- `npm run check:search-latency-optimization` — PASS
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:tuition-debt-source-of-truth` — PASS

### HLV / Điểm danh / Quyền cơ sở

- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:attendance-canonical-ownership` — PASS 141 assertions

### SuperAdmin guard liên quan V5E

- `npm run check:v5e-audit-gate-superadmin-hardening` — PASS 10/10
- `npm run check:superadmin-monthstats` — PASS 8/8

### Full pipeline

Đã thử chạy `npm run check`. Pipeline chạy qua nhiều nhóm PASS và không thấy FAIL trước khi timeout do pipeline quá dài trong môi trường tool. Các nhóm trực tiếp liên quan lỗi tìm kiếm, Báo nợ, HLV/Điểm danh và SuperAdmin V5E đều đã chạy riêng và PASS.

## Ghi chú deploy

V5F chỉ sửa source/runtime search. Nếu production đã deploy Rules từ V5C trở lên thì không cần deploy Rules lại. Sau deploy cần hard refresh/xóa cache site để tải bundle:

```text
login-history-large-list-guard-20260703-v5h
```
