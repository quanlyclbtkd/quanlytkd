# 10 — Regression results and honest limits

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.


**Phase-specific current runner: 41/41 gates GREEN**, gồm stock suite 49/49 và 40 protected gates. Command:

```bash
node tools/inventory-stock-r1/run-gates.mjs /absolute/path/to/results
npm run check:inventory-stock-authority-r1
```

Structured source-stamped results: `evidence/INVENTORY_STOCK_R1/final-gates/RESULTS.json`. Mỗi log có SHA-256 và exit code. Không cộng wrapper/subtest trùng nhau thành một con số “toàn hệ thống”. Các gate đều chạy offline trên fixtures của repository.

| Current gate | Result | Log (under evidence/INVENTORY_STOCK_R1/final-gates/) |
| --- | --- | --- |
| check-inventory-stock-authority-r1 | PASS | check-inventory-stock-authority-r1.log |
| check-inventory-finance-rollup | PASS | check-inventory-finance-rollup.log |
| check-inventory-history-pagination-active-debt | PASS | check-inventory-history-pagination-active-debt.log |
| check-inventory-multiitem-readonly-ui | PASS | check-inventory-multiitem-readonly-ui.log |
| check-inventory-consumer-hydration-hotfix | PASS | check-inventory-consumer-hydration-hotfix.log |
| check-inventory-ledger-reconciliation | PASS | check-inventory-ledger-reconciliation.log |
| check-inventory-dynamic-size-catalog | PASS | check-inventory-dynamic-size-catalog.log |
| check-h8r2-1c1f1d1-multiitem-inventory-closure | PASS | check-h8r2-1c1f1d1-multiitem-inventory-closure.log |
| check-multiitem-inventory-hydration | PASS | check-multiitem-inventory-hydration.log |
| check-admission-postcommit-context-r1-2c | PASS | check-admission-postcommit-context-r1-2c.log |
| check-admission-draft-snapshot-r1-3a | PASS | check-admission-draft-snapshot-r1-3a.log |
| check-admission-r1-3a1-test-superset | PASS | check-admission-r1-3a1-test-superset.log |
| check-payment-bundle-runtime-hotfix | PASS | check-payment-bundle-runtime-hotfix.log |
| check-admission-bundle-unification | PASS | check-admission-bundle-unification.log |
| check-admission-tuition-package | PASS | check-admission-tuition-package.log |
| check-admission-uniform-size | PASS | check-admission-uniform-size.log |
| check-finance-write-writer-matrix-r1-1 | PASS | check-finance-write-writer-matrix-r1-1.log |
| check-finance-write-evidence-r1-1 | PASS | check-finance-write-evidence-r1-1.log |
| check-finance-tuition-month-authority-r1-2 | PASS | check-finance-tuition-month-authority-r1-2.log |
| check-finance-tuition-intent-context-r1-2a | PASS | check-finance-tuition-intent-context-r1-2a.log |
| check-debt-authoritative-tuition-coverage | PASS | check-debt-authoritative-tuition-coverage.log |
| check-family-combo-autofill-r1 | PASS | check-family-combo-autofill-r1.log |
| check-family-combo-qr-r1 | PASS | check-family-combo-qr-r1.log |
| check-production-security-trust-boundary | PASS | check-production-security-trust-boundary.log |
| check-security-coach-branch-boundary | PASS | check-security-coach-branch-boundary.log |
| check-tuition-debt-source-of-truth-v4c | PASS | check-tuition-debt-source-of-truth-v4c.log |
| check-finance-nontuition-context-tail-r1-2b | PASS | check-finance-nontuition-context-tail-r1-2b.log |
| check-finance-delete-context-tail-r1-2a1 | PASS | check-finance-delete-context-tail-r1-2a1.log |
| check-finance-remaining-form-tail-r1-2b1 | PASS | check-finance-remaining-form-tail-r1-2b1.log |
| check-qr-report-render-payment-intent | PASS | check-qr-report-render-payment-intent.log |
| check-qr-v4-payment-account-authority | PASS | check-qr-v4-payment-account-authority.log |
| check-qr-multiitem-memo-r1-2d1 | PASS | check-qr-multiitem-memo-r1-2d1.log |
| check-qr-multiitem-memo-r1-2d | PASS | check-qr-multiitem-memo-r1-2d.log |
| check-qr-multiitem-memo-r1-2d-app-guard | PASS | check-qr-multiitem-memo-r1-2d-app-guard.log |
| check-multiitem-tuition-package-fix | PASS | check-multiitem-tuition-package-fix.log |
| check-multiitem-skipped-months | PASS | check-multiitem-skipped-months.log |
| check-admission-tuition-type-normalization | PASS | check-admission-tuition-type-normalization.log |
| check-mobile-startup-performance | PASS | check-mobile-startup-performance.log |
| check-attendance-canonical-ownership | PASS | check-attendance-canonical-ownership.log |
| check-root-public-parity | PASS | check-root-public-parity.log |
| a9r6-qr-provider-memo | PASS | a9r6-qr-provider-memo.log |

