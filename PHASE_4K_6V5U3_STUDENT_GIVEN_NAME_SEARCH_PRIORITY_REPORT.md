# Phase 4K-6V5U3 — Student Given-Name Search Priority / Existing Search Flow Ranking Only

## A. ROOT CAUSE

Tập kết quả search trước V5U3 là đúng, nhưng relevance ranking chưa hiểu cấu trúc tên người Việt.

`StudentSearchIndex._score()` trước đây chủ yếu phân biệt:

- exact full normalized name;
- full-name prefix;
- full-name contains;
- compact name;
- code/member/VTF;
- phone;
- blob metadata.

Vì `normalizeStudentSearchText()` bỏ dấu tiếng Việt nên query `an` vẫn match nhiều chuỗi như `Anh`, `Hân`, `Hằng`, `Hoàng`. Đây không phải lỗi filter: các hồ sơ đó phải tiếp tục nằm trong tập kết quả. Lỗi là comparator chưa ưu tiên token cuối của họ tên (`given-name`) bằng exact match.

V5U3 vì vậy giữ nguyên match predicate và chỉ bổ sung deterministic presentation ranking.

## B. FILES CHANGED

### Runtime source root — sửa trực tiếp

- `index.html` — cache-bust `main.js` sang V5U3; không thêm search handler.
- `js/core/studentSearchIndex.js` — helper relevance dùng chung + mở rộng comparator `_score/searchStudents` hiện hữu.
- `js/modules/searchRuntime.js` — tái sử dụng helper cho local fallback đã match; không thay SearchRuntime ownership.
- `js/data/quitProfileBoundary.js` — search non-empty dùng shared ranking; blank giữ alphabetical cũ.
- `js/ui/render/computation/studentsRenderer.js` — Debt presentation ranking sau qualification/filter.
- `js/ui/render/computation/financeRenderer.js` — re-rank HTML rows đã match, presentation-only.
- `js/ui/render/computation/inventoryRenderer.js` — re-rank HTML rows đã match, presentation-only.
- `js/main.js`, `js/ui/render.js`, `js/ui/render/renderFinance.js`, `js/ui/render/renderStudents.js`, `js/ui/render/renderInventory.js`, `js/ui/render/renderInvalidation.js`, `js/ui/render/listComputationRefresh.js`, `js/modules/finance.js` — chỉ cập nhật cache-bust module graph để tránh browser giữ module cũ/duplicate module instance.
- `package.json` — thêm regression script V5U3 vào các pipeline hiện hữu.

### Regression tools

- `tools/check-student-name-search-priority.mjs` — gate mới 43 assertions.
- `tools/check-student-search-index.mjs`
- `tools/check-debt-authoritative-tuition-coverage.mjs`
- `tools/check-quit-tab-mobile-parity.mjs`
- `tools/check-render-warning-coalescing-v4b12.mjs`
- `tools/check-v4d1a-runtime-recovery.mjs`
- `tools/check-v5q-quit-single-authoritative-pipeline.mjs`
- `tools/check-v5r-quit-single-source-lock.mjs`
- `tools/check-v5t-canonical-command-boundary-write-freeze.mjs`
- `tools/check-v5u1-student-status-command-cutover.mjs`
- `tools/check-v5u2-tuition-command-cutover.mjs`
- `tools/check-v5u2e-attendance-excel-sdk-fix.mjs`

Các tool cũ trên chỉ được mở rộng assertion để nhận cache-bust V5U3 hoặc output `public/` runtime-only sau `build:public`; không thay business logic để ép PASS.

### Public

Không sửa `public/` thủ công. Đã chạy `npm run build:public`, build root sang `public/`.

## C. CODE FLOW — TRƯỚC / SAU

### Trước

```text
#searchInput
  ↓
SearchRuntime (canonical owner)
  ↓
existing matching / StudentSearchIndex / existing fallback
  ↓
matched result set
  ↓
old order / renderer order
```

Debt và Quit có filter đúng nhưng presentation order không biết exact final-name token.

### Sau

```text
#searchInput
  ↓
SearchRuntime (vẫn là canonical owner duy nhất)
  ↓
EXISTING MATCHING — không đổi
  ↓
SAME RESULT SET
  ↓
shared name relevance ranking, in-memory
  ↓
EXISTING RENDER
```

Không thêm:

- input listener;
- search controller;
- search engine;
- Firestore listener/query;
- server search path;
- search cache key;
- fuzzy search.

Project-wide input/oninput handler count so với base V5U2E: **20 → 20 (delta 0)**. Các changed runtime files có `addEventListener('input')`: **3 → 3 (delta 0)**.

## D. RANKING RULES

Shared helper nằm trong `js/core/studentSearchIndex.js` và tái sử dụng `normalizeStudentSearchText()`.

Tier thấp hơn = relevance cao hơn:

1. Exact full normalized name.
2. Exact final token / given-name.
3. Exact multi-token suffix.
4. Final token startsWith(query).
5. Exact non-final token.
6. Non-final token startsWith(query).
7. Full normalized name contains(query).
8. Metadata/search-blob-only hoặc không match name.

