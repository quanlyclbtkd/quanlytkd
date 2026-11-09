# 04 — SDK10 and InventoryService acceptance

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| Requirement | State |
| --- | --- |
| appSDK.SDK_VERSION ===10.7.1 in browser | NOT_OBSERVED |
| Actual InventoryService imported in browser | NOT_RUN |
| C01 outbound4 from5 →1 | NOT_RUN |
| C02 outbound5 from5 →0 | NOT_RUN |
| C03 outbound6 from5 →DENY | NOT_RUN |
| C04 missing /NaN stock →UNVERIFIED | NOT_RUN |

Các file SDK10.7.1 được tái sử dụng đúng đường dẫn tools/a9r13/vendor/firebase-10.7.1/. HTTP server test chỉ rewrite import firebase-app từ gstatic sang file vendored local trong response, không sửa source trên đĩa. InventoryService được định nghĩa import trực tiếp `/js/services/inventory.service.js`, không copy stock helper/validation/error mapping vào test.

Tooling có assertion runtime SDK_VERSION và SHA của module response. Chúng chưa thực thi vì Chromium không khởi động. Trường `expectedBrowserSdk=10.7.1` chỉ là yêu cầu; `observedBrowserSdk=null`, clients=[] và servedSources=[] trong canonical JSON.

Không dùng Node Firebase12 để chạy các case này rồi gọi Browser acceptance PASS. Không boot index/main hay toàn SPA. Production source và tất cả vendor files nguyên byte.
