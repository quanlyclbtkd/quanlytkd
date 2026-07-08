# Phase 4K-6V5G — Given-Name Priority Search Unification

## Mục tiêu

Sửa triệt để lỗi tìm kiếm tên võ sinh theo yêu cầu thực tế: khi người dùng nhập một từ như `uyên`, hệ thống phải ưu tiên TÊN gọi/cuối tên của võ sinh, không được kéo nhầm các hồ sơ có `Nguyễn`, `Nguyên`, `Tuyên`, `Quyên` ở họ hoặc chữ lót.

## Nguyên nhân phát hiện sau khi đi sâu hơn V5F

V5F đã sửa legacy `app.js` và `StudentSearchIndex`, nhưng tab Báo nợ trên giao diện thực tế vẫn có thể đi qua renderer tách module:

- `js/ui/render/computation/studentsRenderer.js`

Trong renderer này, cả PASS 1 và PASS 2 vẫn dùng logic cũ:

```js
blob.includes(q)
```

Vì vậy khi nhập `uyên`, blob tên đầy đủ vẫn chứa các chuỗi normalize như:

- `nguyen` từ `Nguyễn`
- `nguyen` từ `Nguyên`
- `tuyen` từ `Tuyên`
- `quyen` từ `Quyên`

Dẫn đến tab Báo nợ vẫn hiện sai dù core search đã được nâng cấp.

## Sửa đổi chính

### 1. Thêm Given-name priority gate vào isolated students renderer

File:

- `js/ui/render/computation/studentsRenderer.js`

Thêm các helper:

- `_normalizeStudentNameSearch()`
- `_studentNameTokens()`
- `_isOneTokenGivenNameQuery()`
- `_profileNameForGivenSearch()`
- `_matchesFinalGivenName()`
- `_studentProfileMatchesSearch()`

Quy tắc:

- Nếu search là 1 từ chữ cái như `uyên`, chỉ match token cuối của tên võ sinh.
- Không dùng `blob.includes()` cho truy vấn tên 1 từ.
- Nếu search nhiều từ như `bảo uyên`, vẫn cho tìm họ tên đầy đủ.

### 2. Sửa PASS 1 và PASS 2 của studentsRenderer

Thay:

```js
if (q && !blob.includes(q)) searchPassFilter = false;
```

bằng:

```js
if (search && !_studentProfileMatchesSearch(name, p, search)) searchPassFilter = false;
```

Và PASS 2 pagination override cũng dùng cùng gate.

### 3. Ghi đè helper global cũ

File:

- `js/core/studentSearchIndex.js`
- `js/modules/searchRuntime.js`

V5G không dùng `window.matchesStudentProfileSearch = window.matchesStudentProfileSearch || ...` nữa, vì nếu `app.js` hoặc bundle cũ đã gắn helper broad-search trước thì helper mới không thắng.

V5G chủ động overwrite helper:

- `window.isPlainStudentGivenNameLookup`
- `window.matchesStudentGivenNameOnly`
- `window.matchesStudentProfileSearch`

### 4. Ưu tiên tên trong profile hơn document ID

File:

- `app.js`
- `js/modules/searchRuntime.js`
- `js/modules/students.js`

Khi xác định tên để tìm, V5G ưu tiên:

```js
p.name || p.fullName || p.studentName || p.displayName || p.hoTen || id
```

Không ưu tiên doc ID trước tên thật nữa.

### 5. Thêm debug hỗ trợ kiểm tra tại production

Có thể mở console và chạy:

```js
debugGivenNameSearch('Đỗ Bảo Uyên', 'uyên')
```

hoặc kiểm tra search index:

```js
debugSearchAccuracy('uyên')
```

## Hành vi sau sửa

Tìm:

```text
uyên
```

Kết quả đúng:

```text
Đỗ Bảo Uyên
```

Không được kéo nhầm:

```text
Bùi Nguyên Chí Thành
Chu Khang Nguyên
Lê Đoàn Thảo Quyên
Trần Uyển Nhi
Nguyễn Văn An
Lê Tuyên
```

Tìm:

```text
nguyên
```

Chỉ ra người có tên cuối là `Nguyên`, không kéo họ `Nguyễn`.

Tìm nhiều từ:

```text
bảo uyên
```

Vẫn tìm được `Đỗ Bảo Uyên`.

## Kiểm tra đã chạy

- `npm run check:v5g-given-name-priority-search-unification` — PASS 15/15
- `npm run check:syntax` — PASS
- `npm run check:v5f-debt-given-name-final-token-search` — PASS 16/16
- `npm run check:v5d-given-name-search` — PASS 15/15
- `npm run check:v5c-tx-delete-reconcile-smart-search` — PASS 15/15
- `npm run check:student-search-index` — PASS
- `npm run check:search-runtime-v2` — PASS
- `npm run check:search-latency-optimization` — PASS
- `npm run check:debt-authoritative-tuition-coverage` — PASS 32/32
- `npm run check:tuition-debt-source-of-truth` — PASS
- `npm run check:v5b-coach-attendance-toggle-stability` — PASS 13/13
- `npm run check:coach-attendance-only-read-boundary` — PASS 30/30
- `npm run check:security-coach-branch-boundary` — PASS 35/35
- `npm run check:v5e-audit-gate-superadmin-hardening` — PASS 10/10
- `npm run check:superadmin-monthstats` — PASS 8/8
- `npm run check` — PASS toàn bộ pipeline hiện tại

## Ghi chú deploy

V5G chỉ sửa source/runtime search. Nếu bạn đã deploy Rules từ V5C trở lên thì không cần deploy lại Rules chỉ vì V5G. Sau khi deploy Hosting/source, cần hard refresh hoặc xóa cache site để trình duyệt tải build mới:

```text
attendance-status-quit-sync-20260704-v5m
```
