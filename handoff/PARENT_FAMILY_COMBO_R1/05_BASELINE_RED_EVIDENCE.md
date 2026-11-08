# Baseline RED — actual source, fixed behavioral oracle

Baseline identities tại 01_BASELINE_IDENTITY.md. Hai checker mới chạy handler lấy từ actual source. QR checker chạy actual processCombo report, actual queued exportReceipt, memo builder, URL generator và pixel verifier. Wrapper chỉ ghi nhận args/result rồi delegate receipt thật, không bypass builder.

| Checker | Baseline PASS | Baseline FAIL | Candidate PASS | Candidate FAIL |
| --- | --- | --- | --- | --- |
| tools/check-family-combo-autofill-r1.mjs | 25 | 28 | 53 | 0 |
| tools/check-family-combo-qr-r1.mjs | 9 | 30 | 39 | 0 |

Baseline RED đầu tiên được thu trước production patch: autofill 25 PASS/28 FAIL; QR core 7 PASS/26 FAIL. Sau đó thêm các test identifier alias/name-key/hash collision; cùng final QR checker chạy lại trên baseline nguyên byte cho 9 PASS/30 FAIL và candidate 39/39. Không đổi expected để làm candidate xanh. Final checker SHA và exact app/finance SHA mỗi side ở `behavioral-comparison.json`.

Defect A: select Alice → fee=500000, month='', canonical helper calls=0. Defect B: edit Alice→Bob → fee vẫn 500000; select fee=0 vẫn giữ fee cũ. Defect C với Trần Thị Huyền Trang + Nguyễn Văn Minh, month2026-11, cùng verified account → receiptOK=false, MEMO_TOO_LONG, intent, fetches=0, writes=0.

Replay từ candidate:

```bash
FAMILY_TEST_SOURCE_ROOT=/absolute/original-source node tools/check-family-combo-autofill-r1.mjs
FAMILY_TEST_SOURCE_ROOT=/absolute/original-source node tools/check-family-combo-qr-r1.mjs
node tools/check-family-combo-autofill-r1.mjs
node tools/check-family-combo-qr-r1.mjs
```

Baseline executions phải exit1 do RED assertion; candidate exit0. Evidence là Node VM/DOM doubles + actual source + independently decoded synthetic PNG/EMV. Không phải real provider network/staging/mobile evidence. Không tạo production transaction.
