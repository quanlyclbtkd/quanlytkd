# Phase 4K-6V4B10 — Debt Canonical Filter Boundary + Diagnostics

Ngày hoàn thành: 27/06/2026

## 1. Vấn đề người dùng phát hiện

Sau V4B9 vẫn còn trường hợp võ sinh mới đóng tới `Tháng năm 2026` không xuất hiện trong tab Báo nợ tháng 6/2026.

Người dùng cũng chỉ ra một điểm đúng: mô tả trước đó dễ gây nhầm giữa:

- `paidUntil`: tháng đã đóng tới, cần normalize từ dữ liệu hồ sơ.
- `selectedMonth`: tháng Admin đang xem ở tab Báo nợ.

Chuẩn đúng:

```text
paidUntil = "Tháng năm 2026" -> 2026-05
selectedMonth = "2026-06"    -> tháng đang xem Báo nợ
chargeableMonths = ["2026-06"]
```

Nếu `paidUntil = "Tháng tư 2026"` và `selectedMonth = "2026-06"` thì:

```text
chargeableMonths = ["2026-05", "2026-06"]
```

## 2. Kết quả kiểm tra lại

Parser tháng trong V4B9 đã parse đúng `Tháng năm 2026` thành `2026-05`. Vì vậy lỗi còn lại không nằm ở phép tính tháng đơn thuần.

Tôi tìm thấy 2 lỗi render/filter có thể làm võ sinh nợ thật bị ẩn khỏi UI dù `chargeableMonths` đã đúng.

### 2.1. Lỗi filter “võ sinh mới/quay lại” của tab Đang tập ảnh hưởng sang Báo nợ

Trong renderer mới, Báo nợ dùng lại biến `passFilter` của Đang tập. Biến này không chỉ gồm cơ sở/search mà còn gồm filter:

```text
Tất cả / Võ sinh mới / Võ sinh cũ-quay lại
```

Nếu filter Đang tập đang ở trạng thái không phù hợp, tab Báo nợ có thể ẩn võ sinh nợ thật.

Đây là lỗi nghiêm trọng vì Báo nợ không được phụ thuộc vào filter nghiệp vụ của tab Đang tập.

### 2.2. Lỗi branch legacy/alias khi Admin lọc cơ sở

Profile cũ có thể lưu cơ sở bằng các dạng:

```text
CS1
CS01
Mặc định
tên cơ sở cấu hình
```

Trong một số đường render Báo nợ còn so sánh trực tiếp:

```js
safeBranch !== selBranch
```

Nếu Admin chọn `CS1` nhưng profile lưu `Mặc định` hoặc tên cơ sở, dòng nợ bị loại khỏi Báo nợ.

## 3. Phần đã sửa

### 3.1. Tách filter Báo nợ khỏi filter Đang tập

Trong `studentsRenderer.js`, tôi tách filter thành:

```text
sharedPassFilter = branch + search
activePassFilter = sharedPassFilter + activeNewStudentFilter
debtPassFilter   = sharedPassFilter
```

Báo nợ giờ chỉ chịu ảnh hưởng bởi:

- cơ sở đang lọc;
- ô tìm kiếm;
- bộ lọc số tháng nợ ≥2 hoặc ≥3 nếu Admin tự chọn.

Báo nợ không còn bị filter “võ sinh mới/quay lại” của tab Đang tập làm ẩn.

### 3.2. So khớp cơ sở bằng canonical/alias

Tạo logic `_branchMatchesFilter()` trong cả legacy app và renderer mới.

Các giá trị tương đương sẽ được hiểu là cùng cơ sở:

```text
CS1 == CS01 == Mặc định == tên cơ sở 1
```

Nhờ đó khi Admin lọc cơ sở, Báo nợ không còn bỏ sót võ sinh do định dạng branch cũ.

### 3.3. Mở rộng debugDebtActionState()

Debug hiện trả về thêm:

```text
normalizedPaidUntil
normalizedSelectedMonth
normalizedPaidMonths
normalizedSkippedMonths
branchFilter
branchPass
debtOverdueFilterMin
shouldAppearInDebtBeforeRender
hiddenReasons
```

Điều này giúp xác định rõ võ sinh bị ẩn do:

- không tìm thấy profile;
- đã nghỉ;
- miễn học phí;
- không còn tháng nợ;
- lệch filter cơ sở;
- đang bật bộ lọc nợ từ 2/3 tháng trở lên;
- render/pagination chưa hiển thị.

## 4. Không thay đổi

- Không đổi Firestore Rules.
- Không thêm Firestore query/listener.
- Không dùng Blaze/Cloud Functions.
- Không migration dữ liệu.
- Không thay logic thanh toán hay ghi giao dịch.

## 5. Kiểm thử

Đã chạy:

```text
npm run check: PASS
npm run check:all:critical: PASS
```

Các gate trực tiếp:

```text
Debt Authoritative Tuition Coverage: 32/32 PASS
Syntax: 232 items PASS
Debt Profile Read Boundary: PASS
Debt Actions Sync: PASS
Debt Service Bridge: PASS
Production Stability: PASS
Runtime Stability: PASS
Deploy Package: PASS
GitHub Pages Paths: PASS
Security Coach Branch Boundary: PASS
Quit Tab Mobile Parity: PASS
```

## 6. Kết luận

V4B10 sửa lỗi không phải bằng cách vá thêm parser tháng, mà bằng cách sửa nguyên nhân còn lại sau khi parser đã đúng: Báo nợ bị ẩn bởi filter sai phạm vi và branch legacy không canonical.

Sau V4B10, nếu võ sinh đang tập, không miễn học phí, không báo nghỉ tháng 6 và mới đóng tới `Tháng năm 2026`, khi xem Báo nợ tháng 6/2026, hệ thống phải tính:

```text
normalizedPaidUntil: 2026-05
normalizedSelectedMonth: 2026-06
chargeableMonths: ["2026-06"]
shouldAppearInDebtBeforeRender: true
```
