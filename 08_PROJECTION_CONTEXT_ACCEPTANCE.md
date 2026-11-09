# 08 — Projection/context acceptance

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| ID | Required actual acceptance | Actual |
| --- | --- | --- |
| P01 | rejected transaction →zero local success projection | NOT_RUN |
| P02 | local projection only after real SDK ACK/promise release | NOT_RUN |
| P03 | post-ACK context switch keeps original commit and suppresses wrong UI | NOT_RUN |
| P04 | generation change after server read aborts pre-commit | NOT_RUN |

Spies chỉ được cài trong isolated test browser window, cho mergeInventoryIntoRuntimeStore, removeInventoryFromRuntimeStore, mergeTransactionIntoRuntimeStore và notifyInventoryMutation. Không debug flag/log/counter mới trong production.

Tooling phân biệt real SDK ACK với release của test wrapper. P02 giữ wrapper sau khi real SDK đã resolve để kiểm tra chưa có projection trong lúc caller còn chờ; P03 đổi club/generation sau real ACK; P04 đổi generation sau actual transaction read, trước replay/commit. Các thao tác này chưa chạy.

Không suy luận rollback của giao dịch đã ACK, không gọi post-ACK switch là write failure. R1 model context/projection và các focused protected regressions vẫn GREEN; không thay thế real acceptance còn NOT_RUN.
