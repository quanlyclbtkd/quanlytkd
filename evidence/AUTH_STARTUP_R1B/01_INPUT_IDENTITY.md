# 01 — Input identity / source freeze

Input: `A9R18_AUTH_TENANT_ISOLATION_STARTUP_R1A_FULL_SOURCE_TEST_CANDIDATE(1).zip`.

Outer SHA-256: `b51972344247cdbf087c8160e6dfc42e582f14badcbe1f3e75d434c937f0796f` — VERIFIED. ZIP CRC: PASS. Bản re-upload được xác định theo đúng tên; bytes local khớp outer hash yêu cầu. Chỉ source được đưa vào cây chạy R1B.

| Canonical file | SHA-256 | Result |
|---|---|---|
| app.js | `4b6066e8fc9fc613cad3471353a5d86fcda87c8ab10ed43b44042ece732ba0eb` | VERIFIED |
| js/main.js | `1b56d270635c857a7100d2d3ed891f43125b3f326c5b09bbbe5e49e9818e8322` | VERIFIED |
| js/utils/listeners.js | `bd572fda452100e79b3eb1ead383efaeb9a48b460db44f75d1d9926e5fffb4cb` | VERIFIED |

Snapshot toàn bộ 1.997 file input ở `INPUT_SOURCE_SHA256.json`. Tất cả file input được giữ riêng, đặt chế độ chỉ đọc và kiểm SHA trước/sau. Không chỉnh file canonical rồi phục hồi. Chỉ thêm file trong `tools/auth-startup-r1b/` và `evidence/AUTH_STARTUP_R1B/`.

Runtime vẫn giữ config canonical của `quanly-tst`; do đó không mở app này để thử race. Chưa tạo staging artifact hoặc deploy. Probe localhost chỉ phục vụ một trang HTML trung tính không có SDK, Auth hoặc tenant data.

Chi tiết browser preflight ở `environment-preflight.json`. Cả 1.997 file source/tooling gốc giữ nguyên, gồm mọi hash/test expectation của R1A.
