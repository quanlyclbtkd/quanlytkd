# QR integrity / generic compatibility

| Required checker | Command | Result |
| --- | --- | --- |
| qr-intent | node tools/check-qr-report-render-payment-intent.mjs | PASS (RC=0) |
| qr-account | node tools/check-qr-v4-payment-account-authority.mjs | PASS (RC=0) |
| a9r6 | node tools/a9r6/qr-provider-memo-regression.test.mjs | PASS (RC=0) |
| generic-multiitem | node tools/check-qr-multiitem-memo-r1-2d1.mjs | PASS (RC=0) |

A9R6 12/12: verbose42 → safely compact, exact EMV match; provider truncation and wrong amount DENY. Generic multi-item regression 1/3/6/9/12 giữ existing behavior, bao gồm fail-closed MEMO_TOO_LONG của các long generic package. Cross-year và sparse package không bị rút thành first-month-only.

Existing generic output `Tran Thi Huyen Trang HP T11 2026` byte-identical. AST/source bytes của _receiptPaymentMemo, _receiptTuitionMemo, generateVietQR, _receiptDecodeEMV và _verifyReceiptQrPixels đều giống baseline. Không đổi account resolver, QR Banking module, CRC/media validation hoặc verifier.

Family matrix F01–F20 covered; additional F21/F22 reject duplicate IDs/current-cache collision, F23 identifier priority, F24 canonical-name-key fallback without persistence, F25 real 32-bit derived hash collision DENY. Head/tail truncation, case mutation, wrong amount/bank/account all QR_EMV_MISMATCH; conflicting receiving accounts ACCOUNT_ALIAS_CONFLICT before fetch.

Tests run actual receipt source with verified settings callback fixture and synthetic provider image. Independent jsQR decodes provider and preview PNG. Đây không phải live VietQR HTTP acceptance hoặc full browser/mobile layout proof. 40 chỉ là existing local safety invariant; không tuyên bố provider official maximum=40. PAID receipt path không được Family metadata opt-in và không tạo QR mới.
