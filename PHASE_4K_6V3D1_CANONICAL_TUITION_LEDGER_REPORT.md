# Phase 4K-6V3D1 — Canonical Tuition Month Ledger + Targeted Profile Reconciliation

Ngày hoàn thành: 18/06/2026

## 1. Kết luận điều tra

Trường hợp Nguyễn Thu Phương không phải do tab **Báo nợ không đọc được tab Học phí**.

Các tab không đọc dữ liệu trực tiếp từ nhau. Chúng cùng sử dụng dữ liệu Firestore, nhưng trước bản sửa mỗi màn hình dựa vào trường khác nhau:

- Báo nợ tính từ `paidUntil + paidMonths + skippedMonths`.
- Profile chủ yếu hiển thị trực tiếp `paidUntil`.
- Một số đường thu tiền tạo giao dịch trước, rồi mới cập nhật profile bằng lệnh riêng.
- Luồng Thu gia đình cũ có trường hợp chỉ cập nhật `paidUntil` mà không ghi đầy đủ `paidMonths`.

Vì vậy dữ liệu có thể tồn tại dưới dạng:

```text
paidUntil = 2026-04
paidMonths = [2026-05]
```

Khi đó:

- Báo nợ nhận biết tháng 5 đã đóng và chỉ báo nợ tháng 6.
- Profile vẫn hiển thị tháng 4 vì đọc trường `paidUntil` cũ.

Đây là lỗi **không đồng bộ sổ tháng học phí**, không phải lỗi riêng một võ sinh và cũng không phải lỗi giao diện đơn thuần.

## 2. Nguyên nhân gốc

### 2.1. Giao dịch và profile được ghi bằng hai thao tác tách rời

Nhiều luồng cũ thực hiện:

1. Tạo transaction Học phí.
2. Cập nhật `paidUntil`/`paidMonths` trong profile.

Nếu bước 1 thành công nhưng bước 2 lỗi, mất mạng, bị Rules từ chối hoặc xung đột giữa hai thiết bị, transaction vẫn có nhưng profile bị cũ.

### 2.2. Nhiều công thức tính tháng cùng tồn tại

Profile, Báo nợ, Zalo, Excel và các luồng thu tiền từng tính trạng thái học phí bằng các công thức khác nhau. Các trường legacy như `isOwed` và `owedMonths` có thể che kết quả canonical.

### 2.3. Một số luồng đặt `paidUntil` bằng tháng lớn nhất vừa thu

Cách này sai khi có lỗ hổng giữa các tháng. Ví dụ đóng tới tháng 4, chưa đóng tháng 5 nhưng đóng riêng tháng 6 thì `paidUntil` không được nhảy lên tháng 6.

### 2.4. Hủy báo nghỉ không tính lại mốc đã đóng

Luồng cũ chỉ xóa tháng khỏi `skippedMonths`. Nếu dữ liệu legacy từng cho `paidUntil` nhảy qua tháng báo nghỉ, sau khi hủy báo nghỉ tháng nợ có thể vẫn bị che.

### 2.5. Thêm võ sinh mới có thể đánh dấu đã đóng trước khi transaction được tạo

Nếu việc tạo transaction nhập học thất bại sau khi profile đã được đánh dấu, profile có thể báo đã đóng nhưng không có bằng chứng giao dịch.

## 3. Phạm vi sửa toàn hệ thống

Bản sửa không hard-code tên Nguyễn Thu Phương. Quy tắc áp dụng cho mọi CLB và mọi profile có cùng dạng sai lệch.

### 3.1. Sổ tháng học phí canonical dùng chung

Tạo mới:

```text
js/core/tuitionMonthLedger.js
```

Module cung cấp một công thức thống nhất cho:

- Profile.
- Tab Báo nợ.
- Thu nhanh.
- Thu gia đình.
- Form Học phí chính.
- Thu gộp khoản.
- Thêm võ sinh kèm thu học phí.
- Zalo nhắc nợ.
- Excel báo nợ.
- Tra cứu phụ huynh.
- Sửa/xóa giao dịch.
- Hủy tháng báo nghỉ.

