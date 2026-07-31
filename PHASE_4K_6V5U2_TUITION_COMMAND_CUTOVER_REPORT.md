# Phase 4K-6V5U-2 — Tuition Command Cutover

## 1. Mục tiêu

V5U-2 chuyển ownership của hai thao tác Học phí đã được kiểm chứng sang một command owner duy nhất:

- Thu học phí nhanh (`quickPay`).
- Xóa giao dịch Học phí và đối chiếu lại `paidUntil` / `paidMonths`.

Phase này không tạo schema transaction mới, không tạo collection/path mới và không thêm một luồng Firestore song song. Command boundary chỉ sử dụng `FinanceService` và các helper reconcile hiện hữu.

## 2. Phạm vi cố ý không thay đổi

V5U-2 không migrate:

- Thu gia đình.
- Thu gộp / combo nhiều loại khoản thu.
- Kho đồ và nợ Kho đồ.
- Admission / thêm võ sinh / payment bundle.
- Multi-item.
- Lệ phí thi.
- Attendance offline.

Những luồng trên vẫn giữ nguyên owner và implementation đã ổn định trước V5U-2.

## 3. Kiến trúc sau cutover

### Thu học phí nhanh

```text
UI quickPay
  → TuitionCommandBoundary.collectTuition
  → FinanceService.addTransaction
  → FinanceService.updateStudentPayment
  → FinanceService.addFeeAuditSilent
  → canonical local profile commit
  → một tuition/debt invalidation map
```

### Xóa giao dịch Học phí

```text
UI deleteTx + impact analysis + confirm
  → TuitionCommandBoundary.deleteTuitionTransaction
  → FinanceService.deleteTransaction
  → reconcileStudentTuitionAfterDeletedTransaction hiện hữu
  → remove transaction khỏi local cache
  → một tuition/debt invalidation map
```

Giao dịch Kho đồ, bundle hoặc loại tài chính khác vẫn đi qua đường `FinanceService` cũ trong `finance.js`; Tuition boundary từ chối nhận ownership ngoài phạm vi.

## 4. File chính đã thêm/sửa

### Module mới

- `js/core/tuitionCommandBoundary.js`
- `public/js/core/tuitionCommandBoundary.js`

### Tích hợp runtime

- `js/main.js`
- `public/js/main.js`
- `js/modules/finance.js`
- `public/js/modules/finance.js`
- `js/core/canonicalDomainCommandBoundary.js`
- `public/js/core/canonicalDomainCommandBoundary.js`

### Legacy writer freeze

- `app.js`
- `public/app.js`
- `tools/baselines/v5u2-legacy-write-baseline.json`

### Kiểm tra mới

- `tools/check-v5u2-tuition-command-cutover.mjs`
- `tools/check-v5u2-tuition-command-behavior.mjs`

## 5. Cơ chế an toàn

### 5.1 Single-flight

Hai lệnh giống hệt nhau đang chạy dùng chung một Promise:

```text
cùng võ sinh + cùng tháng + cùng số tiền
→ một transaction write
```

Xóa cùng một transaction nhiều lần liên tiếp cũng chỉ tạo một delete.

### 5.2 Không ghi đè profile

`updateStudentPayment()` chỉ ghi:

- `paidUntil`
- `paidMonths`

Không ghi đè `status`, `belt`, `branch`, `createdAt` hoặc dữ liệu hồ sơ khác.

### 5.3 Biên lai không quyết định kết quả thu tiền

Nếu Firestore đã thu thành công nhưng xuất biên lai lỗi:

- Thao tác Thu vẫn được xem là thành công.
- Người dùng được hướng dẫn in lại trong tab Học phí.
- Không trả về lỗi giả làm người dùng bấm Thu lần nữa và tạo giao dịch trùng.

### 5.4 Partial write khi thu tiền

Hệ thống hiện vẫn sử dụng hai write tuần tự để giữ đúng implementation ổn định:

1. Tạo transaction.
2. Cập nhật profile.

Nếu bước 1 thành công và bước 2 thất bại:

