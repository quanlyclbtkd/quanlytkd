# A9R10 — Mẫu kết quả PASS / FAIL

## 1. Hai cổng dữ liệu
| Gate | PASS khi | FAIL/HOLD khi |
|---|---|---|
| S01 server | Snapshot staging đầy đủ, fixed-read-time, terminal empty page, đúng Rules/index/runtime, candidate authority cohort = 0, provenance hợp lệ | Thiếu snapshot, cohort > 0, thiếu trang, Rules/runtime đổi giữa scan, provenance không đủ |
| Journal fleet | Đủ mọi thiết bị trong roster, V1/V2 = 0 hoặc đã review riêng, V3 không pending/inflight/conflict/needs-review, ACK cuối khớp `attendanceVersion`, legacy `offline_queue` rỗng | Thiếu thiết bị, queue còn dữ liệu, ACK không có server doc/sai version, V1/V2 chưa reconcile, foreign V3 chưa capture |

## 2. Nghiệm thu HLV staging
Kết quả chỉ PASS khi 18/18 ca trong `A9R10_COACH_ACCEPTANCE.template.json` là `PASS`, mỗi ca có ít nhất một SHA-256 bằng chứng, `financeWrites=0`, `productionWrites=0`, `attendanceWriterCount=1`.

## 3. Trạng thái cuối
- `STAGING_EVIDENCE_REVIEW_COMPLETE_NOT_RELEASE`: hai cổng dữ liệu staging đạt.
- `STAGING_COACH_ACCEPTANCE_PASS_NOT_RELEASE`: HLV staging đạt 18/18.
- `A9R10_STAGING_ACCEPTANCE_COMPLETE_NOT_PRODUCTION_RELEASE`: A9R10 staging hoàn tất; **không phải phê duyệt production**.
- Bất kỳ FAIL/BLOCKED/PENDING nào: `A9R10_HOLD`.
