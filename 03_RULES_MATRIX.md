# 03 — Rules matrix

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| ID | Principal / target | Expected | Actual R1.1 |
| --- | --- | --- | --- |
| RULE01 | Admin A → CLUB_A | allowed | NOT_RUN |
| RULE02 | Admin A → CLUB_B | permission-denied | NOT_RUN |
| RULE03 | Viewer A → Inventory | permission-denied | NOT_RUN |
| RULE04 | Coach A → Inventory | permission-denied | NOT_RUN |
| RULE05 | Unauthenticated → Inventory | permission-denied | NOT_RUN |

Actual current `firestore.rules` đã được nạp vào Emulator, SHA `1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3`. Tuy nhiên browser bị chặn trước khi tạo client nên **Rules allow/deny của business matrix chưa được kiểm chứng**. Nạp/compile Rules không thay thế thử quyền thực tế.

Fixture tooling định nghĩa users/adminA, adminB, viewerA, coachA theo schema role/clubId/status hiện hữu; Coach có assignment mirror hợp lệ. Các fixture này chưa được seed trong canonical run vì startup browser thất bại trước case đầu. Không giả một mô hình auth khác.

`withSecurityRulesDisabled` chỉ nằm trong seed helper; business calls nằm ở browser actual InventoryService, không được bọc Rules-disabled. Authorized Node observer contexts chỉ phục vụ đọc before/after evidence. Permission-denied của SDK, nếu gặp ở lần chạy sau, được ghi cả raw Firebase error/cause và domain error (`INVENTORY_WRITE_UNCONFIRMED` có thể wrap permission-denied theo R1 hiện hữu), không đổi production error mapping.

Focused security regressions hiện hành PASS trong report09; đó là evidence khác với real Browser/Rules matrix còn NOT_RUN.