### 3.2. Quy tắc `paidThroughMonth`

`paidThroughMonth` chỉ tiến qua các tháng đã đóng liên tục.

Ví dụ:

| Trạng thái | Kết quả |
|---|---|
| Đã đóng T4 và có bằng chứng T5 | Đã đóng tới T5 |
| Đã đóng T4, thiếu T5, đóng T6 | Vẫn đóng tới T4; T5 là nợ; T6 là tháng đã đóng riêng |
| Đã đóng T4, báo nghỉ T5, đóng T6 | Không nợ đến T6 nhưng mốc liên tục không giả thành T6 |
| Hủy báo nghỉ T5, chưa có bằng chứng đóng T5 | T5 xuất hiện lại là nợ |
| Hủy báo nghỉ T5, có bằng chứng đóng T5 và T6 | Mốc đóng vẫn là T6 |

### 3.3. Ghi Học phí và profile bằng Firestore transaction

Các luồng Học phí mới ghi transaction và profile trong cùng một Firestore transaction:

- Cùng thành công; hoặc
- Cùng thất bại.

Không còn trạng thái “transaction đã tạo nhưng profile chưa cập nhật” ở các đường ghi đã được chuyển đổi.

Các luồng đã chuyển:

- Thu nhanh.
- Thu gia đình.
- Form Học phí.
- Thu gộp có thành phần Học phí.
- Thêm võ sinh kèm học phí/đồng phục.
- Runtime module và runtime legacy `app.js`.

### 3.4. Đối soát profile có mục tiêu, không quét transaction

Sau khi active profiles listener đã tải dữ liệu, hệ thống kiểm tra ngay trong bộ nhớ:

```text
paidUntil cũ < tháng đóng liên tục suy ra từ paidMonths
```

Nếu có bằng chứng rõ ràng, hệ thống tự cập nhật `paidUntil` và `paidThroughMonth`.

Giới hạn an toàn:

- Tối đa 20 profile sửa trong một phiên/CLB.
- Tối đa 8 profile mỗi batch.
- Chỉ tài khoản quản trị được phép ghi sửa.
- Không `getDocs()` và không full scan transactions cho bước phát hiện này.
- Các profile còn lại được xử lý ở phiên tiếp theo.

### 3.5. Không còn tin `isOwed/owedMonths` legacy là nguồn quyết định

Renderer Báo nợ luôn dùng sổ canonical. Cờ legacy chỉ còn giá trị tương thích, không được che các tháng nợ thực tế.

### 3.6. Sửa thao tác xóa giao dịch và hủy báo nghỉ

- Xóa một giao dịch Học phí sẽ tính lại mốc đóng liên tục, không chọn đơn giản tháng lớn nhất còn lại.
- Hủy báo nghỉ chạy trong Firestore transaction, tính lại `paidUntil` và đưa tháng chưa đóng trở lại Báo nợ.

### 3.7. Sửa luồng nhập học

Profile mới được tạo ở trạng thái chưa thanh toán. Sau đó transaction nhập học và bằng chứng học phí được ghi nguyên tử. Không còn đánh dấu đã đóng trước khi transaction nguồn tồn tại.

## 4. Kết quả đúng cho Nguyễn Thu Phương

Với dữ liệu:

```text
paidUntil = 2026-04
paidMonths có 2026-05
```

Kết quả canonical:

```text
paidThroughMonth = 2026-05
Profile = Đã đóng tới tháng 5/2026
Báo nợ tháng 6 = chỉ nợ tháng 6/2026
```

Khi admin CLB Hồng Bàng tải danh sách active profiles, bộ đối soát có mục tiêu sẽ nhận diện và sửa profile có cùng điều kiện mà không đọc lại toàn bộ transactions.

## 5. Ảnh hưởng Firestore Reads/Writes

### Khi mở tab/Báo nợ

- Không thêm listener mới.
- Không full scan transaction.
- Không đọc toàn bộ collection để sửa trường hợp này.
- Phát hiện profile lệch dùng dữ liệu đã có trong active profile snapshot: **0 Reads bổ sung**.

### Khi thu Học phí

