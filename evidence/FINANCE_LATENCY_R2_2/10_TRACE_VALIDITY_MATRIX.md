# 10 — Trace validity

Real staging traces: **0**. Valid pre-ACK traces: **0**. Full staging traces: **0**. Không có sample thật bị loại hoặc sample chậm bị bỏ âm thầm; chưa có sample nào để đánh giá.

| Điều kiện | Unit/tooling | Real staging |
|---|---|---|
| Exact input / production freeze / parity | PASS | Loaded browser identity NOT VERIFIED |
| Native Promise / error identity | PASS | NOT_RUN |
| Write plan / amount / month / profile / query order / commit equivalence | PASS actual-source fake SDK | NOT_RUN |
| Debt operation identity OFF/ON | PASS synthetic diagnostics | NOT_RUN |
| Raw batch ACK vs service return | PASS synthetic clock fixture | NOT_RUN |
| Semantic source/page sampling | PASS fake SDK + SDK-shape adapter fixture | NOT_RUN |
| Overlap / counter reset / UNKNOWN / diagnostic failure invalidate residual | PASS | NOT_RUN |
| Stale club/logout/filter/role tail suppression | PASS synthetic context | NOT_RUN |
| Profile server-fresh → compute → HTML → DOM | Mechanism unit-tested; no real listener/layout | NOT_RUN |
| Privacy adversarial identifiers excluded | PASS observer export | No real export |
| Actual Debt entry point / mobile UI / physical device | NOT VERIFIED by unit harness | NOT_RUN |
| Observer timing perturbation negligible | NOT PROVEN by synthetic equivalence | NOT_RUN |

TCB return, initial click và per-command Debt counters vẫn NOT OBSERVABLE, giữ null. Thiếu marker không biến thành 0. Native Promise reaction timestamp không phải timestamp Firestore server.

Khi có staging, invalid traces phải được lưu với lý do: concurrent owner, stale identity, missing/ambiguous raw ACK, DIAGNOSTIC_FAILURE, counter reset, unknown page/source overlap, hoặc context attribution thất lạc. Các nhóm không đồng nhất không được trộn vào thống kê.
