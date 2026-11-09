# Exact baseline — Family QR Human-Readable Memo R1.1

Ngày: 07/11/2026, Asia/Saigon. Input được tải từ đúng tệp `(1).zip`, xác minh SHA/CRC rồi trích hai bản baseline/candidate độc lập.

| Identity | SHA-256 |
|---|---|
| A9R18_FAMILY_COMBO_CORRECTNESS_QR_R1_FULL_SOURCE_TEST_CANDIDATE(1).zip | ffd5a5d1a2326bdf4600191ff26dcb2fa8776566b74fb4e5284ca2617a4447d4 |
| Baseline app.js | 34eabb10a15e7b5261c489df8c3d6a20fa4f592e2268852bd330f8c185c196bf |
| Baseline js/modules/finance.js | f652c2d896180654cf8f1534a916cb7f44ebff3599251070b0ef74eb998c809b |
| Candidate app.js | 0a5aae9518fe265283db47aea2b89fd25f98c50baf85eaaa45c5caadf1e2cc10 |
| Candidate js/modules/finance.js — unchanged | f652c2d896180654cf8f1534a916cb7f44ebff3599251070b0ef74eb998c809b |
| Candidate canonical runtime | 36743a31f66abfeca4ae46376faf653ba7759e1e839dfe35e9ab32762636a6df |

Baseline có 1529 file trong ZIP; canonical runtime có129 file. New pin `V11R6_A9R18_FAMILY_QR_HUMAN_READABLE_MEMO_R1_1`. `APP_BUILD_VERSION` kế thừa được giữ; ba actual app/main load edges dùng token `a9r18-family-qr-human-readable-memo-r1-1-20261107`. Finance import URL/token và finance.js nguyên byte.

Không deploy, không sửa dữ liệu/Rules/Indexes. Không mở lại Finance latency, Debt architecture, Family autofill hoặc writer. Parent reports/evidence nằm ở `handoff/PARENT_FAMILY_COMBO_R1`; đó là lịch sử của input ZIP, không phải kết luận R1.1. SHA256SUMS.txt ở root là checksum của candidate hiện tại.
