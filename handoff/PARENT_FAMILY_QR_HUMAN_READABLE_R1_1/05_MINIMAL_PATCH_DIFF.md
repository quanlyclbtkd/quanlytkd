# Minimal patch and asset identity

Business function duy nhất đổi: `app.js::_receiptFamilyTuitionMemo()` và identical mirror `public/app.js`. AST extraction/replacement proof xác nhận **toàn bộ app.js ngoài function này byte-identical** baseline. Function giữ41 source lines; app giữ11300 lines. Không sửa renderer hay bất kỳ Finance/Debt/autofill function nào.

Finance module root/public không đổi; protected hash f652c2d896180654cf8f1534a916cb7f44ebff3599251070b0ef74eb998c809b. Structured breakdown cũ đủ dùng, không thêm global state/metadata/writer.

Release bookkeeping tối thiểu: index.html và js/main.js cùng mirror chỉ đổi ba loader URL/token index→app, index→main, main→app fallback để tránh client tải code cũ. Main→finance vẫn token parent Family R1. Source identity thêm pin/manifest mới. Exact app hash được đăng ký trong existing size-waiver registry; generic helper/verifier expected hashes và ceiling không đổi.

Tooling được cập nhật theo yêu cầu23: existing Family QR checker thêm fixture R01–R22, quan sát exact intent/provider/preview và đổi các oracle ID/hash-first F19/F20/F21–F25 sang name-first/collision policy. Không sửa các financial/EMV assertion để che regression. Autofill checker, package.json và tất cả required generic QR/Finance/Debt checkers giữ nguyên.

Trước khi thêm reports: 9 existing code/tooling files changed, 1 manifest mới. Exact paths/SHA trong source-diff-inventory.json. Unified diff `FAMILY_QR_MEMO_R1_1.patch`; `git apply --check` trên baseline sạch PASS.

Rollback runtime bằng app/index/main + mirrors từ exact input ZIP; gỡ pin/manifest/registry entry R1.1 nếu rollback source tooling. Không có data migration hoặc persisted reference để rollback. Không deploy.
