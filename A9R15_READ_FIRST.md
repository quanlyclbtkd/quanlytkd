# A9R15 — Source kiểm toán, RELEASE_BLOCKED

Baseline ZIP đúng SHA yêu cầu. Đã sửa canonical registration validation/audit và bounded authorized history trong owner hiện hữu. Không deploy, không đọc/ghi production, không migration.

Đọc `A9R15_BAO_CAO_KIEM_TOAN.md`, `evidence/A9R15/SUMMARY.json` và `A9R15_ROLLBACK.md` trước khi thử.

`npm run check` và `npm run check:all` hiện **FAIL_TEST_HARNESS** ở gate cũ. Toàn bộ 159 gate leaf: 154 PASS, 2 FAIL_TEST_HARNESS, 3 RELEASE_BLOCKED. Không đổi business expected/mock để làm xanh. Raw logs được bàn giao riêng.

Không được gọi đây là candidate phát hành. Chưa audit đầy đủ profile/provenance production, chưa có owner READS approval hoặc physical-device acceptance. Rules/indexes, authority, Journal và CAS được giữ nguyên.

Kiểm thử riêng: `npm run check:a9r15-source`, `npm run check:a9r15-registration`, `npm run qa:a9r15-ui`; matrix Rules/SDK/native browser chạy bằng `npm run test:a9r15-emulator` trong Emulator loopback/demo.
