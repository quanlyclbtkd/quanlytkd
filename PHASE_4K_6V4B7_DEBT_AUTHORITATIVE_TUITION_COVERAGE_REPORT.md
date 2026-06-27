# Phase 4K-6V4B7 — Debt Authoritative Tuition Coverage

Ngày hoàn thành: 27/06/2026

## 1. Vấn đề cần sửa

Tab **Báo nợ** có thể không hiển thị đủ võ sinh nợ học phí. Trường hợp rủi ro cao: võ sinh mới đóng đến **Tháng 5/2026** nhưng tab Báo nợ tháng 6/2026 không hiển thị, khiến Admin hiểu nhầm là đã đóng tháng 6.

Đây là lỗi ảnh hưởng trực tiếp doanh thu CLB.

## 2. Nguyên nhân chính xác

Sau khi kiểm tra toàn bộ pipeline Báo nợ, lỗi không chỉ nằm ở load danh sách, mà nằm ở cách xác định tháng còn phải thu.

### 2.1. Tin nhầm dữ liệu legacy `isOwed/owedMonths`

Trong `studentsRenderer.js`, nếu profile có field `isOwed`, code cũ ưu tiên dùng:

```js
if (p.isOwed !== undefined) {
    owedMonths = p.owedMonths || [];
}
```

Điều này nguy hiểm vì `isOwed/owedMonths` là chỉ mục legacy có thể stale. Nếu hồ sơ còn:

```js
isOwed: false
owedMonths: []
paidUntil: '2026-05'
```

thì võ sinh bị loại khỏi Báo nợ tháng 6 dù thực tế còn nợ.

### 2.2. Định dạng tháng học phí legacy không được parse đúng

Helper cũ chỉ xử lý tốt dạng:

```text
YYYY-MM
YYYY-M
```

Nhưng dữ liệu thực tế có thể tồn tại:

```text
05/2026
5/2026
T5/2026
Tháng 5/2026
2026/05
```

Với các dạng này, `addMonthsToYYYYMM()` có thể tạo chuỗi lỗi như `NaN-NaN`, sau đó vòng tính nợ không chạy. Kết quả là võ sinh không xuất hiện trong Báo nợ.

### 2.3. Một số đường render vẫn tính nợ kiểu cũ

Các luồng sau chưa dùng thống nhất nguồn tính tháng nợ:

- Legacy `renderApp()` trong `app.js`.
- Isolated `studentsRenderer.js`.
- Fallback summary từ pagination.
- Bulk Zalo nhắc nợ.
- Debug coverage.

Khi các luồng này không thống nhất, cùng một võ sinh có thể lúc hiện, lúc mất tùy tab/mobile/cache/render path.

## 3. Sửa đổi đã thực hiện

### 3.1. Chuẩn hóa parser tháng học phí

Cập nhật `normalizeYYYYMM()` trong:

```text
app.js
js/utils/format.js
```

Hỗ trợ các dạng:

```text
2026-05
2026-5
2026/05
05/2026
5/2026
T5/2026
Tháng 5/2026
```

Tất cả được chuẩn hóa về:

```text
2026-05
```

Đồng thời expose:

```js
window.normalizeTuitionMonth = normalizeYYYYMM;
```

### 3.2. Báo nợ không còn dùng `isOwed=false` để loại võ sinh

`getChargeableTuitionMonths()` hiện là nguồn canonical để tính tháng cần thu.

Nguyên tắc mới:

```text
paidUntil / paidMonths / skippedMonths / trạng thái võ sinh
→ tính lại tháng còn phải thu
```

`isOwed/owedMonths` chỉ còn được dùng theo hướng **bổ sung bằng chứng nợ**, không được dùng để che nợ.

Ví dụ:

```js
{
  paidUntil: '2026-05',
  isOwed: false,
  owedMonths: []
}
```

vẫn phải ra:

```text
2026-06
```

### 3.3. Đồng bộ tất cả đường render Báo nợ

Các nơi đã chuyển sang dùng canonical months:

- `app.js` legacy debt render.
- `js/ui/render/computation/studentsRenderer.js`.
- pagination fallback summary.
- bulk Zalo debt reminder.
- `debugDebtCoverage()`.
- `debugDebtActionState()` hiển thị thêm `paidUntil`, `paidMonths`, `chargeableMonths`.

### 3.4. Cache-bust V4B7

Cập nhật cache-bust:

```text
debt-two-month-vietnamese-month-20260627-v4b8
```

cho:

- `app.js`
- `main.js`
- `render.js`
- `renderStudents.js`
- `renderInvalidation.js`
- `listComputationRefresh.js`
- `studentsRenderer.js`
- `modules/students.js`

Mục tiêu: tránh browser/mobile chạy lại renderer V4B6/V4B5 cũ.

## 4. Không thay đổi

Bản này không thay đổi:

- Firestore Rules.
- Cloud Functions.
- Inventory/Kho đồ.
- Coach Attendance-only boundary.
- Quit tab V4B6.
- Transaction write boundary.
- Cách ghi tiền hiện tại.

Không thêm Firestore query mới. Đây là sửa logic tính và render Báo nợ trên dữ liệu đã có.

## 5. Kiểm thử

Đã chạy:

```text
npm run check: PASS
npm run check:all:critical: PASS
```

Các gate trọng yếu:

```text
Debt Authoritative Tuition Coverage: 20/20 PASS
Debt Full Coverage: 10/10 PASS
Debt Load More/Filter: PASS
Debt Actions Sync: 17/17 PASS
Debt Service Bridge: 11/11 PASS
Debt Profile Read Boundary: 21/21 PASS
Multi-item Skipped Months: 10/10 PASS
Scale Readiness / Write Safety: 22/22 PASS
Quit Tab Mobile Parity: 17/17 PASS
Deploy Package: 12/12 PASS
GitHub Pages Paths: 18/18 PASS
Firestore Indexes: 16/16 PASS
Runtime Stability: 17/17 PASS
Production Stability: 22/22 PASS
Canonical Transaction Safe Cutover: 27/27 PASS
Firestore Read Attribution Boundary: 34/34 PASS
Payment Bundle Runtime Hotfix: 20/20 PASS
Inventory Ledger Reconciliation: 33/33 PASS
Coach Attendance-only: 30/30 PASS
Security Coach Branch Boundary: 35/35 PASS
```

## 6. Cách kiểm tra sau deploy

Đăng nhập Admin, mở tab **Báo nợ**, chọn tháng 6/2026.

Võ sinh có:

```text
paidUntil = 2026-05
paidUntil = 05/2026
paidUntil = T5/2026
paidUntil = Tháng 5/2026
```

phải xuất hiện trong Báo nợ tháng 6/2026 nếu không thuộc:

```text
feeExempt = true
skippedMonths có 2026-06
statusCanonical/legacy = quit
paidMonths có 2026-06
```

Console kiểm tra một võ sinh cụ thể:

```js
debugDebtActionState('Tên võ sinh')
```

Kỳ vọng:

```text
chargeableMonths: ['2026-06']
debtRowExists: true
```

## 7. Kết luận

Lỗi thiếu danh sách Báo nợ xuất phát từ hai điểm chính:

1. Dữ liệu tháng học phí legacy không chuẩn định dạng.
2. Renderer Báo nợ tin vào field legacy `isOwed/owedMonths`, trong khi field này có thể stale.

V4B7 sửa theo nguyên tắc bảo vệ doanh thu: **không loại võ sinh khỏi Báo nợ nếu chưa có bằng chứng canonical rằng tháng đó đã đóng hoặc được miễn/báo nghỉ**.
