# D1C1 — hợp đồng nhập học và điểm chặn

Ngày kiểm tra: 28/09/2026. Nguồn: mã ứng viên được xác thực từ ZIP đầu vào, không có Git commit trong ZIP.

## Điều có thể chứng minh từ mã và giao diện

- Form `index.html` có `add_fee_default_actual`, `add_package` (1/3/6/12 tháng), giảm giá 1–99%, `add_fee_actual`; không có lựa chọn thu/chưa thu hoặc miễn học phí khi nhập học. Võ phục có lựa chọn tặng riêng `add_uniform_gift`.
- Miễn học phí được biểu diễn riêng bằng `feeExempt` trong form sửa hồ sơ và `TuitionDebtCanonical`, nhưng form nhập học không ghi thuộc tính này.
- `js/modules/students.js::addNewStudent` tạo `paidUntil=lastMonth`, `paidMonths=monthsToRecord` ngay cả khi `fee=0`; chỉ tạo thành phần/giao dịch học phí khi `fee>0`.
- Handler ghi `StudentService.createProfile` trước `addInventoryEntry` và `addGenericTransaction`; giao dịch lỗi không rollback profile.

`node tools/repro-h8r2-1c1f1d1c1-admission-blocker.mjs` thực thi **handler nhập học thật** với UI/I/O giả lập và xác nhận hai ca:

| Ca | Dữ liệu đã ghi sau handler | Tác động |
|---|---|---|
| Học phí 0 | 1 profile có `paidMonths=['2026-09']`, `paidUntil='2026-09'`; 0 giao dịch | Tháng được đánh dấu đã đóng dù không có chứng từ. Ý nghĩa nghiệp vụ số 0 chưa rõ. |
| Học phí 100.000, từ chối ghi giao dịch | 1 profile vẫn tồn tại và ghi đã đóng; 0 giao dịch, 0 biên lai | Lỗi ghi primary để lại trạng thái tài chính dở dang, mức P1. |

## Quyết định còn thiếu

**BUSINESS DECISION REQUIRED:** trong form nhập học, học phí bằng 0 có nghĩa là **chưa thu, còn nợ** hay **được miễn/tặng gói học phí**? Nếu được miễn, cần xác định biểu diễn miễn phí hiện hữu nào là bằng chứng tường minh và gói/tháng nào được miễn. Không suy từ `fee=0` thành một trong hai nghĩa.

Vì F yêu cầu chính sách này được chứng minh trước khi sửa và một ca P1 đã được tái hiện, Patch F chưa được áp dụng. Gate D1C1 chủ động không cho `check:release` đi qua; ứng viên **chưa đủ điều kiện phát hành**.

Ngoài ra, phát hiện trùng hồ sơ giữa hai thiết bị chưa được xác minh; không có truy vấn/transaction mới nào được thêm để né giới hạn số lần đọc.
