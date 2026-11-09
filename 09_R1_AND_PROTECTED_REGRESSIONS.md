# 09 — R1 and protected regressions

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.

| Gate | Result | Evidence |
| --- | --- | --- |
| R1 BEFORE final acceptance attempt | 49/49 PASS | evidence/INVENTORY_R1_1/final/R1_BEFORE.log |
| R1 AFTER final acceptance attempt | 49/49 PASS | evidence/INVENTORY_R1_1/final/R1_AFTER.log |
| check-finance-write-evidence-r1-1 | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-finance-write-evidence-r1-1.log |
| check-finance-write-writer-matrix-r1-1 | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-finance-write-writer-matrix-r1-1.log |
| check-finance-tuition-month-authority-r1-2 | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-finance-tuition-month-authority-r1-2.log |
| check-finance-tuition-intent-context-r1-2a | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-finance-tuition-intent-context-r1-2a.log |
| check-debt-authoritative-tuition-coverage | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-debt-authoritative-tuition-coverage.log |
| check-tuition-debt-source-of-truth-v4c | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-tuition-debt-source-of-truth-v4c.log |
| check-family-combo-autofill-r1 | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-family-combo-autofill-r1.log |
| check-family-combo-qr-r1 | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-family-combo-qr-r1.log |
| check-auth-context-single-writer | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-auth-context-single-writer.log |
| check-production-security-trust-boundary | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-production-security-trust-boundary.log |
| check-security-coach-branch-boundary | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-security-coach-branch-boundary.log |
| check-root-public-parity | PASS (exit0) | evidence/INVENTORY_R1_1/protected-check-root-public-parity.log |

12 focused protected gates PASS; không gộp số wrapper/subtest thành một con số “toàn hệ thống ổn định”. Family/Finance/Debt/security source và R1 expected values giữ nguyên. Bản R1 checker/harness không bị rewrite; package chỉ thêm hai alias của R1.1.

Không chạy obsolete ancestor-hash gates làm business blocker trong R1.1. Các FAIL nguồn cũ được ghi trong inherited R1 evidence vẫn là historical `ANCESTOR_FREEZE_STALE`, không phải kết quả runtime mới hay lý do chặn phase này. Không sửa expected để che chúng.

Blocker của R1.1 chỉ là browser dependency/execution environment. 49/49 và focused gates không thay thế30 mandatory real-Emulator browser rows đang NOT_RUN.
