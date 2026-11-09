# 05 — Concurrency root cause

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.


Baseline `writeBatch + increment` bảo đảm các writes cùng plan atomic, nhưng không compare tồn còn lại. Hai client độc lập có thể mỗi client commit xuất 4 từ stock=5: cả hai thành công, final=−3. Single-flight của một form không thể bảo vệ hai client. Một getDoc rồi batch sau đó cũng không giải quyết TOCTOU.

Candidate đưa authoritative read và toàn bộ plan vào `runTransaction`. MVCC harness có doc versions, read set, atomic staged ops, conflict detection và callback retry; không dùng chuỗi `await A(); await B()` để gọi đó là race. R01/R02/R03 có barrier: A và B đều đọc cùng initial version trước commit; A đổi version; B bị conflict; callback B chạy lại và đọc stock mới. B chỉ được commit nếu lần đọc mới vẫn đủ.

Callback không project local state, không hiện success và không gọi secondary Finance writer. SDK sở hữu retry; `_runStockTransaction` chỉ map lỗi cuối sau khi SDK kết thúc retry. Không có polling/fixed wait/artificial retry trong runtime.

| Case | Final balance (SKU170) | Business commits | Conflicts/retries | TX document reads | Model transaction durations |
| --- | --- | --- | --- | --- | --- |
| R01 | 1 | 1 | 1 | 3 | A: attempts=1, COMMIT, 0.48941500000000815 ms; B: attempts=2, DENY, 0.41844800000001214 ms |
| R02 | 0 | 2 | 1 | 3 | A: attempts=1, COMMIT, 0.31765699999999697 ms; B: attempts=2, COMMIT, 0.16828200000000493 ms |
| R03 | 2 | 1 | 1 | 3 | A: attempts=1, COMMIT, 0.45230900000001384 ms; B: attempts=2, DENY, 0.2751440000000116 ms |
| A03 | 0 | 1 | 1 | 3 | A: attempts=1, COMMIT, 1.0888869999999997 ms; B: attempts=2, DENY, 0.49143900000001395 ms |
| M03 | 1 | 1 | 1 | 3 | A: attempts=1, COMMIT, 6.608330000000024 ms; B: attempts=2, DENY, 0.3224250000000666 ms |
| R06_DIFFERENT_SKUS_CONTENTION | 1 | 2 | 1 | 3 | A: attempts=1, COMMIT, 0.49102800000002844 ms; B: attempts=2, COMMIT, 0.32971599999996215 ms |

Tất cả duration ở bảng là thời gian thực thi mô hình Node, giữ số đo thô, **không phải latency Firestore/network/staging**. Cùng một summary doc gây contention cả giữa hai SKU độc lập (R06); đây là chi phí đúng đắn của schema hiện hữu, không đổi per-SKU schema trong R1.

Mô hình không giả lập Security Rules, network retransmission, billing hay toàn bộ Firebase SDK. Các log conflict chứng minh thuật toán compare-and-commit/revalidation của actual source; staging/emulator acceptance vẫn chưa được thực hiện.