Stable sort:

- priority trước;
- cùng tier giữ `originalIndex`.

Exact phone/code/VTF được giữ structured exact priority trước name relevance để không làm hỏng hành vi tìm mã/số điện thoại.

## E. FIRESTORE

**Extra Firestore reads = 0.**

So sánh các runtime file bị tác động với base V5U2E:

```text
getDocs(         base=0  current=0  delta=0
getDoc(          base=3  current=3  delta=0
onSnapshot(      base=0  current=0  delta=0
collectionGroup( base=0  current=0  delta=0
```

Các `getDoc` tồn tại từ trước trong module graph và không tăng.

Helper ranking không gọi Firestore. Debt/Quit/Finance/Inventory ranking chỉ chạy trên candidate đã có trong memory.

## F. REGRESSION

### Gate mới

```text
npm run check:student-name-search-priority
PASS 43/43
```

### Search gates bắt buộc

```text
npm run check:syntax                         PASS — 244 source items
npm run check:search-bindings                PASS — 26/26
npm run check:debt-search-filter             PASS — 10/10
npm run check:student-search-index           PASS
npm run check:cross-tab-search-replay        PASS
npm run check:search-runtime-v2              PASS
npm run check:search-latency-optimization    PASS
npm run check:student-name-search-priority   PASS — 43/43
```

### Build và package regression

```text
npm run build:public                         PASS
npm run check                                PASS — exit 0
npm run check:all:critical                   PASS — exit 0
```

Các gate Đã nghỉ, Tuition/Debt, Attendance Excel, V5T/V5U1/V5U2 cũng PASS trong pipeline cuối.

## G. UI / BEHAVIOR TEST

Không có live Firebase/browser session trong môi trường kiểm thử này, nên không tuyên bố đã click manual production UI. Thay vào đó đã chạy behavior regression bằng chính helper/module runtime và static wiring checks.

Dataset test:

```text
Nguyễn Văn An
Lê Minh An
Hoàng Bảo Anh
Bùi Đào Gia Hân
Cô Thị Thu Hằng
Bùi Hoàng Thiên Phú
Trần An Khang
```

Query `an`, kết quả V5U3:

```text
Nguyễn Văn An       tier 2
Lê Minh An          tier 2
Hoàng Bảo Anh       tier 4
Trần An Khang       tier 5
Bùi Đào Gia Hân     tier 7
Cô Thị Thu Hằng     tier 7
Bùi Hoàng Thiên Phú tier 7
```

Số kết quả trước/sau: **7 → 7**.

Các behavior gate cũng chứng minh:

- `anh` → Hoàng Bảo Anh được ưu tiên;
- exact `Nguyễn Văn An` đứng đầu;
- accent-insensitive giữ nguyên;
- phone search giữ nguyên;
- memberId/VTF code giữ nguyên;
- blank search không re-rank;
- Debt count/totalDebtEst không đổi;
- Quit blank search giữ alphabetical cũ;
- Quit `an` exact final-token lên trên generic contains;
- cross-tab replay, IME, stale token và latest-only queue giữ nguyên.

## H. DIFF SAFETY

V5U3 không thay đổi:

- Firebase initialization/Auth/Rules/data model;
- active/quit listener ownership;
- quit authority completeness;
- SearchRuntime binding/debounce/IME/latest-only/stale token/cross-tab replay/server fallback/cache key;
- pagination architecture;
- Học phí/Báo nợ calculation;
- debt amount/count/owed months;
- Inventory stock/ledger/accounting;
- Attendance/Coach permissions;
- Exam;
- Finance writer pipeline;
- V5U2E `documentId` Excel fix;
- Firestore writes/migration/Cloud Functions.

Debt safety giữ nguyên `debtPassFilter = sharedPassFilter`; chỉ sort candidate sau khi đã hoàn thành business qualification.

Finance/Inventory chỉ sort presentation HTML copy của rows đã match; calculation arrays vẫn nguyên bản.

## I. PUBLIC BUILD

Đã chạy:

```text
npm run build:public
[BuildPublic] Built .../public
[BuildPublic] Included only: index.html, app.js, style.css, .nojekyll, js, css
```

`public/` là runtime build output, vì vậy `public/package.json` không tồn tại sau build theo thiết kế hiện tại.

SHA-256 root/public đã được so sánh cho toàn bộ runtime file liên quan và đều đồng nhất, gồm:

- `index.html`
- `app.js`
- `style.css`
- `js/main.js`
- `studentSearchIndex.js`
- `quitProfileBoundary.js`
- `searchRuntime.js`
- `finance.js`
- toàn bộ render graph đã thay cache-bust
- `financeRenderer.js`
- `studentsRenderer.js`
- `inventoryRenderer.js`

Kết quả: **ALL_SYNC = true**.

## KẾT LUẬN

V5U3 là patch ranking-only đúng phạm vi:

```text
EXISTING MATCHING
      ↓
SAME RESULT SET
      ↓
DETERMINISTIC GIVEN-NAME RANKING
      ↓
EXISTING RENDER
```

Không có search flow thứ hai và không phát sinh Firestore reads.
