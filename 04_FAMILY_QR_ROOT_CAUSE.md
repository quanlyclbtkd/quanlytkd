# Defect C — long-name Family REPORT QR

Actual Family processCombo('report') ghép full names bằng ` & ` và gọi exportReceipt không có structured Family breakdown. Generic Tuition memo phải mang cả hai tên cùng kỳ học phí, vượt local safety invariant 40. Actual receipt baseline trả `ok=false`, `MEMO_TOO_LONG`, `stage=intent`, providerFetches=0. app.js logger là nơi báo lỗi; provider chưa được gọi.

Candidate chỉ thêm metadata ở nhánh report: tuition/familyParticipant, exact studentName, existing participantKey từ `_profileKey`, memberId/memberID/studentId, packageMonths:[month], amount và label có full name/kỳ. Metadata không persist. Không split display name để suy ra identity.

`_receiptFamilyTuitionMemo` chỉ dùng khi breakdown có Family tag. Ưu tiên ID ASCII alphanumeric 1–8 ký tự theo memberId → memberID → studentId. Nếu không có ID phù hợp, tạo `M` + 7 ký tự base36 từ FNV-1a 32-bit của canonical key hiện có. Reference chỉ dùng trình bày; không trở thành student/payment authority.

Kiểm tra reference trùng trong request và đối chiếu với toàn bộ profile cache CLB hiện tại; so collision không phân biệt case để fail closed. Cả duplicate ID và hai input FNV-1a `costarring`/`liquid` thực sự cùng hash đều DENY trước provider. Không tuyên bố hash tự nó không có collision. Kiểm tra này có phạm vi request/current memory, không phải mapping toàn cục hay uniqueness giữa các CLB.

Memo mẫu: `GD VTF001 VTF002 HP T11 2026`. Cùng năm giữ từng Tn; khác năm giữ đúng từng month/year. Nếu readable form vượt 40, Family dùng các token YYYYMM rời rạc, giữ nguyên mọi chữ số và không biến sparse months thành range. Tất cả refs ≤8 và max hai người/một tháng mỗi người. Không cắt full-name memo.

One canonical memo được truyền nguyên vào generateVietQR addInfo, expected intent, visible Nội dung CK và existing provider/preview pixel verifier. Full names vẫn ở receipt header và breakdown labels; exact participant↔month mapping không mất.

40 là safety invariant của ứng dụng, KHÔNG phải tuyên bố giới hạn chính thức VietQR. Không nới generic memo/EMV/amount/account/CRC/media checks. Khác receiving account vẫn ACCOUNT_ALIAS_CONFLICT; Family reference lỗi có code FAMILY_MEMO_REFERENCE_UNAVAILABLE; metadata lỗi có code FAMILY_MEMO_METADATA_INVALID.
