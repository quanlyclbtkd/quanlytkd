# 13 — Protected regressions

24 focused current gates PASS. Hai frozen legacy harness FAIL giống hệt trên pristine baseline; ba historical latency checkers FAIL ở ancestor identity assertions. Không gọi 29/29 PASS và không sửa checker/production để chiều expected cũ.

| Checker dưới tools/ | Exit | Classification | Evidence |
|---|---:|---|---|
| `check-finance-write-writer-matrix-r1-1.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-finance-write-writer-matrix-r1-1.mjs.log) |
| `check-finance-write-evidence-r1-1.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-finance-write-evidence-r1-1.mjs.log) |
| `check-finance-tuition-month-authority-r1-2.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-finance-tuition-month-authority-r1-2.mjs.log) |
| `check-finance-tuition-intent-context-r1-2a.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-finance-tuition-intent-context-r1-2a.mjs.log) |
| `check-tuition-settlement-write-state-r1-1a.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-tuition-settlement-write-state-r1-1a.mjs.log) |
| `check-tuition-settlement-r1-1a-app-guard.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-tuition-settlement-r1-1a-app-guard.mjs.log) |
| `check-debt-authoritative-tuition-coverage.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-debt-authoritative-tuition-coverage.mjs.log) |
| `check-tuition-debt-source-of-truth-v4c.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-tuition-debt-source-of-truth-v4c.mjs.log) |
| `check-debt-actions-sync.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-debt-actions-sync.mjs.log) |
| `check-family-combo-autofill-r1.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-family-combo-autofill-r1.mjs.log) |
| `check-family-combo-qr-r1.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-family-combo-qr-r1.mjs.log) |
| `check-admission-postcommit-context-r1-2c.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-admission-postcommit-context-r1-2c.mjs.log) |
| `check-admission-draft-snapshot-r1-3a.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-admission-draft-snapshot-r1-3a.mjs.log) |
| `check-h8r2-1c1f1d1c1-admission-atomic.mjs` | 1 | STALE_TEST_HARNESS | [`log`](logs/check-h8r2-1c1f1d1c1-admission-atomic.mjs.log) |
| `check-h8r2-1c1f1d1-multiitem-inventory-closure.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-h8r2-1c1f1d1-multiitem-inventory-closure.mjs.log) |
| `check-h8r2-1c1f1d1c1-inventory-atomic.mjs` | 1 | STALE_TEST_HARNESS | [`log`](logs/check-h8r2-1c1f1d1c1-inventory-atomic.mjs.log) |
| `check-inventory-stock-authority-r1.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-inventory-stock-authority-r1.mjs.log) |
| `check-qr-report-render-payment-intent.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-qr-report-render-payment-intent.mjs.log) |
| `check-qr-v4-payment-account-authority.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-qr-v4-payment-account-authority.mjs.log) |
| `check-qr-multiitem-memo-r1-2d1.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-qr-multiitem-memo-r1-2d1.mjs.log) |
| `check-qr-multiitem-memo-r1-2d.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-qr-multiitem-memo-r1-2d.mjs.log) |
| `check-qr-multiitem-memo-r1-2d-app-guard.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-qr-multiitem-memo-r1-2d-app-guard.mjs.log) |
| `a9r6/qr-provider-memo-regression.test.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/a9r6_qr-provider-memo-regression.test.mjs.log) |
| `check-auth-context-single-writer.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-auth-context-single-writer.mjs.log) |
| `check-production-security-trust-boundary.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-production-security-trust-boundary.mjs.log) |
| `check-security-coach-branch-boundary.mjs` | 0 | PASS_CURRENT_FOCUSED_GATE | [`log`](logs/check-security-coach-branch-boundary.mjs.log) |
| `check-finance-write-latency-r1.mjs` | 1 | HISTORICAL_LINEAGE_MISMATCH | [`log`](logs/check-finance-write-latency-r1.mjs.log) |
| `check-finance-write-latency-r2.mjs` | 1 | HISTORICAL_LINEAGE_MISMATCH | [`log`](logs/check-finance-write-latency-r2.mjs.log) |
| `check-finance-write-latency-r2-1.mjs` | 1 | HISTORICAL_LINEAGE_MISMATCH | [`log`](logs/check-finance-write-latency-r2-1.mjs.log) |

Các kết quả chính: Finance month authority 85/85, intent/context 37/37, settlement 25/25, Debt coverage 32/32, Debt action sync 17/17, Family autofill 53/53, Family QR 66/66, Inventory actual-source stock 49/49, Admission post-commit 9/9, auth-context 40/40, production security 41/41, Coach branch 35/35; các gate writer/evidence/source-of-truth/MultiItem/QR còn lại exit 0, chi tiết trong logs.

Historical latency R1 = 55 PASS / 3 FAIL (protected old hashes app/service/TCB), R2 = 65/1 (old runtime pin), R2.1 = 102/1 (old runtime pin). Tất cả phân loại HISTORICAL_LINEAGE_MISMATCH; không phải bằng chứng Finance behavior RED.

Legacy Admission atomic checker assert commits=1 nhưng actual=0 tại dòng 206; legacy Inventory atomic có 6 failed commit assertions. Fixture không cung cấp verified auth context hiện hành, và SDK giả chỉ có writeBatch thay vì stock runTransaction hiện được yêu cầu. Cả hai đã chạy lại unchanged trên pristine input, logs sau normalize chỉ root path là byte-identical. Phân loại STALE_TEST_HARNESS; không xóa, không sửa test, không miễn current authority. Actual-source Inventory 49/49 hiện hành bao gồm Admission uniform/zero partial write, MultiItem và direct Inventory integration.

Real Emulator acceptance 30/30 là evidence đã có trong input, không được rerun hoặc gọi là latency staging acceptance ở phase này.

Không có runtime correctness RED thật được chứng minh trong R2.2. Real staging correctness chưa được kiểm tra. Hashes/parity và permission files giữ nguyên.
