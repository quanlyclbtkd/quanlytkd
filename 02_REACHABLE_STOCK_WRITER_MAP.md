# 02 — Reachable stock writer map

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.

| ID | Classification | Entry/path | Source evidence | Candidate handling |
| --- | --- | --- | --- | --- |
| W01 | REACHABLE_CURRENT | Inventory form → prepareAddItemMutation → commitPreparedAddItem | modules/inventory.js:432–511 | item + stats + Finance tùy chọn; negative plan dùng một transaction |
| W02 | REACHABLE_FALLBACK (baseline API) | InventoryService.addItem, được legacy form gọi khi owner đã hiện hữu | app.js baseline:5747; service addItem | Dùng cùng stock envelope; legacy form fallback nay đóng hoàn toàn |
| W03 | REACHABLE_CURRENT | Thêm võ sinh → Admission có đồng phục/quà tặng | modules/students.js:651–733 | Profile + item + stats + bundle/gift, một caller-owned transaction |
| W04 | REACHABLE_CURRENT | processMultiItem(pay), bật Kho, gồm Tuition/nợ Kho nếu có | app.js processMultiItem | toàn bộ profile/item/stats/debt/bundle nằm cùng một transaction |
| W05 | REACHABLE_CURRENT | saveEditInv → InventoryService.updateItem | modules/inventory.js:641–701 | đọc current item; net delta âm đọc stats; related Finance cùng transaction |
| W06 | REACHABLE_CURRENT | deleteTx không có Finance tx → deleteItem | modules/finance.js:198–207 | đọc current item; reverse ledger một lần; negative phải validate stats |
| W07 | REACHABLE_CURRENT | deleteTx pure Inventory → deleteItem relatedTxId | modules/finance.js:252–257 | item + reverse stats + related Finance delete cùng transaction |
| W08 | LEGACY_UNREACHABLE (không có caller UI) | FinanceService.deleteRelatedInventory | services/finance.service.js:788 | không có production callsite; vẫn delegate canonical deleteItem, không thêm writer |
| W09 | REACHABLE_FALLBACK | app.js inventoryForm.onsubmit bootstrap/rollback | app.js baseline:5725–5778 | RED: trực tiếp addDoc/setDoc/Finance tách rời; candidate báo Kho đang tải và zero write |
| W10 | LEGACY_UNREACHABLE | app.js legacy addNewStudent body | app.js baseline:5575–5660 | unconditional return null trước toàn bộ body; không patch direct stats nằm sau return |
| W11 | LEGACY_UNREACHABLE | StudentService.addInventoryEntry | students.service.js:655 | không có caller trong production graph/HTML; giữ nguyên |
| W12 | LEGACY_UNREACHABLE | StudentService.decrementInventoryStock | students.service.js:745 | không có production caller; giữ nguyên |
| W13 | LEGACY_UNREACHABLE | StudentService.updateInventorySummary | students.service.js:763 | không có production caller; giữ nguyên |
| W14 | LEGACY_UNREACHABLE | StudentService.updateInventoryDoc | students.service.js:732 | không có production caller; giữ nguyên |
| W15 | REACHABLE_CURRENT — historical reconciliation excluded | rebuildInventoryStatsFromHistory → rebuildInventoryStats | modules/inventory.js:828; service rebuildInventoryStats | nút đối soát Admin hiện hữu, full-history replacement; không tự gọi/không sửa trong R1 (§48) |
| W16 | REACHABLE_CURRENT — bootstrap | new club initialization sets inventory_stats {} | app.js baseline:1081 | chỉ tạo CLB rỗng, không có negative delta |
| W17 | REACHABLE_CURRENT — zero stock delta | markInvPaid / prepareMarkPaidPatch | modules/inventory.js:612; service markPaid | chỉ thanh toán khoản nợ đã xuất; không đổi stock delta; giữ nguyên |
| W18 | TEST_ONLY | MVCC Store, SDK fixtures, runtime harnesses | tools/inventory-stock-r1/ | không import vào production graph; không có read/write production |

Các line ở nhãn “baseline” là tọa độ file gốc; line candidate có thể dịch do patch. Callsite được tìm trên app.js, js/, index.html, bỏ public mirror và tools. `js/main.js` import và cài `initStudents`, `initFinance`, `initInventory` sau bootstrap; `initInventory` expose chính InventoryService và thay form handler. Comment rollback của module cùng form handler app.js chứng minh fallback thực, không chỉ là một kết quả grep.

R1 không mở khả năng edit mới: UI vẫn cấm đổi nhập↔xuất, paid-state và gift↔paid. UI hiện cho phép đổi category/size trong cùng type; E11/E12 bảo vệ cả SKU bị tác động âm. Không coi code sau unconditional return là writer đang hoạt động.

Không tìm thấy negative-delta UI writer khác chưa phân loại trong repository được cung cấp. Đây không phải bảo đảm cho client tự viết, code bên ngoài repository hoặc thao tác trực tiếp Admin SDK. Rules hiện vẫn là role/tenant permissions; chưa có Rules-level dynamic stock invariant mới.

Ngoại lệ đối soát W15 được nêu rõ: là thao tác historical reconciliation chủ động, ngoài scope new-write R1; có thể phản ánh số âm lịch sử và cần phase riêng nếu cần kiểm tra cạnh tranh của rebuild. Không chạy chức năng này hay tự sửa lịch sử trong phase này.
