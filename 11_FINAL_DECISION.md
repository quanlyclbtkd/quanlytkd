# Final decision — scoped Family test candidate

**PASS — ba defect Family và các acceptance/regression bắt buộc của Family R1.**

- Family month/stale-row: 53/53 GREEN.
- Family report QR/pay boundary: 39/39 GREEN, gồm long names, periods, collision DENY, mutations DENY, zero report business writes.
- 10 required Finance/Debt/QR regression commands: RC0. Writer matrix chạy trực tiếp vì baseline không có npm alias.
- Firestore26/43/16 unchanged, root/public129/129, exact source/cache identity verified; no deploy.

**Không gọi toàn bộ aggregate gate GREEN:** npm run check còn RC1 vì R1 khóa app SHA cũ (57/58); extra R2/R2.1 còn 1 identity assertion FAIL mỗi gate (65/66,102/103). Các log và phần giải thích nằm ở 08_FINANCE_REGRESSION.md. Không sửa expected của các freeze gate để che thay đổi Family được yêu cầu. Do đó đây là FULL_SOURCE_TEST_CANDIDATE, không phải production release approval hoặc real mobile/staging acceptance.

## 20 required answers

| # | Question | Answer |
| --- | --- | --- |
| 1 | Family trước không load tháng nợ | Autocomplete chỉ fill fee, không gọi helper/gán month; baseline RED actual handler. |
| 2 | Canonical helper hiện dùng | window.getChargeableTuitionMonths(profile,horizonMonth,{reason:'family-combo-autofill'}), existing computeTuitionDebtCanonical owner. |
| 3 | Nhiều tháng nợ chọn month nào | owedMonths[0], đúng thứ tự canonical; không sort trong autofill. |
| 4 | Sửa tên có clear state cũ? | Có, clear month/fee_actual/fee_display ngay trong input handler và update total. |
| 5 | Fee=0 có giữ fee trước? | Không; zero/undefined/nonfinite/nonpositive clear fee fields. |
| 6 | Thêm Firestore read/listener? | Không. RAM only; static counts không đổi. |
| 7 | Vì sao QR Family MEMO_TOO_LONG | Hai full names bị dùng làm generic reference + HP/period vượt local safety40. |
| 8 | Trước hay sau provider fetch? | Trước fetch: baseline reason MEMO_TOO_LONG, stage=intent, providerFetches=0. |
| 9 | Metadata memo mới | Structured Family breakdown: names, participantKey, existing compact ID candidates, exact one month/participant, amounts/labels. |
| 10 | Còn full names trên receipt? | Có, header và per-participant breakdown labels. |
| 11 | Memo tối đa | 40 ASCII characters; all participants/periods retained, otherwise Family-specific DENY. |
| 12 | 40 là official VietQR limit? | NO. Existing application safety invariant. |
| 13 | Generic Tuition output đổi? | Không; exact existing single/multi-item/cross-year behavior protected; long generic MEMO_TOO_LONG retained. |
| 14 | Nới exact EMV verifier? | Không; decoder/verifier/generator generic unchanged byte-for-byte. |
| 15 | Khác receiving account còn DENY? | Có: ACCOUNT_ALIAS_CONFLICT trước fetch, không chọn participant đầu/bank1. |
| 16 | Family report business write? | 0. Existing receipt/QR only; spies throw if SDK/writer reached. |
| 17 | Family pay one canonical atomic writer? | Có. Pay branch identical; existing mutation lanes → unpaid server gate → atomic plan → local commit. Tests two tx/two profile updates, PAID→zero plan, reject→no partial UI. |
| 18 | Static Firestore budget đổi? | Không: 26 / 43 / 16 trước và sau. |
| 19 | Root/public parity? | 129 pairs, 0 mismatch. |
| 20 | RED→GREEN ở đâu? | 05_BASELINE_RED_EVIDENCE.md, 07_CANDIDATE_GREEN_EVIDENCE.md và FAMILY_COMBO_R1_EVIDENCE/{behavioral-comparison.json,*-final.log,*-final.json}. |

## Handoff and next phase

Full source ZIP chứa runtime hoàn chỉnh, mirror, hai executable Family checkers, 11 reports, diff, evidence và SHA256SUMS.txt. Rollback về exact nested baseline ZIP; không có persisted Family/payment ID hoặc dữ liệu migration.

Sau scoped Family correctness + Family QR + required Finance regressions PASS, bước tiếp theo là quay lại R2.2 trên đúng candidate mới: cập nhật baseline identity được chấp thuận trong tooling của phase đo, cung cấp staging host/project/CLB test/phiên Admin và thu mẫu thật. Không gộp latency optimization hoặc generic 3/6/9/12 QR redesign vào patch Family này. Chưa có real staging samples/mobile acceptance trong phase hiện tại.
