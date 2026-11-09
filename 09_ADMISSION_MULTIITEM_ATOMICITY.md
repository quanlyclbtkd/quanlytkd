# 09 — Admission/MultiItem atomicity

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.

| Case | Result |
| --- | --- |
| A01 actual Admission profile/Finance/uniform one atomic outcome | PASS |
| A02 actual Admission profile/Finance/uniform one atomic outcome | PASS |
| A03 concurrent actual admissions consume last uniform only once | PASS |
| A04 admission rejected primary has zero persisted profile/bundle/item | PASS |
| M01 actual MultiItem sufficient stock commits one bundle | PASS |
| M02 M04 stale-high UI cannot partially commit tuition, bundle or debt | PASS |
| M03 actual MultiItem and Inventory form contend on same stock version | PASS |
| CTX no projection from committed A into newly active B | PASS |
| CTX02 Admission draft edit during new stock read aborts entire uncommitted envelope | PASS |
| CTX03 MultiItem session invalidated during stock read has zero business writes | PASS |
| A05 actual Admission gift and tuition remain one all-or-nothing stock command | PASS |
| A06 actual Admission gift and tuition remain one all-or-nothing stock command | PASS |

Admission giữ pure Profile/Finance/Inventory preparation. Khi có đồng phục, caller xếp chính các writes cũ vào stock-aware envelope: profile + inventory row + inventory_stats + bundle + gift nếu có. Envelope chỉ thay transport và stock validation; không tạo Finance payload hay một standalone Inventory commit. Không có đồng phục thì giữ batch cũ.

A01 stock1 đồng phục1: một commit. A02 stock0: zero profile/item/Finance. A03 hai Admission độc lập cùng stock1: một người thành công, người còn lại retry/read0/DENY. A04 injected rejection giữ mọi business document trống. A05 gift stock0 cũng chặn toàn bộ nhập học; A06 stock1 ghi profile/item/stats + tuition100 và gift0 trong cùng một commit.

MultiItem vẫn sở hữu một logical bundle: tuition profile update, inventory row+stats, paid patches nợ Kho đã chọn và một bundle transaction. M01 đủ stock giữ toàn bộ effect trong một commit. M02/M04 UI stock cao nhưng server1, yêu cầu3: zero tuition update, zero bundle, nợ Kho chưa được mark paid. M03 MultiItem và Inventory form tranh cùng stock5, mỗi bên4: một commit, final1.

CTX02/CTX03 chủ động đổi draft/session khi candidate đang await stock read; callback recheck trước replay, zero business writes. Hai ca này bảo vệ await mới và không được dùng làm bằng chứng baseline có draft/session defect. CTX sau ACK đổi Club A→B: primary write vẫn thuộc A, không project/notify dữ liệu A vào B. Existing Admission post-ACK/context/draft superset và Finance non-tuition tail gates đều GREEN.

Trong stock MVCC suite, plan business handler và InventoryService là actual source; training/tuition evidence fixtures và bundle preparation được fixture hóa để cô lập stock. Đây không thay thế các regression Finance/Admission thực hiện với owners thật, được chạy riêng trong report 10.
