# 06 — Edit/delete CAS

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| ID | Required acceptance | Actual |
| --- | --- | --- |
| E01 | outbound edit enough stock | NOT_RUN |
| E02 | outbound edit insufficient | NOT_RUN |
| E03 | inbound reduction safe | NOT_RUN |
| E04 | inbound reduction unsafe | NOT_RUN |
| E05 | real second-client edit makes previous stale →ITEM_STALE | NOT_RUN |
| D01 | delete outbound increases balance | NOT_RUN |
| D02 | delete inbound safe | NOT_RUN |
| D03 | delete inbound unsafe, related Finance preserved | NOT_RUN |
| D04 | two clients delete once, one ledger reversal | NOT_RUN |

Không có business seed hoặc edit/delete thật trong canonical run. Tooling dùng actual updateItem/deleteItem và options shape hiện hữu; related transaction được seed bằng fixture, không dựng lại Finance business policy. Case D04 định nghĩa inbound5/outbound3/balance2 nhất quán để sau một reversal còn inbound5, balance5, out0.

Không sửa CAS, stale previous policy, quantity validation, delete behavior hoặc Finance liên kết của R1. Các ca model corresponding trong R149/49 vẫn qua; real Emulator cases này chưa được xác minh.
