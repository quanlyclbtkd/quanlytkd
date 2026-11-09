# 10 — Firestore read/attempt accounting

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| Measurement | Result |
| --- | --- |
| Production static getDoc | 24→24 |
| Production static getDocs | 43→43 |
| Production static onSnapshot | 16→16 |
| New production listeners | 0 |
| Actual browser transaction attempts | NOT_OBSERVED — operations NOT_RUN |
| Actual inventory_stats transaction reads | NOT_OBSERVED |
| Actual current-item transaction reads | NOT_OBSERVED |
| Actual conflict/retry count | NOT_OBSERVED |
| Browser transaction duration | NOT_MEASURED |

Không báo “zero new reads”. R1 correctness đã đưa vào write-time transaction reads: negative create/Admission/MultiItem plan đọc một stats doc mỗi attempt; negative edit/inbound delete đọc item+stats; increasing edit/outbound delete đọc current item; inbound create không cần authority read. Đây là source/model contract R1, **chưa được đo bằng Browser Emulator R1.1**.

Browser không chạy, vì vậy con số0 business operations executed chỉ mô tả phạm vi thực thi, không phải chứng minh chi phí giao dịch bằng0. Node SDK đã dùng để khởi tạo test environment/nạp Rules; không phải browser finance measurements. Không latency PASS/FAIL threshold, không tối ưu performance, không suy ra độ trễ production từ startup Emulator.

Machine evidence: read-attempt-evidence.json; canonical ACCEPTANCE.json không có operations/reads browser.
