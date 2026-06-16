# Phase 4K-6V1 — Spark Read Cost Hardening

## 1. Mục tiêu

Giảm mạnh Firestore document reads trên gói Spark mà không dùng Blaze, Cloud Functions, migration hoặc thay đổi Firestore Rules/schema.

## 2. Bằng chứng từ Firebase Usage

Ảnh Usage ghi nhận trong 24 giờ:

- 71.000 document reads
- 845 writes
- 61 deletes
- 40 snapshot listeners peak
- 5 active connections peak

40 listeners / 5 connections = khoảng 8 listeners trên mỗi cửa sổ hoặc thiết bị. Con số này khớp với bootstrap hiện tại:

1. club document
2. settings document
3. inventory_stats document
4. active profiles query
5. recent inventory query
6. transactions by date
7. transactions by txMonth
8. transactions by packageMonths

Vì vậy, biểu đồ không cho thấy rõ một listener leak. Nó cho thấy ứng dụng đang giữ nhiều listener toàn cục trên mỗi kết nối.

## 3. Nguyên nhân lớn nhất

`refreshDashboardComputation()` trước đây gọi `fetchHistoricalDashboardFallback()` mỗi lần Dashboard bị invalidated, kể cả khi người dùng không mở tab Tổng quan.

Mỗi lần tải lịch sử:

- đọc 6 stats documents;
- nếu stats thiếu/rỗng, chạy 3 transaction queries cho từng tháng;
- 6 tháng × 3 query = 18 transaction queries.

Trong khi đăng nhập, Dashboard bị invalidated bởi:

- active profiles snapshot;
- inventory snapshot;
- inventory stats snapshot;
- ba transaction snapshots;
- một số thay đổi settings/render khác.

Do đó một lần đăng nhập có thể kích hoạt nhiều lượt tải lịch sử giống nhau. Khi stats docs không được Cloud Functions tạo, transaction fallback luôn chạy. Đây là nguồn tăng reads chính.

## 4. Các nguyên nhân phụ

- Ba transaction listeners có dữ liệu chồng lặp; dedupe JavaScript không làm giảm reads đã tính phí.
- Inventory listener đọc tối đa 500 documents mỗi kết nối.
- Query toàn bộ inventory `unpaid == true` chạy sau snapshot đầu.
- Reload trang, mở nhiều tab hoặc reconnect tạo lại initial snapshots.
- Không bật persistent Firestore cache trên Web; mỗi trang/tab là một kết nối riêng.

## 5. Thay đổi trong 4K-6V1

### 5.1 Dashboard chỉ đọc lịch sử khi người dùng mở tab

- Không chạy network history fetch từ các invalidation nền khi Dashboard đang ẩn.
- Tab Dashboard chủ động schedule việc tải lịch sử khi được mở.

### 5.2 Cache 6 giờ

- Kết quả lịch sử 6 tháng được lưu trong localStorage theo `clubId + selectedMonth`.
- Reload trang trong thời gian cache không đọc lại Firestore history.
- Cache lỗi hoặc private mode không làm crash ứng dụng.

### 5.3 Single-flight và debounce

- Các lời gọi cùng `clubId + month` dùng chung một Promise.
- Render storm không tạo nhiều request song song.
- Debounce 250ms gộp nhiều invalidation liên tiếp.

### 5.4 Giảm 18 query xuống tối đa 3 query groups

Khi stats thiếu, toàn bộ 6 tháng được tải bằng:

1. một txMonth range loader;
2. một date range loader;
3. một `array-contains-any` packageMonths query.

Không còn chạy ba query riêng cho từng tháng.

### 5.5 Chống gắn lại transaction listener cùng tháng

Nếu listener của cùng tháng đã tồn tại, `listenToData()` không hủy rồi tạo lại ba listener.

### 5.6 Gộp Dashboard invalidation từ ba transaction snapshots

Ba initial transaction snapshots chỉ tạo một Dashboard invalidation sau debounce 120ms.

## 6. Không thay đổi

- Không dùng Cloud Functions.
- Không migration.
- Không đổi Firestore Rules.
- Không đổi schema transaction/profile/inventory/attendance.
- Không sửa quy trình Học phí, Thu gộp, Thi Đai, Kho đồ hoặc Điểm danh.
- Không thay đổi `processMultiItem`, `quickPay`, `deleteTx`, `cancelExamPayment`, `processBatchUpgrade`.

## 7. Kỳ vọng giảm reads

Không thể khẳng định con số chính xác trước khi chạy production. Dựa trên code path:

- Dashboard history reads có thể giảm khoảng 70–95%.
- Tổng daily reads có thể giảm khoảng 50–85%, tùy số tab/thiết bị, số transaction và số lần reload.
- Peak snapshot listeners có thể vẫn hiển thị khoảng 8 listener/kết nối vì phase này chưa lazy-load Inventory/Finance listeners.

## 8. Diagnostics

Sau khi deploy, mở DevTools Console và chạy:

```js
window.printSparkReadMetrics()
```

Các chỉ số quan trọng:

- `dashboardHistoryNetworkFetches`
- `dashboardHistoryCacheHits`
- `dashboardHistoryCoalesced`
- `dashboardHistorySkippedHidden`
- `dashboardHistoryEstimatedDocsRead`
- `txSameMonthResubscribeSkipped`

## 9. Kiểm tra

- `npm run check`: PASS
- `npm run check:all`: PASS
- `npm run check:all:critical`: PASS
- `npm run check:spark-read-cost-hardening`: 17/17 PASS

## 10. Bước tiếp theo nếu reads vẫn cao

Phase tiếp theo nên là `Spark Lazy Inventory + Finance Listener Lifecycle`:

- không mở inventory history listener khi chưa vào tab Kho;
- chỉ tải unpaid inventory debt khi mở Học phí/Báo nợ/Thu gộp;
- tab-scoped transaction listeners hoặc one-time query + local refresh;
- cảnh báo nhiều tab cùng mở.
