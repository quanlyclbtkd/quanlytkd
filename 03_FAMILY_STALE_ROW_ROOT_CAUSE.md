# Defect B — bind dependent fields to selected profile

Baseline `inp.oninput` chỉ tạo suggestion. Chọn A fee=500000 rồi sửa text thành B vẫn giữ fee A. Chọn B với fee=0/undefined bị bỏ qua bởi điều kiện truthy, nên giữ fee trước. Month cũng không được lấy lại theo profile mới.

Candidate giữ `familySelectedName` trong closure của từng input. Khi text khác tên đã chọn hoặc row chưa có binding, xóa ngay month, fee_actual, fee_display và gọi updateComboTotal. Suggestion mới được chọn sẽ clear row, đọc profile hiện tại, normalize `Number(tuitionFee)` hữu hạn >0 để fill; các fee khác để rỗng; sau đó gọi canonical debt helper, chọn tháng mặc định và cập nhật total. Không thay policy feeExempt.

Focus lại input mà tên không đổi giữ selected state; không xóa month/fee chỉ vì focus. Binding row1 và row2 độc lập. Programmatic `inp.value=name` của suggestion không tự phát input event.

| Scenario | Baseline | Candidate |
|---|---|---|
| A 500000 → sửa text B | Giữ fee A | Cả ba field dependent rỗng ngay |
| A → chọn B fee=0 | Giữ 500000 | Fee actual/display rỗng |
| A → chọn B fee undefined | Giữ 500000 | Fee actual/display rỗng |
| A debt09 → B debt11 | Không autofill month mới | Month=2026-11 |
| Focus lại selected row | Giữ state | Giữ state |

Chứng cứ: `FAMILY_COMBO_R1_EVIDENCE/baseline-autofill-final.*`, `candidate-autofill-final.*`, `behavioral-comparison.json`. Không thay validation/writer để cho phép UI stale ghi tiền.
