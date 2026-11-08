# Firestore owner budget / parity

| API static call-sites | Baseline | Candidate | Delta |
| --- | --- | --- | --- |
| getDoc | 26 | 26 | 0 |
| getDocs | 43 | 43 | 0 |
| onSnapshot | 16 | 16 | 0 |

Unchanged production security trust-boundary checker chạy cả baseline/candidate đều RC0. Static call-sites không đồng nghĩa billing reads/transaction. Memo chỉ dùng existing breakdown/name/profile memory; không query hoặc persist. Không collection/field mapping/new ID authority/Cloud Function/migration.

Root/public canonical129/129, **0 mismatch**. app root/public identical; finance root/public exact baseline f652...809b. Source identity/cache graph và exact size waiver kiểm chứng pin `V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1`, runtime `36743a31f66abfeca4ae46376faf653ba7759e1e839dfe35e9ab32762636a6df`. Syntax checker PASS.

Outside-family-function app equivalence, protected file hashes, Rules/Indexes/QR Banking/Finance/Debt unchanged: protected-boundaries-and-parity.json. Source-diff-inventory.json giới hạn code hunks. Reports/evidence từ parent được chuyển vào historical handoff directory; không phải runtime changes.

Root SHA256SUMS.txt phủ mọi file của package trừ chính checksum file, gồm historical material. ZIP CRC/full-entry checksums được verify trước handoff; ZIP SHA là companion .zip.sha256 để tránh tự hash vòng.
