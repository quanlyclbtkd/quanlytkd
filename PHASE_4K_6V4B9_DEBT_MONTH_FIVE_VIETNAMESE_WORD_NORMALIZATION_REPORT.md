# Phase 4K-6V4B9 — Debt Month-Five Vietnamese Word Normalization

Ngày hoàn thành: 27/06/2026
Bản nền: Phase 4K-6V4B8 — Debt Two-Month Vietnamese Month Normalization

## 1. Hiện tượng

Sau V4B8 vẫn còn trường hợp võ sinh mới chỉ đóng tới `Tháng năm 2026` nhưng khi xem Báo nợ tháng `2026-06` thì không xuất hiện.

Trường hợp đúng phải là:

```js
paidUntil: 'Tháng năm 2026'
selectedMonth: '2026-06'
getChargeableTuitionMonths(profile, selectedMonth)
// => ['2026-06']
```

Nếu võ sinh mới đóng tới `Tháng tư 2026` thì đúng phải là:

```js
// => ['2026-05', '2026-06']
```

## 2. Nguyên nhân chính xác

V4B8 đã hỗ trợ tháng tiếng Việt dạng chữ như `Tháng tư 2026`, nhưng parser còn một lỗi mơ hồ với chữ `năm`.

Trong tiếng Việt, `năm` có hai nghĩa:

1. Tên tháng 5: `Tháng năm 2026`.
2. Từ chỉ năm dương lịch: `Tháng 5 năm 2026`.

Logic V4B8 xử lý `_monthWordToNumber()` bằng cách xóa `nam` ở cuối chuỗi trước khi dò tên tháng:

```js
.replace(/\b(nam|year)\b\s*$/g, ' ')
```

Vì vậy chuỗi:

```text
Tháng năm 2026
```

sau khi bỏ dấu thành:

```text
thang nam 2026
```

phần trước năm là:

```text
thang nam
```

nhưng parser lại xóa `nam`, làm phần tháng rỗng và không chuẩn hóa được `paidUntil` thành `2026-05`.

Khi `paidUntil` parse rỗng, Báo nợ có thể chỉ tính từ `selectedMonth` hoặc từ một ngày fallback khác. Kết quả là:

- có thể chỉ tính 1 tháng nợ thay vì 2 tháng;
- có thể bị ẩn khi bật lọc nợ từ 2 tháng trở lên;
- có thể không hiện ở tab Báo nợ nếu dữ liệu `paidMonths/skippedMonths/isOwed` cũ kết hợp không đồng nhất.

Đây là lý do có võ sinh bị lỗi, có võ sinh không bị:

- Không bị: `2026-05`, `05/2026`, `5/2026`, `T5/2026`, `Tháng 5/2026`.
- Bị: `Tháng năm 2026`, `thang nam 2026`, một số biến thể có chữ `năm` dùng làm tên tháng 5.

## 3. Cách sửa trong V4B9

### 3.1. Sửa parser tháng

`_monthWordToNumber()` hiện dò theo thứ tự an toàn:

1. Bỏ từ khóa `tháng/thang/month/t`.
2. Dò số tháng dạng số: `5`, `05`.
3. Dò tên tháng trực tiếp, trong đó `nam` = 5.
4. Chỉ coi `nam` là từ chỉ năm nếu sau khi bỏ `nam` vẫn còn token tháng khác.

Điều này giúp phân biệt:

```text
Tháng năm 2026       => 2026-05
Tháng 5 năm 2026     => 2026-05
Tháng năm năm 2026   => 2026-05
Tháng mười năm 2026  => 2026-10
```

### 3.2. Chuẩn hóa mọi biến thể tháng 5 về một chuẩn

Các chuỗi sau đều chuẩn hóa về `2026-05`:

```text
05/2026
5/2026
T5/2026
2026-05
2026/5
Tháng 5/2026
Tháng 5 2026
Tháng 5 - 2026
Tháng năm 2026
Tháng Năm năm 2026
thang nam 2026
```

### 3.3. Sửa cả root và public deploy

V4B9 sửa đồng thời:

- `app.js`
- `js/utils/format.js`
- `public/app.js`
- `public/js/utils/format.js`

Điều này tránh trường hợp GitHub Pages chạy đúng nhưng Firebase Hosting hoặc thư mục `public/` vẫn chạy parser cũ.

### 3.4. Đồng bộ Bulk Zalo legacy path

Legacy `openBulkZaloModal()` trong `app.js` đã được chuyển sang dùng:

```js
window.getChargeableTuitionMonths(p, selMonth, { reason: 'legacy-bulk-zalo-debt' })
```

Nếu fallback không có global helper, nó vẫn normalize `paidUntil/skippedMonths/selectedMonth` trước khi tính.

## 4. Nguyên tắc chuẩn sau V4B9

Dữ liệu nên lưu chuẩn:

```js
paidUntil: '2026-05'
paidMonths: ['2026-05']
skippedMonths: []
```

Nhưng khi đọc dữ liệu legacy, mọi biến thể tháng phải được normalize về `YYYY-MM` trước khi so sánh.

Báo nợ chỉ được loại võ sinh khỏi danh sách nếu có bằng chứng rõ ràng:

- `paidMonths` chứa tháng cần thu;
- `paidUntil` đã qua tháng cần thu;
- tháng đó nằm trong `skippedMonths`;
- profile được miễn phí;
- profile đã nghỉ thật sự.

Không dùng `isOwed=false` hoặc `owedMonths=[]` để che nợ.

## 5. Kiểm thử

Đã chạy:

```text
npm run check
npm run check:all:critical
```

Kết quả: PASS.

Các case quan trọng đã pass:

```js
normalizeYYYYMM('Tháng năm 2026') === '2026-05'
normalizeYYYYMM('Tháng Năm năm 2026') === '2026-05'
normalizeYYYYMM('thang nam 2026') === '2026-05'
normalizeYYYYMM('Tháng 5 - 2026') === '2026-05'
getChargeableTuitionMonths({ paidUntil: 'Tháng năm 2026' }, '2026-06')
// => ['2026-06']
getChargeableTuitionMonths({ paidUntil: 'Tháng tư 2026' }, '2026-06')
// => ['2026-05', '2026-06']
```

## 6. Sau khi deploy

Kiểm tra võ sinh đang nghi ngờ:

```js
debugDebtActionState('Tên võ sinh')
```

Với võ sinh mới đóng tới `Tháng năm 2026`, khi filter tháng là `2026-06`, kết quả đúng:

```js
chargeableMonths: ['2026-06']
debtRowExists: true
```

Với võ sinh mới đóng tới `Tháng tư 2026`, kết quả đúng:

```js
chargeableMonths: ['2026-05', '2026-06']
debtRowExists: true
```
