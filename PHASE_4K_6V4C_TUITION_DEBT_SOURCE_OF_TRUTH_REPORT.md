# Phase 4K-6V4C — Tuition Debt Source of Truth + Profile Canonical Reconciliation

## Mục tiêu

Giảm lỗi lặp lại ở tab **Báo nợ/Học phí** bằng cách gom logic xác định nợ học phí và trạng thái võ sinh vào một ranh giới canonical dùng chung.

Phase này ưu tiên an toàn doanh thu:

- Không để `isOwed=false` hoặc `owedMonths=[]` cũ che mất nợ thật.
- Không để `paidMonths` tương lai/stale che mất nợ sau `paidUntil`.
- `paidUntil` đang hiển thị trong hồ sơ là ranh giới học phí đã đóng liên tục.
- Không migration dữ liệu.
- Không ghi Firestore.
- Không thêm query/listener mới.

## Thay đổi chính

### 1. Thêm canonical debt helper

File mới:

```text
js/core/tuitionDebtCanonical.js
```

API public:

```js
window.TuitionDebtCanonical
window.computeTuitionDebtCanonical(profile, selectedMonth, options)
window.deriveProfileCanonicalState(profile, name, options)
window.auditTuitionDebtCanonicalProfiles(selectedMonth, options)
window.debugDebtTrace(name, selectedMonth, options)
```

### 2. `getChargeableTuitionMonths()` dùng canonical boundary

`app.js` hiện chuyển qua:

```js
window.computeTuitionDebtCanonical(...).chargeableMonths
```

Nếu helper chưa load được, fallback legacy vẫn còn để tránh crash.

### 3. Chuẩn hóa profile state read-only

Canonical helper suy luận:

```text
statusCanonical = active | quit
branchCanonical = CS1 | CS2...
profileId
displayName
quitAt
schemaWarnings
```

Không ghi lại dữ liệu. Chỉ phục vụ render/audit/debug.

### 4. Debt Trace chính thức

Có thể kiểm tra một võ sinh bằng:

```js
debugDebtTrace("Tên võ sinh", "2026-06")
```

Kết quả trả về:

```text
profileState
paidUntilRaw
paidUntilCanonical
paidMonthsRaw
paidMonthsCanonical
trustedPaidMonthsForDebt
ignoredFuturePaidMonthsAfterPaidUntil
transactionPaidMonths
skippedMonthsCanonical
chargeableMonths
shouldAppearInDebtBeforeRender
hiddenReasons
warnings
debtRowExists
renderedDebtRows
assetVersion
```

### 5. Audit toàn CLB, không ghi dữ liệu

Có thể chạy:

```js
auditTuitionDebtCanonicalProfiles("2026-06")
```

Kết quả gồm:

```text
totalProfiles
activeProfiles
quitProfiles
debtProfiles
missingProfileId
missingBranch
paidUntilFormatIssues
paidMonthsAfterPaidUntil
legacyOwedFlagsNotAuthoritative
feeExemptProfiles
skippedMonthProfiles
warningsByType
samples
readyForCanonicalCutover
```

### 6. Cache-bust

Runtime mới:

```text
tuition-debt-source-of-truth-20260628-v4c
```

## Luật tính nợ sau cập nhật

Ví dụ 1:

```js
paidUntil: "Tháng Năm 2026"
paidMonths: ["2026-06"] // stale legacy
selectedMonth: "2026-06"
```

Kết quả đúng:

```js
chargeableMonths: ["2026-06"]
ignoredFuturePaidMonthsAfterPaidUntil: ["2026-06"]
```

Ví dụ 2:

```js
paidUntil: "Tháng Tư 2026"
paidMonths: ["2026-06"] // stale legacy
selectedMonth: "2026-06"
```

Kết quả đúng:

```js
chargeableMonths: ["2026-05", "2026-06"]
```

Ví dụ 3:

```js
paidUntil: "2026-05"
skippedMonths: ["Tháng 6 năm 2026"]
selectedMonth: "2026-06"
```

Kết quả đúng:

```js
chargeableMonths: []
hiddenReasons: ["no-chargeable-months"]
```

## Phạm vi an toàn

Phase này không làm các việc sau:

- Không chạy migration.
- Không sửa dữ liệu hiện có trong Firestore.
- Không thêm Cloud Functions.
- Không thêm listener/query mới.
- Không đổi Security Rules.
- Không thay đổi luồng ghi thu học phí hiện tại.

## Kết quả kiểm thử

Đã chạy:

```text
npm run check: PASS
npm run check:all:critical: PASS
npm run check:tuition-debt-source-of-truth: PASS
npm run check:debt-authoritative-tuition-coverage: PASS
npm run check:syntax: PASS
npm run check:deploy-package: PASS
npm run check:github-pages-paths: PASS
```

Các gate trọng yếu liên quan:

```text
Debt Authoritative Tuition Coverage: 32/32 PASS
Tuition Debt Source of Truth V4C: 26/26 PASS
Coach Attendance-only Boundary: PASS
Security Coach Branch Boundary: PASS
Quit Tab Mobile Parity: PASS
Render Warning Coalescing: PASS
```

## Đánh giá sau cập nhật

Hệ thống ổn định hơn vì tab Báo nợ không còn tự tính theo nhiều đường rời rạc. Tất cả đường đọc quan trọng có thể đi qua một helper canonical. Tuy nhiên đây vẫn là bước read-only. Dữ liệu legacy trong Firestore vẫn còn, nên bước tiếp theo nên là audit/dry-run thực tế trên CLB để xem các nhóm bất thường trước khi cân nhắc repair nhỏ có kiểm soát.

## Bước tiếp theo đề xuất

Sau khi deploy, chạy:

```js
auditTuitionDebtCanonicalProfiles("2026-06")
```

và với võ sinh cụ thể:

```js
debugDebtTrace("Tên võ sinh", "2026-06")
```

Nếu `paidMonthsAfterPaidUntil` cao hoặc `missingProfileId/missingBranch` lớn, phase tiếp theo nên là **Safe Canonical Profile Repair Dry-run**: chỉ báo cáo trước, chưa ghi dữ liệu.
