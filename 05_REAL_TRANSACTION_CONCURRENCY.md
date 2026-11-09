# 05 — Real transaction concurrency

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| ID | Scenario | Actual |
| --- | --- | --- |
| R01 | 4+4 from5; one success, final1 | NOT_RUN |
| R02 | 3+2 from5; both success, final0 | NOT_RUN |
| R03 | 3+3 from5; one success, final2 | NOT_RUN |
| R04 | SDK callback retries≥2 and rereads newer stock | NOT_OBSERVED |
| R05 | different-SKU contention on same stats doc | NOT_RUN |

**Chưa quan sát được genuine Firestore conflict hoặc SDK retry.** Emulator startup và Rules upload đã diễn ra, nhưng không có browser transaction callback được gọi. Không kết luận từ final-state giả hay dùng lại deterministic MVCC của R1 để nhận R1.1.

Test-only proxy được viết để delegate runTransaction/get/set/update/delete vào real SDK10.7.1. Barrier chỉ chờ sau real transaction.get ở first attempt của hai isolated clients; callback retry do SDK/Emulator quyết định. Không custom retry loop, không tự gọi lại business operation để giả retry. Đây hiện mới là tooling definition, chưa là runtime proof.

R1 actual-source49/49 vẫn GREEN, bao gồm model conflict/revalidation, nhưng chỉ là nửa caller/algorithm proof. Cần chạy đủ phần real Firestore primitive ở môi trường browser khả dụng trước khi chấp nhận Inventory R1.1.