- Error được gắn `partialWrite=true`.
- Không commit `paidUntil` giả vào local store.
- Transaction/Debt được invalidate để trạng thái thật hiện ra.
- UI cảnh báo giao dịch đã ghi nhưng hồ sơ chưa cập nhật.

V5U-2 không tuyên bố atomicity; phase này phát hiện và làm rõ partial state thay vì che giấu nó.

### 5.5 Partial write khi xóa

Trong kiểm tra sâu, đã phát hiện tình huống:

```text
transaction đã delete thành công
→ reconcile profile thất bại
```

Nếu chỉ trả lỗi chung “dữ liệu chưa thay đổi”, người dùng có thể bấm Xóa lại dù transaction đã mất.

Đã sửa:

- Gắn `partialWrite=true`, `transactionDeleted=true`.
- Xóa transaction đã mất khỏi local cache.
- Invalidate Học phí/Báo nợ để đối chiếu lại.
- Thông báo rõ “giao dịch đã xóa, hồ sơ chưa đối chiếu; không bấm Xóa lại”.

## 6. Direct Firestore writes trong app.js

### Baseline V5U-1

```text
addDoc:     26
setDoc:     17
updateDoc:  16
deleteDoc:   7
Tổng:       66
```

### Baseline V5U-2

```text
addDoc:     24
setDoc:     16
updateDoc:  14
deleteDoc:   5
Tổng:       59
```

### Kết quả

```text
Giảm 7 direct writes
addDoc giảm 2
setDoc giảm 1
updateDoc giảm 2
deleteDoc giảm 2
```

V5T write-freeze tiếp tục chặn tổng writer, từng loại writer và chữ ký writer mới tăng trở lại.

## 7. Lỗi phát hiện trong quá trình regression

### Lỗi nghiệp vụ/an toàn đã sửa

1. Xóa transaction thành công nhưng reconcile thất bại chưa được nhận diện là partial state.
2. Xuất biên lai thất bại có thể bị hiểu sai là Thu thất bại và dẫn tới bấm Thu lại.

### Lỗi test gate cũ đã sửa

Một số gate chỉ nhận cache-bust V5U-1/V5S hoặc dùng cửa sổ source quá ngắn:

- Inventory ledger module cache-bust.
- Quit mobile parity module cache-bust.
- Render warning patch/cache-bust.
- Profile canonical store app marker.
- V5S lineage marker.
- Admission tuition package source chunk 10.000 ký tự không còn đủ.
- Exam registration cache-bust.
- Thiếu script alias `check:transaction-delete-integrity` trong package.

Chỉ assertion/test wiring được điều chỉnh; nghiệp vụ các tab không bị sửa để ép test PASS.

## 8. Kết quả kiểm tra

### Pipeline tổng

- `npm run check` — PASS, exit code 0.
- `npm run check:all:critical` — PASS, exit code 0.
- `npm run check:all` — PASS, exit code 0.

### V5U-2

- `check:v5u2-tuition-command-cutover` — PASS 25/25.
- `check:v5u2-tuition-command-behavior` — PASS 17/17.
- `check:v5u2-stability` — PASS sau khi bổ sung transaction-delete integrity alias.

### Học phí / Báo nợ / Transaction

- Tuition actions — PASS.
- Tuition source of truth — PASS.
- Debt authoritative tuition coverage — PASS 32/32.
- Tuition package month coverage — PASS 33/33.
- Transaction realtime — PASS 46/46.
- Transaction delete integrity / write safety — PASS 22/22.
- Canonical transaction safe cutover — PASS.
- Debt actions/service/full coverage — PASS.
- Tuition table, transaction row và receipt helpers — PASS.

### Đang tập / Đã nghỉ / Search

- Quit completeness — PASS 10/10.
- Quit authoritative completeness — PASS 9/9.
- Quit mobile parity — PASS 17/17.
- V5Q/V5R/V5S gates and behavior — PASS.
- Profile canonical store — PASS 27/27.
- Active/new student/load-more/status separation — PASS.
- SearchRuntime/StudentSearchIndex/cross-tab replay — PASS.

