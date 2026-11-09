# A9R18 Inventory Stock Integrity Authority R1 — Test candidate

Mã nguồn đầy đủ; chưa deploy. Bắt đầu với `13_FINAL_DECISION.md`, sau đó `10_REGRESSION_RESULTS.md` để xem phạm vi GREEN và các checker freeze cũ còn FAIL.

```bash
npm run check:inventory-stock-authority-r1
node tools/inventory-stock-r1/run-gates.mjs /absolute/path/to/results
node tools/check-root-public-parity.mjs
```

Stock:49/49; phase gates:41/41; mirrors:129/129; static getDoc/getDocs/onSnapshot:24/43/16. Transaction write-time reads được báo riêng, không phải0. `npm run check` tổng chưa xanh vì các ancestor source-freeze contracts; không nới các checker này trong phase Kho.

Runtime SHA-256: `3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da`. Tham chiếu input SHA và rollback tại reports01/06. Artifact integrity: `SHA256SUMS.txt`. Current evidence: `evidence/INVENTORY_STOCK_R1/`; dữ liệu trong folder A9R cũ là lịch sử.

Phạm vi sửa: canonical negative-stock compare-and-commit, edit/delete current-item CAS, Admission/MultiItem same atomic envelope, đóng unsafe fallback. Finance/Tuition/Debt/Family/QR/Attendance business semantics không đổi. Không latency optimization, schema/Rules/index migration hoặc deployment.
