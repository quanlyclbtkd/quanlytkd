# One proven defect — canonical Family memo policy

Baseline `_receiptFamilyTuitionMemo(breakdown)` chọn memberId/memberID/studentId trước; thiếu compact ID thì derive FNV-1a(participantKey) thành Mxxxxxxx. `_exportReceiptNow` dùng chính memo đó cho addInfo, expected intent, dòng Nội dung CK và pixel verification. Vì vậy opaque codes hiện trên phiếu là kết quả builder, không phải CSS/font/renderer/VietQR hoặc Finance writer.

Actual image-name fixture chạy cả processCombo('report') → actual queued exportReceipt → _exportReceiptNow → Family builder → generateVietQR → synthetic provider bytes → independent pixel decode → preview decode. Baseline tạo được QR nhưng memo là:

```text
GD M1RTXZSB M1RJYE3C HP T11 2026
```

Hai M-codes cụ thể phụ thuộc existing participantKey trong fixture. Chúng minh họa cùng policy tạo M1JCV3R/MODTCK4J trong ảnh; không tuyên bố fixture tái tạo đúng key production chưa được cung cấp. Baseline URL/intent/UI/provider/preview đều khớp opaque string này; readability assertion RED.

Patch chỉ đổi Family builder sang tên trước. Không tạo display-only string, không sửa r_type/receipt renderer, không thêm metadata ở finance.js. Generic QR generators/verifiers và financial authority nguyên byte.
