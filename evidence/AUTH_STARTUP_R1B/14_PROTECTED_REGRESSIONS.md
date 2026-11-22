# 14 — Protected regressions và phạm vi bằng chứng

**30/30 protected gate ngoại tuyến PASS**, chạy mới trong R1B trên source input giữ nguyên. Đây không phải native browser/Auth acceptance.

| Gate | Kết quả |
|---|---|
| `precheck` | PASS |
| `check:syntax` | PASS |
| `check:production-authority-closure` | PASS |
| `check:production-security-trust-boundary` | PASS |
| `check:security-coach-branch-boundary` | PASS |
| `check:coach-branch-runtime-repair` | PASS |
| `check:attendance-canonical-ownership` | PASS |
| `check:attendance-explicit-shift-authority` | PASS |
| `check:attendance-daily-single-refresh-authority` | PASS |
| `check:d1c3b7r2r2-attendance-role-authority` | PASS |
| `check:mobile-startup-performance` | PASS |
| `check:auth-context-single-writer` | PASS |
| `check:superadmin-auth-principal-alignment` | PASS |
| `check:admin-credential-single-source` | PASS |
| `check:listener-ownership-boundary` | PASS |
| `check:club-bootstrap-single-read-authority` | PASS |
| `check:club-initial-snapshot-access-gate` | PASS |
| `check:club-listener-bootstrap-readiness` | PASS |
| `check:startup-read-budget-freeze` | PASS |
| `check:finance-students-bstats-ownership-r1` | PASS |
| `check:canonical-transaction-safe-cutover` | PASS |
| `check:tuition-debt-source-of-truth` | PASS |
| `check:debt-authoritative-tuition-coverage` | PASS |
| `check:debt-profile-read-boundary` | PASS |
| `check:inventory-stock-authority-r1` | PASS |
| `check:inventory-ledger-reconciliation` | PASS |
| `check:family-combo-autofill-r1` | PASS |
| `check:family-combo-qr-r1` | PASS |
| `check:reachable-dom-trust-boundary-r1-4b` | PASS |
| `check:root-public-parity` | PASS |

R1A gate được chạy lại như một hồi quy ngoại tuyến: 9/9 phase checks, 27/27 VM isolation cases, 570/570 assertions, 21/21 controls. Không cộng các kết quả này vào 14 ca real Auth của R1B.

Source freeze: 1.997/1.997 file input nguyên byte; root/public 129/129, 0 mismatch; Firestore 24/43/16. Không sửa test/hash expectation/pin R1A hoặc runtime app/main/listeners/index/business modules.

Chưa chạy các gate nghiệm thu thật: same-origin multi-tab, frame-level DOM, physical unsubscribe cho sáu owner, normal Admin canonical profile startup, Coach fail-closed trong browser, main failure/slow-main, repeated cold-load bridge order, observer OFF/ON equivalence. Tất cả được ghi NOT_RUN, không phải PASS.

Không khởi động lại Inventory Emulator acceptance hoặc Finance benchmark. Chỉ các gate authority/ledger ngoại tuyến trong bảng được chạy. Không deploy, không ghi cloud/production, không thêm Auth owner.
