# Finance regression

| Gate | Executed command | Result | Raw log |
| --- | --- | --- | --- |
| finance-writer | node tools/check-finance-write-writer-matrix-r1-1.mjs | PASS (RC=0) | FAMILY_COMBO_R1_EVIDENCE/final-finance-writer.log |
| finance-evidence | npm run check:finance-write-evidence-r1-1 | PASS (RC=0) | FAMILY_COMBO_R1_EVIDENCE/final-finance-evidence.log |
| tuition-month | npm run check:finance-tuition-month-authority-r1-2 | PASS (RC=0) | FAMILY_COMBO_R1_EVIDENCE/final-tuition-month.log |
| tuition-context | npm run check:finance-tuition-intent-context-r1-2a | PASS (RC=0) | FAMILY_COMBO_R1_EVIDENCE/final-tuition-context.log |
| debt-authority | npm run check:debt-authoritative-tuition-coverage | PASS (RC=0) | FAMILY_COMBO_R1_EVIDENCE/final-debt-authority.log |
| tuition-source | npm run check:tuition-debt-source-of-truth | PASS (RC=0) | FAMILY_COMBO_R1_EVIDENCE/final-tuition-source.log |

`check:finance-write-writer-matrix-r1-1` npm alias không tồn tại cả baseline lẫn candidate. File checker có sẵn được chạy trực tiếp, unchanged; baseline và candidate đều PASS. Không thay package/test expectations để xử lý alias.

New actual processCombo pay tests: one atomic plan, two tuition transactions, two profile updates, no local success/receipt before unresolved primary ACK, repeated click one primary plan, rejected commit no local projection/receipt. One participant đã PAID ở write-time evidence thì zero atomic write, zero partial write, zero receipt. Existing FinanceService + TuitionCommandBoundary regressions bổ sung coverage cho writer/settlement/context.

Pay branch byte-identical với baseline (hash trong protected-boundaries-and-parity.json). FinanceService, TuitionCommandBoundary, DebtProfileReadBoundary, canonical debt, profile listener, Rules/Indexes nguyên byte. Presentation autofill/Family QR không thay financial authority.

## Broad checks and historical identity freezes — not hidden

`npm run check` final RC=1: chạy qua các gate tới cuối, R1 latency 57/58, chỉ FAIL assertion đòi app.js SHA đúng a1a999... của baseline R1. Candidate Family sửa app.js theo scope nên SHA34eabb... là thay đổi có chủ đích. Không gọi aggregate này PASS.

Extra R2=65/66 và R2.1=102/103: mỗi gate chỉ FAIL exact identity V11R6_A9R18_FINANCE_WRITE_LATENCY_R1; actual verified pin là FAMILY_COMBO_CORRECTNESS_QR_R1. Không sửa các assertion này. Đây là các phase có contract freeze runtime riêng, cần rebaseline tooling khi trở lại R2.2; không phải bằng chứng một lỗi runtime mới. Raw logs được giữ. Không dùng scope Family PASS làm production release approval.
