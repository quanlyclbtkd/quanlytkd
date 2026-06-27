# Phase 4K-6V4B8 — Debt Two-Month Vietnamese Month Normalization

Ngày hoàn thành: 27/06/2026

## 1. Câu hỏi cần xác minh

Nếu võ sinh mới đóng tới **Tháng tư 2026**, khi Admin xem Báo nợ tháng **6/2026**, hệ thống có phải load đủ nợ **Tháng 5 + Tháng 6** không?

Kết luận sau kiểm tra:

- Nếu `paidUntil` lưu chuẩn `2026-04`, V4B7 đã tính đúng `2026-05, 2026-06`.
- Nếu `paidUntil` lưu dạng số `04/2026`, `T4/2026`, V4B7 cũng đã tính đúng.
- Nhưng nếu `paidUntil` lưu dạng chữ tiếng Việt như `Tháng tư 2026` hoặc `Tháng Tư năm 2026`, V4B7 chưa parse được. Đây là nguyên nhân còn lại có thể làm võ sinh nợ 2 tháng bị hiển thị sai hoặc bị ẩn khi bật bộ lọc nợ từ 2 tháng trở lên.

## 2. Nguyên nhân chính xác

Hàm chuẩn hóa tháng cũ xử lý tốt các dạng số:

```text
2026-04
04/2026
T4/2026
Tháng 4/2026
```

Nhưng không nhận dạng các tháng viết bằng chữ:

```text
Tháng tư 2026
Tháng Tư năm 2026
thang tu 2026
tháng mười một 2026
```

Khi parser trả về rỗng, `getChargeableTuitionMonths()` không biết võ sinh đã đóng tới tháng nào. Trong một số path, hệ thống fallback về tháng đang xem hoặc ngày nhập học, làm số tháng nợ tính sai. Trường hợp hay gây hiểu lầm nhất:

```text
paidUntil = "Tháng tư 2026"
selectedMonth = "2026-06"
```

Đáng lẽ phải là:

```text
2026-05, 2026-06
```

Nhưng parser cũ có thể không ra đủ 2 tháng. Nếu Admin bật bộ lọc `nợ từ 2 tháng trở lên`, võ sinh có thể bị ẩn.

## 3. Vì sao có võ sinh bị, có võ sinh không bị?

Không phải tất cả võ sinh đều bị vì dữ liệu `paidUntil` trong Firestore không đồng nhất.

Nhóm không bị lỗi:

```text
paidUntil = 2026-04
paidUntil = 2026-4
paidUntil = 04/2026
paidUntil = T4/2026
paidMonths có 2026-05/2026-06 rõ ràng
```

Nhóm dễ bị lỗi:

```text
paidUntil = Tháng tư 2026
paidUntil = Tháng Tư năm 2026
paidUntil = thang tu 2026
paidUntil = Tháng mười một 2026
```

Ngoài ra, nếu võ sinh bị gắn legacy `isOwed=false`, V4B7 đã sửa để field này không được che nợ. V4B8 xử lý thêm phần tháng viết bằng chữ.

## 4. Cú pháp chuẩn bắt buộc cho hệ thống

Từ V4B8, hệ thống vẫn đọc legacy để không mất dữ liệu, nhưng cú pháp ghi chuẩn phải là:

### Profile

```js
{
  paidUntil: '2026-04',
  paidMonths: ['2026-01', '2026-02', '2026-03', '2026-04'],
  skippedMonths: [],
  feeExempt: false,
  status: 'active'
}
```

### Tháng đang xem Báo nợ

```js
selectedMonth = '2026-06'
```

### Kết quả chuẩn

```js
getChargeableTuitionMonths(profile, '2026-06')
// => ['2026-05', '2026-06']
```

### Nguyên tắc tài chính

Không dùng các field sau để loại võ sinh khỏi Báo nợ:

```js
isOwed: false
owedMonths: []
```

Chúng là dữ liệu legacy, có thể stale. Báo nợ chỉ được loại tháng nếu có một trong các bằng chứng sau:

```text
paidMonths có tháng đó
paidUntil đã qua tháng đó
skippedMonths có tháng đó
feeExempt = true
profile đã nghỉ trước/tháng đó theo classifier
```

## 5. Thay đổi đã thực hiện

### 5.1. Parser tháng tiếng Việt

Đã sửa cả hai nguồn parser:

```text
app.js normalizeYYYYMM()
js/utils/format.js normalizeYYYYMM()
```

Bây giờ nhận dạng:

```text
Tháng một 2026
Tháng hai 2026
Tháng ba 2026
Tháng tư 2026
Tháng năm 2026
Tháng sáu 2026
Tháng bảy 2026
Tháng tám 2026
Tháng chín 2026
Tháng mười 2026
Tháng mười một 2026
Tháng mười hai 2026
```

và các dạng không dấu:

```text
thang tu 2026
thang muoi mot 2026
```

### 5.2. Báo cáo Excel nợ cũng dùng canonical months

Phát hiện thêm: Sheet `Báo Cáo Nợ` trong Excel vẫn so sánh raw `paidUntil >= selMonth`. Đã sửa để dùng cùng chuẩn:

```js
getChargeableTuitionMonths(profile, selectedMonth, { reason: 'excel-report-debt-sheet' })
```

Nhờ vậy tab Báo nợ và file xuất nợ không còn lệch nhau.

### 5.3. Cache-bust V4B8

Đã cập nhật cache-bust để mobile/desktop không dùng module V4B7 cũ:

```text
debt-month-five-vietnamese-word-20260627-v4b9
```

## 6. Kiểm thử chính

Đã xác minh bằng test động trên parser thật từ `js/utils/format.js`:

```js
getChargeableTuitionMonths({ paidUntil: 'Tháng tư 2026' }, '2026-06')
// ['2026-05', '2026-06']

getChargeableTuitionMonths({ paidUntil: 'Tháng Tư năm 2026' }, 'Tháng 6 năm 2026')
// ['2026-05', '2026-06']

normalizeYYYYMM('thang muoi mot 2026')
// '2026-11'
```

V4B8 dedicated checker:

```text
Debt Authoritative Tuition Coverage: 25/25 PASS
```

## 7. Kết luận

Với V4B8, trường hợp võ sinh chỉ đóng đến **Tháng tư 2026** sẽ được tính đủ nợ tháng **5/2026 và 6/2026**, kể cả khi dữ liệu cũ đang lưu `paidUntil` bằng chữ tiếng Việt.

