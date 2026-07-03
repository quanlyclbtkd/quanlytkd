# Phase 4K-6V3A1 — Payment Bundle Runtime Hotfix

## 1. Phạm vi

Bản vá này sửa lỗi runtime xuất hiện sau Phase 4K-6V3A trong hai luồng:

- `💳 THU GỘP KHOẢN`
- `➕ THÊM VÕ SINH`

Lỗi trên Console:

```text
TypeError: Cannot read properties of undefined (reading 'amount')
at Array.reduce
at window.buildPaymentBundleTransaction
```

## 2. Nguyên nhân chính xác

Trong `window.buildPaymentBundleTransaction()`, V3A đổi phần chuẩn hóa component từ object trả trực tiếp sang biến trung gian, nhưng callback `.map()` không trả object đó:

```javascript
.map(function(c) {
    const transaction = { ... };
});
```

Kết quả:

```javascript
safeComponents === [undefined, undefined, ...]
```

Sau đó các đoạn sau đều có thể lỗi:

```javascript
safeComponents.reduce((s, c) => s + c.amount, 0)
safeComponents.some(c => c.kind === 'tuition')
safeComponents.find(c => c.kind === 'exam')
```

Cả Thu gộp và Thêm võ sinh dùng chung builder này nên cùng hỏng.

Các dòng `[RuntimeErrorRecorded]` trong ảnh là bản ghi lặp của cùng lỗi. Các cảnh báo `Slow computation: 16–28 ms` là cảnh báo đo render 542–575 hồ sơ, không phải nguyên nhân làm thao tác thất bại.

## 3. Sửa lỗi

### 3.1. Khôi phục giá trị trả về từ `.map()`

Callback hiện trả object component hợp lệ:

```javascript
.map(function(c) {
    return {
        kind: c.kind || 'other',
        amount: Number(c.amount || 0),
        ...
    };
});
```

### 3.2. Chặn payload không hợp lệ

`payload.components` chỉ được chấp nhận khi là mảng:

```javascript
const components = Array.isArray(payload.components)
    ? payload.components
    : [];
```

Nếu không có khoản thu hợp lệ, builder trả lỗi có kiểm soát:

```text
Không có khoản thu hợp lệ để tạo giao dịch.
```

### 3.3. Preflight Thêm võ sinh trước khi ghi Firestore

Module Thêm võ sinh hiện dựng và kiểm tra bundle trước khi:

- tạo profile;
- xuất võ phục;
- ghi giao dịch tài chính.

Nếu builder lỗi, thao tác dừng trước mọi Firestore write, tránh tạo hồ sơ hoặc tồn kho dở dang.

### 3.4. Không để nút Thêm võ sinh bị khóa sau lỗi

`addNewStudent()` đã có `finally` trả `_addStudentInProgress = false`. Bản vá bổ sung `catch` để:

- ghi RuntimeError có nguồn rõ ràng;
- hiển thị Toast/Alert dễ hiểu;
- không tạo `Unhandled promise rejection` lặp lại;
- luôn mở khóa nút sau lỗi.

### 3.5. Giữ nguyên V3A và chiến lược Reads

Bản vá không thay đổi:

- ba listener giao dịch production hiện tại;
- canonical accounting boundary;
- Firestore read attribution;
- inventory pagination;
- active-debt listener;
- dashboard cache;
- cấu trúc Firestore.

Không thêm query, listener hoặc Reads mới.

## 4. Kiểm thử mới

Đã thêm:

```text
tools/check-payment-bundle-runtime-hotfix.mjs
```

Checker thực thi trực tiếp hàm thật được trích từ `app.js`, không chỉ tìm chuỗi. Các trường hợp kiểm tra:

- bundle học phí + võ phục;
- bundle nhập học nhiều tháng;
- tổng tiền;
- component không bị `undefined`;
- `amount` luôn là số;
- giữ `relatedInvId`;
- giữ `packageMonths`;
- giữ canonical month;
- bỏ component null/zero;
- payload components không phải mảng;
- preflight chạy trước `StudentService.createProfile()`;
- khóa submit luôn được giải phóng.

Kết quả: **20/20 PASS**.

## 5. Kết quả hồi quy

- Syntax: **116 mục hợp lệ**.
- Default `npm run check`: **PASS**.
- V3A canonical boundary: **34/34 PASS**.
- Inventory V2C: **33/33 PASS**.
- Runtime smoke test: **12/12 PASS**.
- Production stability gate: **22/22 PASS**.
- Payment bundle runtime hotfix: **20/20 PASS**.
- Toàn bộ 66 nhóm trong `check:all`: đã chạy hoàn tất theo từng nhóm và **66/66 PASS**.

Lệnh `npm run check:all` chạy liền một mạch vượt giới hạn thời gian của môi trường kiểm tra; toàn bộ nhóm còn lại được chạy độc lập với timeout riêng và đều đạt.

## 6. Dữ liệu có thể đã phát sinh trước bản vá

Trong lần lỗi cũ của `➕ THÊM VÕ SINH`, luồng module có thể đã ghi profile và xuất Kho trước khi builder lỗi. Vì vậy sau khi deploy cần kiểm tra đúng các lần thao tác bị lỗi:

1. Có profile mới đã được tạo hay chưa.
2. Có giao dịch `Xuất bán` võ phục tương ứng hay chưa.
3. Có giao dịch tài chính bundle hay chưa.
4. Không bấm thêm lại cùng võ sinh trước khi kiểm tra, tránh trùng hồ sơ.

Bản V3A1 ngăn lỗi builder xảy ra sau Firestore write bằng preflight, nhưng không tự xóa dữ liệu đã được ghi từ lần lỗi trước vì việc tự xóa có thể làm mất dữ liệu hợp lệ.

## 7. Cache bust

Các URL runtime được đổi sang:

```text
tx-delete-reconcile-smart-search-20260703-v5c
```

Sau khi upload GitHub Pages cần `Ctrl + Shift + R`.
