# D1C1 — kiểm toán writer trước sửa (28/09/2026)

Nguồn: ZIP SHA-256 `a5d2e60fca6eb258af0d9b4b4f8ce10c16f641c8d61600b9cec97ffe433`;
`D1C_AFTER_PRODUCTION_HASHES.json`: 151/151 trùng; Git commit: không có trong ZIP.
Gate đầu vào `check:h8r2-1c1f1d1c`: 48/48; root/public: 124/124.

**Cách đọc:** mỗi dòng là một entry/caller có khả năng chạm dữ liệu tài chính, không phải
một semantic owner mới. Các mã `UNRESOLVED` chỉ ra cần actual-handler và kiểm tra bootstrap.
Firestore Rules chưa được kiểm tra trong môi trường này; application guard không thay Rules.

| ID | Domain / trigger / entry | Document, owner và coordinator hiện tại | Guard / input / atomicity / lane / local | Phân loại; bằng chứng nguồn và hành động |
|---|---|---|---|---|
| W01 | Học phí QuickPay: `window.quickPay` → `TuitionCommandBoundary.collectTuition` | `transactions`, `profiles`; TuitionDebtCanonical + FinanceService atomic batch | `_guard` cho phép khi hàm guard vắng; tháng `_normalizeMonths` nhận text không hợp lệ; profile lane có, local tuition commit có | UNSAFE_PROVEN; `js/core/tuitionCommandBoundary.js:211–330`; vá fail-closed, self-validation, actual-handler |
| W02 | Form thu tiền: `transactionForm.onsubmit` | `transactions`, `profiles`; `js/modules/finance.js`, FinanceService | Guard chỉ ở nhánh học phí, `Thu khác` đi `addTransaction`; `Number('')=0`; combo exam không kiểm thành phần; batch chỉ học phí | UNSAFE_PROVEN; `js/modules/finance.js:662–682`; vá sau W01 |
| W03 | Thu gộp gia đình: `window.processCombo` | `transactions`, `profiles`; finance module + FinanceService | Guard theo `_guardAllowed` (missing = allow); validates rows; batch, nhiều profile lane; local tuition commit | UNSAFE_PROVEN ở guard; `js/modules/finance.js:621–641`; vá A, giữ lane |
| W04 | Thu gộp nhiều mục: `window.processMultiItem` | `transactions`, `profiles`, `inventory`, `inventory_stats`; `app.js` coordinator, Finance/Inventory chuẩn bị một phần | `window.guardFinancialWriteIntent` thiếu thì đi tiếp; `_atomicInFlight`, profile lane, batch; local inventory/tuition/tx | UNSAFE_PROVEN ở guard; `app.js:9252–9554`; vá A, giữ batch |
| W05 | Thu phí thi: `window.quickCollectExam` trong `finance.js` | `transactions`; FinanceService | Không guard, không single-flight, không local write-through; `addTransaction` độc lập | UNSAFE_PROVEN; `js/modules/finance.js:555–608`; vá C sau chứng minh exam identity |
| W06 | Legacy thu phí thi trước module init | `transactions`; `app.js` trực tiếp `addDoc` | Full writer trước khi `initFinance()` override, không guard/single-flight | DUPLICATE_MUST_CUT_OVER; `app.js:5683–5720`, `js/main.js:354–366`; đóng stub bootstrap |
| W07 | Hủy phí thi: `window.cancelExamPayment` | `transactions`; `app.js` trực tiếp delete/update | Guard thiếu thì đi tiếp; mixed giữ Tuition; local invalidation sau success, tx không có thì fallback `deleteTx` | UNSAFE_PROVEN; `app.js:7477–7545`; cần canonical delete/update và actual-handler |
| W08 | Form Kho: `inventoryForm.onsubmit` | `inventory`, `inventory_stats` qua InventoryService; `transactions` qua InventoryService.addTransaction | Hai primary commits nối tiếp, nếu thứ hai lỗi sẽ còn lịch sử/stock; thiếu guard | UNSAFE_PROVEN; `js/modules/inventory.js:415–481`; vá D sau xác định nghĩa vụ từng loại |
| W09 | Thu nợ Kho: `window.markInvPaid` | `inventory`, `transactions`; InventoryService batch | Handler không guard; service đọc `getDoc/getDocs`, amount <=0 vẫn set paid, không local merge; double tap có thể cùng thấy unpaid | UNSAFE_PROVEN; `js/modules/inventory.js:559–580`, `js/services/inventory.service.js:413–480`; vá D |
| W10 | Sửa Kho: `window.saveEditInv` | `inventory`, `inventory_stats`, `transactions`; InventoryService batch | Không guard/transition contract; `updateItem` nhận patch đa trường, original từ edit modal | UNRESOLVED_REACHABILITY/UNSAFE_PROVEN thiếu hợp đồng; `js/modules/inventory.js:586–628`; khóa chuyển trạng thái chưa chứng minh |
| W11 | Chi phí: `expenseForm.onsubmit`, `examExpenseForm.onsubmit` | `transactions`; `app.js` trực tiếp `addDoc` | Không guard/validation/single-flight; module finance không override | DUPLICATE_MUST_CUT_OVER; `app.js:5591–5610`; vá E, xét amount dương trước |
| W12 | Sửa chi phí: `window.saveEditExpense` | `transactions`; `app.js` trực tiếp `updateDoc` | Không guard, nhận amount/date thô, không allowlist ở service | UNSAFE_PROVEN; `app.js:5570–5581`; vá E |
| W13 | Nhập học: `window.addNewStudent` | `profiles` rồi `inventory/inventory_stats`, rồi `transactions`, sửa link sau commit; StudentService | Có submit in-flight, không guard toàn bộ intent; `fee=0` vẫn gán paidUntil/paidMonths; nhiều commit tách rời | UNSAFE_PROVEN; `js/modules/students.js:291–519`, StudentService; cần bằng chứng chính sách zero-fee trước F |
| W14 | Xóa giao dịch: `window.deleteTx` | `transactions`, `profiles`, `inventory`; finance module, TuitionCommandBoundary, TransactionDeleteIntegrity | Generic guard nếu hàm tồn tại; khả năng một số đường đi không có guard; phân loại tác động trước khi xóa | UNRESOLVED_REACHABILITY; `js/modules/finance.js:175–272`; tiếp tục kiểm actual-handler |

Các writer phụ: `fee_audit` và `financial_audit` chỉ là bản ghi phụ, không được thay
thành công của primary write. `StudentService` còn các phương thức ghi trực tiếp
được gọi từ admission; `InventoryService` và `FinanceService` cung cấp semantic
operations, không được nhân đôi tại UI. `app.js` còn fallback runtime và hàm legacy;
phải phân biệt bằng thứ tự khởi tạo thật, không dựa riêng tên `window.*`.

**Điểm chặn:** cần reproduction actual-handler W01–W14; chính sách fee=0,
cho phép xuất không tồn và quà tặng phải dựa UI/config/test trước khi sửa F/D.
