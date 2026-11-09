# 13 — Final decision

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.


**PASS — INVENTORY STOCK INTEGRITY TEST CANDIDATE (phase scope).** Không deploy. Không kết luận toàn hệ thống/production ready hoặc latency đã cải thiện.

49/49 stock checks GREEN; 41/41 phase-specific gates GREEN. Baseline behavioral counterexamples có trước runtime patch; source gốc vẫn khớp toàn bộ1574 ZIP files. Negative-delta authority, retry revalidation, current-item CAS và caller-owned atomicity đều có actual-source deterministic concurrency evidence. 129/129 mirror parity; Rules/indexes giữ nguyên.

**Giới hạn cần giữ rõ:** `npm run check` tổng vẫn exit1 ở các source-freeze checker cũ, không được gọi là toàn bộ gate GREEN. R1.3 frozen Inventory source/Finance imports và exact count26 không còn phù hợp với patch Kho được phép; latency R1/R2/R2.1 còn khóa ancestor trước Family baseline. Không sửa expected hoặc production Finance để làm các checker này xanh. Xem bảng chính xác ở report10. Emulator/staging/mobile thật chưa chạy; historical stock production UNKNOWN.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Tất cả reachable stock mutation paths | Inventory form create; Admission uniform/gift; MultiItem stock; edit; delete stock-only/pure-Inventory Finance; legacy form fallback. Bootstrap/reconciliation/zero-delta markPaid được liệt kê riêng tại report02. |
| 2 | Current/fallback/legacy | W01/W03–07 current; W09 fallback nay fail-closed; W10–14 legacy unreachable; W15 manual historical reconciliation excluded; tools TEST_ONLY. |
| 3 | Baseline RED paths | create oversell, two-client oversell, stock-decreasing edit, inbound delete, stale/double reversal, Admission uniform/gift, stale-high MultiItem, unsafe legacy form. Exact samples report03. |
| 4 | New outbound oversell? | Trong actual-source model: DENY khi thiếu authority/stock. C03/C04/C05/C10/C13/C15 GREEN. Không tuyên bố server Rules chống mọi client tự viết. |
| 5 | Concurrent outbound oversell? | R01/R03: một commit; R02 đủ tổng stock: hai commit qua revalidation. Không có new negative balance trong nhóm negative-delta acceptance. |
| 6 | Edit tạo stock âm? | E02/E04/E11 DENY; E01/E03/E12 được cover chính xác; stale previous DENY. |
| 7 | Delete inbound tạo stock âm? | E07 DENY cả item/Finance; E06 đủ cover PASS. |
| 8 | Admission uniform oversell? | A02/A03/A05 chặn thiếu stock, không có profile/bundle partial. A01/A06 một atomic outcome. |
| 9 | MultiItem stale UI oversell? | M02/M04 DENY toàn bộ logical command, không update tuition hoặc mark paid nợ Kho. |
| 10 | Document authority | clubs/{clubId}/settings/inventory_stats, dynamic <category>\|\|\|<size> fields hiện hữu. |
| 11 | Concurrency boundary | InventoryService canonical delta/validation + caller-owned queued writes trong cùng Firestore runTransaction khi net âm. Update/delete item CAS cùng boundary. |
| 12 | Retry reread? | Có. Raw versions/attempts chứng minh initial same version → conflict → retry → latest stock read. |
| 13 | Cross-domain atomicity? | Profile/Finance/Inventory/debt bundle vẫn một commit; Admission/MultiItem giữ payload owner. |
| 14 | Có split caller commit? | Không. Không stock-first rồi Finance/Profile batch sau. |
| 15 | Canonical stock owner? | InventoryService giữ same SKU/in/out helpers; callers không tính lại stock delta theo thuật toán khác. |
| 16 | New writer/listener? | Không có Finance business writer/listener mới. Có transaction transport và authority reads trong InventoryService hiện hữu. |
| 17 | Extra dynamic reads? | New negative plan1 stats/attempt; edit/delete1 current item và1 stats nếu net âm. Retry đọc lại; inbound create0. Không tuyên bố zero new reads. |
| 18 | Static ownership counts? | getDoc26→24 (thay hai reads bằng tx.get); getDocs43→43; onSnapshot16→16. |
| 19 | Rules change? | Không, byte-identical SHA trong report11. Không nới permission. |
| 20 | Historical negative production? | UNKNOWN. Chưa audit production; không auto reconcile. Fixture recovery có thể còn âm, đúng §18. |
| 21 | Required current regressions? | 41/41 phase gates gồm49/49 stock và40 protected. Default npm check/ancestor freezes KHÔNG GREEN, được báo riêng nguyên trạng tại report10. Không có behavioral RED mới được chứng minh trong current protected gates. |
| 22 | Root/public exact? | 129/129,0 mismatch; source/cache pin verification PASS. |
| 23 | Freeze trước R2.2? | Có thể freeze stock test candidate với evidence scope này. Chưa phải production release/staging latency acceptance. Trước staging R2.2 cần reviewed source-lineage tooling cho candidate mới vì checker latency còn khóa ancestor R1. |

Next: giữ source đã freeze; chuẩn hóa lineage validation của tooling latency cho exact candidate rồi chạy riêng `A9R18-FINANCE-SYNC-LATENCY-R2.2 REAL STAGING ATTRIBUTION`. Chỉ đo bằng real staging samples, không tối ưu Finance từ timing mô hình Kho. Manual historical reconciliation và schema contention nếu cần phải là phase riêng, không nằm trong candidate này.

Full source ZIP: `A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1_FULL_SOURCE_TEST_CANDIDATE.zip`. `SHA256SUMS.txt` bên trong khóa từng file trừ chính nó; outer ZIP SHA nằm ở file `.zip.sha256` kèm theo để tránh self-reference. Diff và log thô trong `evidence/INVENTORY_STOCK_R1/`. ZIP CRC và từng entry hash được kiểm tra sau đóng gói.
