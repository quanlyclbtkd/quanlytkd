# 01 — Exact baseline identity

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.


Input: `A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1_FULL_SOURCE_TEST_CANDIDATE(1).zip`.

```text
ZIP SHA-256       dbb1f6c042a139baa3606a0ca78a0472959acd624ab4fceb6ba69ed4b6a40a90
Parent runtime    36743a31f66abfeca4ae46376faf653ba7759e1e839dfe35e9ab32762636a6df
Parent app.js     0a5aae9518fe265283db47aea2b89fd25f98c50baf85eaaa45c5caadf1e2cc10
Parent finance.js f652c2d896180654cf8f1534a916cb7f44ebff3599251070b0ef74eb998c809b
Candidate runtime 3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da
```

Đã so sánh byte của toàn bộ **1574/1574** file trong baseline với ZIP đầu vào sau khi chạy kiểm thử: **không có file baseline bị sửa**. Baseline và candidate được giải nén vào hai thư mục độc lập. Parent manifest/pin và toàn bộ các pin lịch sử giữ nguyên; pin mới là `V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1`.

Evidence: `evidence/INVENTORY_STOCK_R1/baseline-integrity-frozen.json`, `baseline-identity.json`, `CHECKER_AND_SOURCE_IDENTITY.json`, `source-audit.json`.

Môi trường kiểm thử: Node v24.22.1, Python Python 3.12.14. Browser runtime vẫn dùng Firebase modular SDK 10.7.1 hiện hữu. Không có Firebase CLI/emulator JAR cài sẵn trong workspace; vì vậy dùng mô hình optimistic MVCC xác định, như phase cho phép. Không gọi Firestore production/staging; không có dữ liệu lịch sử production được đọc. Không coi mô hình này là bằng chứng emulator, mobile thật hoặc latency staging.

Các báo cáo root của Family R1.1 được lưu nguyên bản tại `handoff/PARENT_FAMILY_QR_HUMAN_READABLE_R1_1/`. Báo cáo và checksum lịch sử trong các handoff khác là bằng chứng của phase cũ, không mô tả candidate hiện tại.
