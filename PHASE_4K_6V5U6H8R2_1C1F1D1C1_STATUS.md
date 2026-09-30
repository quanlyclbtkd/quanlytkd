# D1C1 — tình trạng ứng viên ngày 28/09/2026

**NOT CLOSED · PRODUCTION NOT VERIFIED · RELEASE BLOCKED.** Không triển khai, không sửa Firestore production.

## Nguồn và phạm vi

- ZIP đầu vào SHA-256: `a5d2e60fca6eb258af0d9b4b4f8ce10c16f641c8d61600b9cec97ffe433`; manifest D1C đầu vào khớp 151/151. ZIP không có repository Git.
- Đầu vào D1C: 48/48; sau A–E: 48/48. Root/public sau build: 124/124 SHA-256 giống nhau.
- Writer source được rà theo `PHASE_4K_6V5U6H8R2_1C1F1D1C1_FINANCIAL_WRITER_AUTHORITY_MATRIX.md`. Các entry A–E đã được kiểm tra trực tiếp; F còn chặn.

## Thay đổi và bằng chứng

| Miền | Owner và kết quả hiện tại | Bằng chứng |
|---|---|---|
| A Guard / học phí | Guard không tồn tại, kết quả lỗi, thiếu CLB/hồ sơ, tháng hoặc số tiền sai đều chặn; lane và batch hiện có được giữ. | Actual-handler A01–A09, B; D1C 48/48 |
| B Form thu | Thu khác và hỗn hợp được kiểm loại, nhánh, ngày, số tiền, thành phần; ghi qua FinanceService. | B02/B03/B08, 32/32 tài chính |
| C Lệ phí thi | Finance module là owner thu; app bootstrap stub không ghi; thu có guard/flight/ledger; hủy thuần delete, hủy hỗn hợp update hẹp, cập nhật local sau thành công. | C01–C11 được bao phủ một phần bởi 32/32; 20/20 identity; 41/41 separation |
| D Kho | InventoryService chuẩn bị item/stats, FinanceService chuẩn bị tx, một batch; markPaid và edit có ràng buộc và ghi local sau thành công. | 12/12 actual-handler, 33/33 reconciliation; mock batch reject |
| E Chi phí | app bootstrap forms/edit là stub; Finance module điều phối, FinanceService kiểm tra và ghi. Guard, amount/date, allowlist, flight, lỗi ghi đã kiểm. | E01–E08 trong 32/32 |
| F Nhập học | **Chưa sửa** theo ràng buộc hợp đồng zero-fee. Handler thật có P1: profile đã đóng còn tồn tại nếu transaction bị từ chối. | `BUSINESS_CONTRACT_EVIDENCE.md`; repro F07/F10 |

## Kiểm toán writer sau A–E

| IDs từ ma trận trước sửa | Phân loại hiện tại |
|---|---|
| W01–W04 | Guard fail-closed ở các entry đã sửa; Tuition/Finance/MultiItem tiếp tục dùng owner và lane hiện có. |
| W05–W07 | Finance canonical thu/hủy thi; legacy thu thi trong app là stub; test identity và cancel chạy qua. |
| W08–W10 | Inventory module/service xử lý tạo, markPaid, sửa; batch một lần; chuyển sale/import chưa chứng minh bị chặn. Bootstrap `app.js::saveEditInv` còn logic legacy trước module init, chưa có nghiệm thu runtime để tuyên bố dead/unreachable. |
| W11–W12 | Chi phí module/service; app bootstrap chỉ stub, không ghi trực tiếp. |
| W13 | **UNSAFE_PROVEN / P1**, admission primary ghi rời; chính sách học phí 0 **AMBIGUOUS_BUSINESS_DECISION_REQUIRED**. |
| W14 | Finance delete dùng TransactionDeleteIntegrity/TuitionCommandBoundary/InventoryService; guard generic fail-closed. Không tuyên bố nghiệm thu tất cả lịch sử production. |

Không có kết luận “unexplained active writer = 0” khi W13 và bootstrap inventory còn chưa được chứng minh. Không có thêm migration, Cloud Function, timer, listener, read hoặc runTransaction trong patch.

## Kết quả gate

| Gate | Kết quả |
|---|---|
| `npm run check` | PASS |
| `npm run check:all` | PASS |
| `npm run check:all:critical` | PASS |
| D1C1 A–E actual-handler | 32/32 + 12/12 PASS |
| D1C trước đó | 48/48 PASS |
| `npm run build:public` / root-public parity | PASS / 124–124 |
| Firestore static getDoc/getDocs/onSnapshot | 29 / 51 / 16; startup budget 8/8 PASS |
| `npm run check:h8r2-1c1f1d1c1` | **BLOCKED / exit 1** đúng do F chưa đủ hợp đồng/test |
| `npm run check:release` | **BLOCKED / exit 1** tại gate D1C1; các gate trước đó PASS |
| Rules R1–R11 | NOT EXECUTED; Firestore emulator CLI không có sẵn |
| RV01–RV20 / AF01–AF09 / role smoke xác thực | NOT EXECUTED; không có phiên production được xác nhận |

Không được đổi trạng thái sang CLOSED chỉ dựa vào hồi quy cục bộ. Để tiếp tục F cần quyết định chính sách fee=0; sau đó xây batch profile+stock+transaction duy nhất, test F01–F15 và nghiệm thu Rules/authenticated theo tài liệu đầu vào.
