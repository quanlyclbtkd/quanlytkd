# R1.1B — Baseline and source freeze

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1B. Evidence handoff; no new business candidate.


Requested input: `A9R18_INVENTORY_STOCK_INTEGRITY_R1_1_EMULATOR_ACCEPTANCE_HANDOFF(1).zip`.
Verified exact bytes SHA-256:

```text
d3dbab7030d5a7f2ea5886a62f6a9901c0fa1d3cf70b238c7e6ed3117b5f404f
```

Làm việc trên hai bản giải nén độc lập. Đã so byte **1888/1888 file input** sau cài dependencies và preflight: tất cả giữ nguyên, gồm package.json, package-lock.json và toàn bộ R1.1 tooling. Không tạo transaction model hoặc harness thay thế; không sửa test expected, aliases, Rules, indexes, business source hay cache tokens.

| Frozen identity | SHA-256 | Result |
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

**261 production files unchanged**:129 root +129 public +Rules/indexes/firebase.json. Root/public129/129,0 mismatch. Production runtime SHA-256 `3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da` và pin `V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1` vẫn nguyên. Không production import nào được thêm cho test tooling.

Per-file proof: `evidence/INVENTORY_R1_1B/SOURCE_FREEZE.json`. Trước đóng gói mọi original file còn nguyên byte; root SHA256SUMS mới là output integrity metadata bắt buộc. Checksum input cũ được giữ ở INPUT_R1_1_SHA256SUMS.txt trong evidence. Dependencies/node_modules không đưa vào ZIP.
