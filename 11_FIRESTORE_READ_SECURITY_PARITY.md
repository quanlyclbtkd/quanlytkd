# 11 — Firestore reads and security

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.

| Measurement | Baseline | Candidate |
| --- | --- | --- |
| Static getDoc call sites | 26 | 24 |
| Static getDocs call sites | 43 | 43 |
| Static onSnapshot call sites | 16 | 16 |
| New listeners | 0 | 0 |
| Rules SHA-256 | 1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3 | 1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3 |
| Indexes SHA-256 | 72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2 | 72ac0a7baf139b2ad52934be5efaf62c81dab8345be3d91ddf35700c949914f2 |

Count dùng cùng quy tắc official security gate: app.js + js/*.js đệ quy, bỏ migrations/diagnostics, bỏ comment lines; đếm callsite lines đúng regex hiện hành. Hai standalone getDoc fallback trong update/delete bị thay bằng transaction.get current item. **Giảm static count không có nghĩa giảm tổng billed reads**.

| Operation | Dynamic read cost per transaction attempt |
| --- | --- |
| new outbound / gift / unpaid / Admission uniform / MultiItem stock | 1 inventory_stats document |
| edit có net delta âm | 1 current inventory item +1 inventory_stats |
| delete inbound | 1 current item +1 inventory_stats |
| increasing edit / delete outbound | 1 current item, không đọc stats |
| new inbound | 0 stock-authority read; batch cũ |
| retry | đọc lại tất cả documents cần cho attempt đó, không dùng snapshot attempt trước |
| stale item mismatch | 1 current item; fail trước stock read |
| missing/invalid stock | 1 stats read; DENY, không persist negative evidence |

R01: hai attempt đầu + một re-read =3 stats reads cho hai command. E09: item read A, item read B, retry item-missing =3 item reads, một reversal. R06 hai SKU khác nhau vẫn conflict do cùng summary document. Retry count/duration được giữ trong raw samples, không suy ra hóa đơn hay latency staging từ timing model.

Rules không sửa byte nào: `settings` và `inventory` chỉ Admin cùng tenant hoặc verified SuperAdmin có write; Viewer read-only, Coach không mutate Inventory. Existing production security 41/41 và Coach boundary/source profile checks GREEN. Đây là source/security regression evidence, không phải lần chạy Rules Emulator mới. Không permission widening, không Cloud Functions, không migrations/schema/per-SKU stock owner. Transaction authority reads thuộc InventoryService hiện hữu và inventory_stats hiện hữu; không listener/reader nền mới.

Historical production negative balances: **UNKNOWN**. Chỉ dùng fixture −2 để chứng minh decrease DENY / increase recovery theo policy; không coi fixture là sự cố production được phát hiện. Không tự chạy rebuild.