- Firestore transaction đọc profile mới nhất của từng võ sinh được thu: thường **1 document read/võ sinh/lần thu**.
- Đây là read chỉ phát sinh khi ghi tiền, không phát sinh khi mở tab.
- Đổi lại transaction và profile được đảm bảo đồng bộ, kể cả khi hai thiết bị thao tác gần nhau.

### Khi tự sửa profile cũ

- Chỉ phát sinh write cho profile thực sự sai.
- Tối đa 20 writes trong một phiên/CLB.
- Không dùng Cloud Functions, Blaze hoặc migration toàn bộ.

## 6. Giới hạn an toàn có chủ đích

- Đối soát tự động chỉ **nâng** `paidUntil` khi `paidMonths` cung cấp bằng chứng rõ ràng.
- Không tự động hạ một `paidUntil` đang cao nếu không có thao tác cụ thể như xóa giao dịch/hủy báo nghỉ, vì hạ sai có thể tạo nợ giả.
- Bản mã nguồn không có quyền truy cập Firestore production nên không thể đọc trực tiếp document live của Nguyễn Thu Phương. Việc xác nhận trường hợp được thực hiện bằng đúng cấu trúc dữ liệu và các đường code hiện tại.
- Nếu một transaction tháng 5 tồn tại nhưng cả `paidMonths` lẫn `paidUntil` đều không chứa tháng 5, trường hợp đó không thể được suy ra bằng 0 Reads; cần đối soát transaction có mục tiêu riêng. Trường hợp được mô tả — Báo nợ chỉ hiện tháng 6 — cho thấy hệ thống đã có bằng chứng loại tháng 5 khỏi nợ, phù hợp với lỗi `paidUntil` bị cũ.

## 7. Kiểm thử

### Cổng mặc định

```text
npm run check
Kết quả: PASS — exit code 0
```

### Bộ kiểm thử chuyên biệt Phase 4K-6V3D1

```text
27/27 PASS
```

Bao gồm:

- Trường hợp Nguyễn Thu Phương.
- Không nhảy qua tháng còn thiếu.
- Đóng tháng riêng sau lỗ hổng.
- Tháng báo nghỉ.
- Hủy báo nghỉ chưa đóng.
- Hủy báo nghỉ nhưng có bằng chứng đã đóng.
- Xóa giao dịch.
- Thu gia đình nhiều profile.
- Thứ tự read-before-write của Firestore transaction.
- Targeted reconciliation 0 Reads.

### Kiểm thử hồi quy bổ sung

11/11 script PASS:

- Admission bundle unification.
- Admission tuition normalization.
- Payment bundle runtime.
- Multi-item tuition package.
- Multi-item skipped months.
- Debt actions sync.
- Debt service bridge.
- Debt full coverage.
- Bundled receipt transactions.
- Production stability gate.
- Runtime stability gate.

## 8. File chính đã thay đổi

- `app.js`
- `index.html`
- `js/core/tuitionMonthLedger.js` — mới
- `js/listeners/profiles.listeners.js`
- `js/main.js`
- `js/modules/finance.js`
- `js/modules/students.js`
- `js/modules/reports.js`
- `js/services/finance.service.js`
- `js/services/students.service.js`
- `js/ui/render/computation/studentsRenderer.js`
- Các import cache-bust liên quan render/report
- `tools/check-canonical-tuition-ledger-reconciliation.mjs` — mới
- Một số checker cũ được cập nhật để nhận phase/cache key và payload canonical mới.

## 9. Hướng xác nhận sau khi deploy

1. Đăng nhập đúng tài khoản admin CLB Hồng Bàng.
2. Chờ danh sách Đang tập tải xong.
3. Mở profile Nguyễn Thu Phương tại Cơ sở Nguyễn Trãi.
4. Xác nhận “Đã đóng tới tháng” hiển thị tháng 5/2026.
5. Mở Báo nợ tháng 6/2026 và xác nhận chỉ còn tháng 6.
6. Kiểm tra console:

```js
getTuitionLedgerMetrics()
```

7. Kết quả kỳ vọng có `repaired >= 1` nếu profile đã được tự đối soát trong phiên đó.

