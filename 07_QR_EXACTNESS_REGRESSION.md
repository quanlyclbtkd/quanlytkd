# QR exactness / generic compatibility

| Required gate | Executed command | Result |
| --- | --- | --- |
| qr-intent | node tools/check-qr-report-render-payment-intent.mjs | PASS (RC=0) |
| qr-account | node tools/check-qr-v4-payment-account-authority.mjs | PASS (RC=0) |
| generic-multiitem | node tools/check-qr-multiitem-memo-r1-2d1.mjs | PASS (RC=0) |
| a9r6 | node tools/a9r6/qr-provider-memo-regression.test.mjs | PASS (RC=0) |

Family checker66/66 gồm matrix R01–R21 và overflow R22: ảnh thật tương ứng fixture, accents, normal names, all period formats, LAST2 fit, LAST1 compaction, suffix expansion, identical normalized full names, name+ID only when needed, name+deterministic suffix, no opaque-only success, repeat determinism và exact five-surface equality.

F11–F16 giữ nguyên fail-closed coverage: tail/head truncation, case mutation, wrong amount/bank/account đều QR_EMV_MISMATCH; vẫn một provider response được audit, zero business writes. F10 khác receiving accounts ACCOUNT_ALIAS_CONFLICT trước provider; same verified receiving account across branches PASS. F21–F25 vẫn kiểm collision/identifier priority theo policy mới, không bỏ security coverage.

Generic _receiptPaymentMemo/_receiptTuitionMemo/generateVietQR/_receiptDecodeEMV/_verifyReceiptQrPixels nằm ngoài changed function nên nguyên byte. Generic output Tran Thi Huyen Trang HP T11 2026 tiếp tục byte-identical. A9R6 12/12: verbose42→safe compact→exact match; truncation/wrong amount DENY. Generic 3/6/9/12 long memo có thể vẫn MEMO_TOO_LONG theo existing policy; không mở rộng patch.

Raw logs/parsed66 assertion records trong FAMILY_QR_MEMO_R1_1_EVIDENCE. Pixel PNG có dữ liệu synthetic được encode từ provider fixture URL, không live HTTP. Preview validation chạy thật trên fixture PNG; canvas layout boundary được mô phỏng. Không claim production/mobile acceptance từ các test này.