### Kho đồ / Multi-item / Admission

- Inventory history/debt — PASS 25/25.
- Inventory hydration — PASS 25/25.
- Dynamic size catalog — PASS 28/28.
- Inventory ledger — PASS 33/33.
- Inventory finance rollup — PASS 43/43.
- Multi-item hydration/package/skipped-months — PASS.
- Payment bundle — PASS 20/20.
- Admission bundle and tuition package — PASS.

### Điểm danh / HLV

- Attendance reliability, schedule, offline shift và shift filter — PASS.
- Attendance canonical ownership — PASS 141 assertions.
- Coach read boundary — PASS 30/30.
- Coach branch security — PASS 35/35.
- Coach runtime repair — PASS 25/25.

### Thi đai

- Exam finance separation — PASS 41/41.
- Canonical ledger, registration count, payment identity, cancel fee, fee save, export và auto-select — PASS.

### Dashboard / SuperAdmin / Production

- Dashboard stats/history/components/branch/exam registration — PASS.
- SuperAdmin hotfix — PASS 27/27.
- SuperAdmin monthStats — PASS 8/8.
- Quota/aggregation/cache/render/server refresh — PASS.
- Runtime stability — PASS 17/17.
- Performance stability — PASS 27/27.
- Production stability — PASS 22/22.
- GitHub Pages paths — PASS 18/18.
- Deploy package — PASS 12/12.

## 9. Rules Emulator

Đã thử chạy:

```text
npm run check:rules:emulator
```

Môi trường hiện tại không có Firebase CLI:

```text
firebase: not found
```

Do đó không thể tuyên bố Rules Emulator PASS trong môi trường này. V5U-2 không thay đổi Rules; quyền Admin xóa transaction vẫn phụ thuộc vào Rules V5U-1 đã được deploy.

## 10. Deploy

V5U-2 cần deploy Hosting/source.

Firestore Rules không có thay đổi mới trong V5U-2. Tuy nhiên, production phải có Rules V5U-1 để Admin được xóa transaction:

```text
allow delete: if isSuperAdmin() || isClubAdmin(clubId)
```

Build:

```text
tuition-command-cutover-20260730-v5u2
```

## 11. Đánh giá rủi ro sau nâng cấp

### Rủi ro đã giảm

- Không còn hai writer quickPay ở app.js và finance module.
- Xóa Học phí có một owner duy nhất.
- Double-click không tạo transaction/delete trùng.
- Biên lai lỗi không kích hoạt thu lại.
- Local commit và invalidation tập trung hơn.
- Direct writer legacy giảm thật từ 66 xuống 59.

### Rủi ro còn lại

- Thu transaction và cập nhật profile chưa atomic.
- Family pay vẫn còn writer trực tiếp trong app.js.
- Multi-item/admission có nhiều write liên domain và chưa được cutover.
- Kho đồ vẫn có writer legacy/module song song ở một số luồng.
- 59 direct writes còn lại vẫn là vùng cần giảm dần.

## 12. Hướng tiếp theo đề xuất

Không nên chuyển ngay Thu gia đình và Thu gộp vào cùng một phase lớn.

Bước an toàn nhất:

### Phase 4K-6V5U-2A — Tuition Command Production Canary + Partial Write Recovery Gate

Mục tiêu:

- Theo dõi `getTuitionCommandMetrics()` theo CLB.
- Phát hiện transaction/profile mismatch từ dữ liệu đã load, không tạo listener mới.
- Có thao tác đối chiếu một võ sinh cụ thể khi partial write được phát hiện.
- Kiểm chứng quickPay/delete trên production trước khi mở rộng ownership.
- Không migrate thêm writer trong phase canary.

Sau khi canary ổn định mới thực hiện:

### Phase 4K-6V5U-3 — Family Tuition Command Cutover

Chỉ chuyển hai giao dịch học phí gia đình, không đưa Kho đồ, exam hoặc multi-item vào cùng phase.
