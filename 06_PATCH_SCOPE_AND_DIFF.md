# 06 — Minimal patch scope

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.

| Runtime business file | Reachable RED / necessary change |
| --- | --- |
| js/services/inventory.service.js | C03/R01/E02/E04/E07/E08/E09: canonical delta validation, generic atomic envelope, current-item CAS, ACK-only projection |
| js/modules/inventory.js | C10/E02: hiện human denial; edit catch tránh unhandled rejection/success sai |
| js/modules/students.js | A02/A03/A05: đưa plan đồng phục vào same caller-owned transaction; recheck context/draft trong callback |
| app.js | M02/M03: same caller envelope cho MultiItem; FALLBACK: đóng unsafe bootstrap writer |

Mỗi file trên được mirror byte-identical trong public. Giữ nguyên Finance/Profile payload policy, primary ACK contract và post-ACK tails; không tách stock khỏi Profile/Finance.

Cache closure bắt buộc: `index.html`, `js/main.js`, `js/services/finance.service.js`, `js/core/tuitionCommandBoundary.js`, `js/modules/finance.js` và mirrors **chỉ thay literal import/script version**, không đổi logic. InventoryService được import ngược qua FinanceService; nếu giữ query cũ thì browser có thể dùng lại unsafe service cũ. Source audit đã bỏ riêng import version và xác nhận toàn bộ phần còn lại byte-identical ở cả 5 file. **FinanceService/TCB/Finance module không có business patch**.

Token: `a9r18-inventory-stock-authority-r1-20261108`. 14 cặp loader edges, 15 import/script references thực (Finance import lặp static/dynamic). Pin/manifest mới append-only; parent pins không sửa. QR app guard chỉ thêm exact candidate SHA/pin; helper/verifier hash expected không nới.

Tooling được nâng SDK double từ batch-only sang transaction + read fixture: ledger/dynamic-size, MultiItem static transport, R1.2B inventory context, R1.2C Admission context và R1.3A draft. Không đổi expected tiền, tháng, profile, ledger hoặc điều kiện denial. R1.3A assertion ID cũ được giữ để historical superset map vẫn tự kiểm chứng. Sequential transaction fixture này **không** được dùng làm concurrency proof; MVCC harness riêng làm việc đó.

Diff đầy đủ: `evidence/INVENTORY_STOCK_R1/INVENTORY_STOCK_R1_SOURCE_AND_TOOLING.patch` (**git apply --check PASS** trên baseline). Danh sách trước/sau SHA và line delta: `CHANGED_SOURCE_AND_TOOLING.json`. Source files modified/new: 36 (kể cả mirrors, test tools, cache metadata); không tính báo cáo/log.

Rollback: dùng nguyên input ZIP đã khóa SHA ở report 01, hoặc reverse toàn bộ patch trên source chưa có thay đổi khác. Không rollback nửa root/public, không cherry-pick chỉ InventoryService mà bỏ Admission/MultiItem/cache closure. Không deploy hoặc rollback production trong phase này.
