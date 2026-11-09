# 07 — Create and concurrency GREEN

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.

| Case | Result |
| --- | --- |
| C01 create outbound stock authority | PASS |
| C02 create outbound stock authority | PASS |
| C03 create outbound stock authority | PASS |
| C04 create outbound stock authority | PASS |
| C05 create outbound stock authority | PASS |
| C06 create outbound stock authority | PASS |
| C07 create outbound stock authority | PASS |
| C08 inbound recovery of historical negative is permitted without a stock read | PASS |
| C09 stock decrease on historical negative DENY | PASS |
| C10 Inventory form insufficient stock leaves no Finance/history writes | PASS |
| C11 Inventory form double tap one logical commit | PASS |
| R01 independent clients share initial version and retry/revalidate | PASS |
| R02 independent clients share initial version and retry/revalidate | PASS |
| R03 independent clients share initial version and retry/revalidate | PASS |
| R04 concurrent inbound and too-large outbound is serializable and never negative | PASS |
| R04B inbound ACK before outbound read allows exactly covered sale | PASS |
| FALLBACK legacy form cannot bypass canonical stock/Finance atomicity | PASS |
| CTX no projection from committed A into newly active B | PASS |
| R06 disjoint SKUs may contend on one stats doc but both revalidate and commit | PASS |
| P01 unresolved primary ACK produces no early Inventory/Finance projection | PASS |
| P02 SDK rejection yields no writes/projection and a human unconfirmed error | PASS |
| CTX02 Admission draft edit during new stock read aborts entire uncommitted envelope | PASS |
| CTX03 MultiItem session invalidated during stock read has zero business writes | PASS |
| C12 invalid authoritative numeric field never becomes local unpaid/zero evidence | PASS |
| C13 actual zero-price gift preserves stock authority and one atomic Finance effect | PASS |
| C14 actual zero-price gift preserves stock authority and one atomic Finance effect | PASS |
| C15 actual unpaid outbound cannot bypass insufficient stock | PASS |
| C16 actual inbound with missing stock field stays one cheap atomic item/Finance commit | PASS |

C01 5−4=1; C02 5−5=0; C03/C04 dư lượng không đủ DENY; C05 thiếu authority DENY. C06/C07 invalid qty DENY trước reads. C08 tăng stock lịch sử âm được phép; C09 giảm tiếp bị từ chối. C10 không có Finance/history write khi form thiếu tồn. C11 double submit cùng form chỉ một canonical effect.

R01 (4+4) và R03 (3+3) chỉ một commit. R02 (3+2) cả hai có thể commit sau retry, final=0. R04 inbound/outbound song song cho serializable result không âm; sample này outbound đọc 5 và bị từ chối, inbound sau đó cho final10. R04B inbound đã ACK trước outbound cho final3. R05 re-read được assert trực tiếp trong R01/R02/R03; không bịa một sample ID rời. R06 cho thấy retry cả khi hai SKU khác nhau cùng stats doc.

C13–C15: quà tặng zero-price và bán ghi nợ vẫn phải có stock authority; không đi tắt vì amount=0/unpaid. C14 stock đủ giữ chứng từ tặng amount=0. C16 nhập kho không cần stock read, item/stats/Finance cùng một batch. P01 không project Inventory/Finance trước unresolved primary ACK; P02 final SDK rejection không ghi/project giả và trả human unconfirmed error.

Runtime error mapping không giả định network rejection đồng nghĩa “chắc chắn chưa ghi” ở mọi điều kiện mạng; mã `INVENTORY_WRITE_UNCONFIRMED` yêu cầu kiểm tra lại, không tự retry nghiệp vụ. Mô hình injected rejection được đặt trước atomic apply nên bằng chứng zero write ở P02/A04 chỉ thuộc fixture đó.
