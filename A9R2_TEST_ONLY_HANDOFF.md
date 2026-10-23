# QR V11R6 A9R2 — TEST ONLY · INDEPENDENT REAUDIT

Nguồn bắt buộc: ZIP A8 SHA256 `19cb8d8e4d0b438823d11f404c81462dda5e9eeda443654f3c9ed3f6ff1713dd`; `app.js` SHA256 `74ceab77e8bfb9828baec368d9dc7076a47fd3d0be0516b13d25b231c6954dc0`.

A9R2 kế thừa bản A9R1 (runtime 128 file giữ nguyên); sửa riêng lớp kiểm thử lineage/cache-identity cũ để kiểm tra đúng A9R1. KHÔNG sửa production, Firestore Rules, app.js, QR memo/EMV/CRC, Journal, phí học, dữ liệu sản xuất. Root/public parity vẫn 128/128.

- Auth login A9: 10/10 source-model; CAS repair A9: 14/14 source-model; UI A9R1: desktop/mobile Chromium 2/2 simulated with fake Firestore.
- Attendance V5U6D: 73/73; security/coach boundary: 35/35; default npm check individual: 53 PASS / 1 FAIL (app.js 700531 > 700000 bytes).
- `npm run check:release`: ENV_BLOCKED (Node Playwright dependency unavailable). Firebase Rules Emulator unavailable; QR real PASS/FAIL unavailable; S01 and READS/CAS approval pending.
- RESTRICTION: RELEASE_HOLD / NO_DEPLOY. No production/staging sign-off.

Raw logs, cache lineage changes, READS attribution estimates, rollback: `QR_V11R6_A9R2_EVIDENCE_AND_LOGS.zip`.
