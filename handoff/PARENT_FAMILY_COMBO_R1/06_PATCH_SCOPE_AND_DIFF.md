# Patch scope and release bookkeeping

Business runtime chỉ ở `app.js`/mirror và `js/modules/finance.js`/mirror: Family input binding, month default, Family report breakdown, Family-only memo helper và hai Family failure messages. Không đổi money pay branch.

Cache-only: `index.html`/mirror và `js/main.js`/mirror, đúng bốn import/loader edges index→app, index→main, main→app fallback, main→finance; token `a9r18-family-combo-correctness-qr-r1-20261107`. Không sửa bootstrap/Finance business behavior. Cần đổi URL để client không dùng app/finance cũ.

Tooling: hai checker mới; source pin mới trong `tools/v11r2/source-identity.mjs` và manifest mới; exact candidate app hash được thêm vào registry của `tools/check-qr-multiitem-memo-r1-2d-app-guard.mjs`. Registry chỉ thêm identity/bytes và áp dụng month-authority check hiện có cho pin mới. Giữ nguyên mọi expected generic helper/pixel-validator hash và các ceiling; không đổi expected tài chính/EMV, không chỉnh R1/R2/R2.1 để che hash freeze FAIL.

App 717487 bytes, 11300 lines, giữ line ceiling11300; existing exact-hash correctness waiver kiểm chứng được new pin, generic memo và pixel verifier unchanged. Không nới 700000 byte target.

10 existing files changed, 3 new code/tooling files trước khi thêm báo cáo/evidence. Chi tiết old/new SHA trong `source-diff-inventory.json`. Exact unified diff: `FAMILY_COMBO_R1_PATCH.diff`; `git apply --check` trên baseline nguyên byte đạt. Không sửa package.json; npm alias writer matrix không có sẵn, chạy trực tiếp file hiện có.

Rollback: phục hồi hai business files + hai cache-entry files và mirror từ exact source ZIP; bỏ new pin/manifest và exact size-registry entry cùng phase. Firestore không có mutation/migration để rollback. Không deploy.