Các kiểm tra lịch sử mở rộng vẫn để nguyên và **không tuyên bố đã PASS**:

| Check | Baseline | Candidate | Classification |
| --- | --- | --- | --- |
| npm run check (default) | exit1 ở Latency R1; các bước trước đó qua | exit1 ở System Sync R1.3; các bước trước đó qua | Không phải all-system GREEN; full raw logs giữ nguyên |
| System Sync R1.3 | 21/21 | 17 PASS /4 FAIL | 3 frozen-file hashes (Inventory service được sửa, Finance service/TCB cache-only); 1 exact static count26 thay bằng24. Source-contract mismatch, không phải behavioral sync RED |
| Finance Latency R1 | 57 PASS /1 FAIL | 55 PASS /3 FAIL | app historical freeze đã fail từ baseline; candidate thêm 2 cache-only file hash khác. 55 behavior/other assertions không RED |
| Finance Latency R2 (đúng wrapper có VM flag) | 65 PASS /1 FAIL | 65 PASS /1 FAIL | exact ancestor id R1 không còn đúng từ Family baseline; outcomes/cost/ACK assertions đều qua |
| R2.1 External Observer | 102 PASS /1 FAIL | 102 PASS /1 FAIL | exact ancestor id R1 mismatch; không đổi observer business/timing code |
| Hai historical H8C1 inventory/admission standalone tools | cùng FAIL từ baseline | không dùng làm gate chấp nhận mới | SDK/auth fixture không theo verified context hiện tại; source tests không sửa; latest R1.2B/R1.2C/R1.3A/R1.3A1 + actual stock suite là gate hiện hành được báo ở trên |

Không sửa các frozen checker để biến đỏ thành xanh. Source audit độc lập chứng minh FinanceService/TCB/Finance module chỉ khác import version; stock business patch đúng scope; Rules/authority/QR unchanged. Do đó không diễn giải source-freeze mismatch thành Finance/Debt latency defect hoặc đưa vào production repair backlog.

Hai lần kiểm thử không hợp lệ được giữ minh bạch: initial direct R2 command thiếu `--experimental-vm-modules` (đã chạy lại đúng wrapper); initial `npm run check` song song ở hai process namespace trùng `/tmp` filename (đã chạy lại tuần tự, TMPDIR riêng). Logs có tên `invalid-command`/`invalid-parallel-tmp`, không dùng để đánh giá runtime. Initial job đánh sai tên Debt source checker không tồn tại cũng được chạy lại đúng `check-tuition-debt-source-of-truth-v4c.mjs`.

Không có real staging latency, Firebase Emulator Rules execution, provider network/mobile thật trong R1 này. Các bằng chứng emulator/mobile ở folder phase cũ là lịch sử, không phải lần chạy của candidate này.
