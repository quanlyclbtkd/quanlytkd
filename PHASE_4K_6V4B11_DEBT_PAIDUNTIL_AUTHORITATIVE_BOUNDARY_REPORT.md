# Phase 4K-6V4B11 — Debt PaidUntil Authoritative Boundary

## Mục tiêu

Sửa lỗi tab **Báo nợ** vẫn không hiển thị võ sinh có hồ sơ đang ghi **Đã đóng tới tháng = Tháng Năm 2026** khi Admin xem **Báo nợ tháng 6/2026**.

Đây là lỗi ảnh hưởng trực tiếp đến doanh thu CLB vì làm Admin hiểu nhầm võ sinh đã đóng tháng 6/2026.

## Kết luận nguyên nhân chính xác

Các bản V4B7–V4B10 đã xử lý đúng parser tháng và các filter render, nhưng vẫn còn một lớp che nợ:

```js
paidUntil: 'Tháng Năm 2026'  // normalize đúng thành 2026-05
paidMonths: ['2026-06']      // dữ liệu legacy/stale còn sót
selectedMonth: '2026-06'
```

Logic cũ dùng `paidMonths` để loại tháng khỏi danh sách nợ, kể cả khi tháng đó **sau `paidUntil`**. Vì vậy `paidMonths` cũ/stale có thể che mất tháng 6, dù hồ sơ hiển thị rõ là mới đóng tới tháng 5.

## Nguyên tắc mới

`paidUntil` là ranh giới canonical cho trạng thái **Đã đóng tới tháng**.

Nếu `paidUntil` tồn tại, mọi `paidMonths` lớn hơn `paidUntil` sẽ không được tự động che nợ trong Báo nợ. Chúng chỉ được coi là dữ liệu tương thích cũ, không phải bằng chứng đã đóng tiếp.

Ví dụ đúng sau V4B11:

```js
paidUntil: 'Tháng Năm 2026'
paidMonths: ['2026-06']
selectedMonth: '2026-06'
// => chargeableMonths: ['2026-06']
```

Với võ sinh mới đóng tới tháng tư:

```js
paidUntil: 'Tháng Tư 2026'
paidMonths: ['2026-06']
selectedMonth: '2026-06'
// => chargeableMonths: ['2026-05', '2026-06']
```

## Phạm vi sửa

- `app.js`
  - `getChargeableTuitionMonths()` giờ dùng `paidUntil` làm ranh giới canonical.
  - Không để `paidMonths` tương lai sau `paidUntil` che mất nợ.
- `js/ui/render/computation/studentsRenderer.js`
  - Fallback debt computation dùng cùng quy tắc.
- `js/modules/reports.js`
  - Sheet Excel Báo cáo nợ dùng cùng quy tắc với UI.
- `js/modules/students.js`
  - `debugDebtActionState()` bổ sung:
    - `trustedPaidMonthsForDebt`
    - `ignoredFuturePaidMonthsAfterPaidUntil`
    - `hiddenReasons`
- `public/`
  - Đồng bộ các file deploy Firebase Hosting.
- Cache-bust cập nhật sang:
  - `debt-paiduntil-authoritative-boundary-20260627-v4b11`

## Những gì không đổi

- Không thêm Firestore query.
- Không thêm listener.
- Không đổi Firestore Rules.
- Không dùng Cloud Functions.
- Không migration dữ liệu.
- `skippedMonths` vẫn có quyền miễn/ẩn nợ nếu Admin đã báo nghỉ đúng tháng.
- `feeExempt=true` vẫn miễn học phí.
- Võ sinh đã nghỉ vẫn không vào Báo nợ.

## Kiểm thử

Đã chạy:

```text
npm run check: PASS
npm run check:all:critical: PASS
npm run check:syntax: PASS
npm run check:debt-authoritative-tuition-coverage: PASS
```

Dedicated debt gate:

```text
Debt Authoritative Tuition Coverage: 32/32 PASS
```

Case quan trọng đã pass:

```js
paidUntil: 'Tháng Năm 2026', paidMonths: ['2026-06'], selectedMonth: '2026-06'
// => ['2026-06']

paidUntil: 'Tháng Tư 2026', paidMonths: ['2026-06'], selectedMonth: '2026-06'
// => ['2026-05', '2026-06']
```

## Cách kiểm tra sau deploy

Trong Console:

```js
debugDebtActionState('Tên võ sinh')
```

Kỳ vọng với võ sinh mới đóng tới Tháng Năm 2026:

```js
normalizedPaidUntil: '2026-05'
normalizedSelectedMonth: '2026-06'
ignoredFuturePaidMonthsAfterPaidUntil: ['2026-06'] // nếu dữ liệu cũ có
chargeableMonths: ['2026-06']
shouldAppearInDebtBeforeRender: true
debtRowExists: true
hiddenReasons: []
```
