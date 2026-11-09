# 04 — Authority and net delta model

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.


Authority duy nhất: `clubs/{clubId}/settings/inventory_stats`. Không dùng DOM, loaded history subset hoặc stock map RAM làm quyết định cuối cùng. Không tạo collection/field mới.

InventoryService giữ các helper hiện hữu `_inventoryBase`, `_inventoryQty`, `_isInventoryIn`, `_accumulateLedgerDelta`; `_ledgerDeltas` chỉ gom lại cùng thuật toán để cả patch increment và validation dùng chung kết quả.

| Mutation | Net balance delta | Authority read |
| --- | --- | --- |
| Create outbound N | −N | stats trong transaction |
| Create inbound N | +N | không cần stock read; batch hiện hữu |
| Edit outbound old→new | old − new | current item mỗi attempt; stats nếu âm |
| Edit inbound old→new | new − old | current item mỗi attempt; stats nếu âm |
| Delete inbound N | −N | current item + stats mỗi attempt |
| Delete outbound N | +N | current item CAS để không reverse hai lần |
| Move SKU A→B | reverse A + apply B | current item; một stats doc, validate mọi key có delta âm |

Với mỗi key âm: balance phải là số hữu hạn, delta hữu hạn, tổng hữu hạn và `balance + delta >= 0`. Field thiếu, string, NaN/invalid không được quy thành 0: `INVENTORY_STOCK_UNVERIFIED`, zero write. Không negative financial evidence cache.

Qty phải là safe positive integer; không mở decimal quantity. Policy default qty bị bỏ trống ở primitive cũ vẫn là 1; UI validation giữ nguyên. Historical stock âm: mọi delta âm DENY; delta dương được phép phục hồi theo §18, ví dụ −2 +1 = −1. Do đó không tuyên bố đã làm sạch mọi số âm lịch sử. Dữ liệu production: UNKNOWN.

Current item được đọc server-side mỗi attempt cho update/delete. Nếu cached previous khác current ở SKU, direction, qty, amount, unpaid/paid links: `INVENTORY_ITEM_STALE`, yêu cầu mở lại phiếu. Quyết định này ngăn stale reverse và double delete, kể cả khi ý định UI có vẻ làm tăng tồn. Không mở rộng khả năng edit type hoặc paid-state.
