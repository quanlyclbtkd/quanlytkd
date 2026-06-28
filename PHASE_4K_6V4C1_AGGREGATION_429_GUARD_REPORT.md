# Phase 4K-6V4C1 — Aggregation 429 Guard / Debt Profile Read Boundary

## Mục tiêu

Sửa lỗi sau khi cập nhật V4C, trình duyệt xuất hiện 3 lỗi Firestore `runAggregationQuery` 429/resource-exhausted khi hệ thống tự chạy count aggregation trên `clubs/{clubId}/profiles`.

## Lỗi gốc

Console báo 3 request `runAggregationQuery` cùng lúc:

1. Count toàn bộ `profiles`.
2. Count `profiles` có `status in [active, trial]`.
3. Count `profiles` có `status in [quit, inactive, retired]`.

Các request này xuất phát từ `js/core/debtProfileReadBoundary.js`, hàm `runCountAudit()`. Luồng cũ chạy tự động khi:

- settings/main_config sẵn sàng;
- active profiles listener có snapshot;
- Admin mở hoặc chuẩn bị mở tab Báo nợ.

Với quota Spark/giới hạn thấp, 3 aggregation RPC liên tiếp có thể trả về `resource-exhausted`/429. Đây là lỗi quota aggregation, không phải lỗi parser tháng hay logic `paidUntil` của V4C.

## Sửa đổi chính

### 1. Không tự chạy client aggregation trên login/tab-open

`ensureDebtProfileCoverage()` và `runAutomaticVerification()` giờ dùng dữ liệu `profiles` đã có trong active listener/cache để xác định readiness cho Báo nợ.

Khi cache đã sẵn sàng, hệ thống trả về:

```text
source: active-listener-local-trusted-no-aggregation
noRead: true
```

Không còn tự gọi:

```js
getCountFromServer(collection(...profiles))
getCountFromServer(query(...status in active/trial))
getCountFromServer(query(...status in quit/inactive/retired))
```

### 2. Count audit chuyển thành thao tác debug thủ công

`runCountAudit(reason, { force: true })` vẫn tồn tại cho chẩn đoán thủ công, nhưng không còn chạy tự động. Ngoài ra có thể bật bằng:

```js
window.__ENABLE_DEBT_COUNT_AUDIT = true
```

### 3. Có cooldown khi gặp resource-exhausted/429

Nếu manual count audit bị quota:

```text
reason: count-audit-quota-guarded
```

hệ thống đặt cooldown 60 phút để tránh retry storm.

### 4. Không tự normalize legacy status bằng full fallback

Luồng cũ có thể count → thấy gap → full fallback → normalize status. V4C1 không còn chạy tự động quy trình này trên tab-open/login để tránh tăng đọc/ghi bất ngờ. Helper vẫn còn trong code cho trường hợp repair có kiểm soát sau này.

### 5. Cache-bust mới

Đã cập nhật asset version:

```text
tuition-debt-source-of-truth-aggregation-guard-20260628-v4c1
```

Các file entrypoint được cache-bust để mobile/desktop không tiếp tục dùng file cũ.

## Ảnh hưởng nghiệp vụ

- Không thay đổi logic tính nợ V4C.
- Không thay đổi `paidUntil`, `paidMonths`, `skippedMonths`, `feeExempt`.
- Không thêm query/listener mới.
- Không ghi Firestore.
- Không migration.
- Giảm 3 `runAggregationQuery` tự động khi vào hệ thống/tab Báo nợ.

## Lệnh kiểm thử đã chạy

```bash
npm run check
npm run check:all:critical
npm run check:syntax
npm run check:debt-profile-read-boundary
npm run check:debt-authoritative-tuition-coverage
npm run check:tuition-debt-source-of-truth
npm run check:security-coach-branch-boundary
npm run check:coach-attendance-only-read-boundary
npm run check:quit-tab-mobile-parity
npm run check:render-warning-coalescing
```

## Kết quả trọng yếu

- `npm run check`: PASS.
- `npm run check:all:critical`: PASS.
- `check:debt-profile-read-boundary`: 23/23 PASS.
- `check:debt-authoritative-tuition-coverage`: 32/32 PASS.
- `check:tuition-debt-source-of-truth`: 26/26 PASS.
- `check:syntax`: 234 items PASS.

## Sau khi deploy cần kiểm tra

1. Tải lại trang bằng Ctrl+F5 hoặc xóa cache trên mobile.
2. Mở Console, kiểm tra asset phải có:

```text
tuition-debt-source-of-truth-aggregation-guard-20260628-v4c1
```

3. Mở tab Báo nợ. Không còn 3 request `runAggregationQuery` tự động vào `profiles`.
4. Có thể kiểm tra runtime:

```js
getDebtProfileCoverageStatus?.()
```

Kỳ vọng:

```text
source: active-listener-local-trusted-no-aggregation
metrics.countAggregationQueries: 0
metrics.countAggregationSuppressed: >= 0
```

## Lưu ý

Nếu vẫn thấy URL asset cũ như:

```text
debt-canonical-filter-boundary-20260627-v4b10
render-warning-coalescing-20260627-v4b12
tuition-debt-source-of-truth-20260628-v4c
```

thì máy vẫn đang dùng cache/bản deploy cũ.
