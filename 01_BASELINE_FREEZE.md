# 01 — Baseline freeze

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.


Input: `A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1_FULL_SOURCE_TEST_CANDIDATE(1).zip`.

```text
ZIP SHA-256: 926e7b3c32fde72229f84204e2ae2faa807f4d8e1cab104c6ac0632b7f45d010
Runtime SHA-256: 3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da
Pin: V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1
```

Đã xác minh toàn bộ **1825/1825** file của baseline với ZIP, zero modification. Runtime của handoff bằng nguyên runtime R1, không có source pin/build version mới. R1.1 không phải một production candidate mới.

| Frozen file | Expected SHA-256 | Result |
| --- | --- | --- |
| js/services/inventory.service.js | f2196d39cb296ca9b8eeaa4464217d22126eed567f2496a7975a79b352200484 | MATCH |
| js/modules/inventory.js | a04e2ddb022025a4b7ade86d4ba551a45b2d33321c6aa6d6d837644a0f0a1235 | MATCH |
| js/modules/students.js | c96acce064bacca69196d430e84012f8f2de49c0f0c3a3fcb700f3fc6fb901a2 | MATCH |
| app.js | 922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619 | MATCH |
| firestore.rules | 1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3 | MATCH |
| firebase.json | 5a7aa67432f9601838edfc7e162e06fb7f9a9916b0109e3330b575b8d3b55814 | MATCH |
| public/js/services/inventory.service.js | f2196d39cb296ca9b8eeaa4464217d22126eed567f2496a7975a79b352200484 | MATCH |
| public/js/modules/inventory.js | a04e2ddb022025a4b7ade86d4ba551a45b2d33321c6aa6d6d837644a0f0a1235 | MATCH |
| public/js/modules/students.js | c96acce064bacca69196d430e84012f8f2de49c0f0c3a3fcb700f3fc6fb901a2 | MATCH |
| public/app.js | 922c86bab2b085b36ec8eeb23f4d0bdc3652cf1eb131ac466939a2a5bf5a9619 | MATCH |

Ngoài10 identity nêu trực tiếp trong yêu cầu, đã so sánh **261 file production** (129 root +129 public +Rules/indexes/firebase.json): tất cả nguyên byte. Finance service, TuitionCommandBoundary, Finance module và toàn bộ R1 checker/tools không bị sửa. Package.json chỉ thêm hai alias, không đổi script/dependency hiện hữu; package-lock giữ nguyên.

Raw proof: `evidence/INVENTORY_R1_1/baseline-freeze.json`, `exact-baseline-integrity.json`, `source-freeze-tooling.json`, `runtime-profile-final.json`.
