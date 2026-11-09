# 12 — Root/public and loader parity

Ngày: 08/11/2026. Phạm vi: Inventory stock integrity R1; TEST CANDIDATE, chưa deploy.


**129/129 mirrored files byte-identical; 0 missing, 0 extra, 0 hash mismatch.** Canonical runtime source manifest cũng có129 files. Root/public runtime fingerprint cùng:

```text
3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da
```

`node tools/check-root-public-parity.mjs` PASS; `verifyRuntimeProfile` PASS, gồm pinned manifest, every runtime hash, Rules/indexes, attendance gate/authority alignment và import cache-lineage scopes. `tools/inventory-stock-r1/audit-source.mjs /path/to/exact-parent output.json` chứng minh cache-only changes và các helper QR giữ nguyên byte.

Pin mới `V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1` chỉ nhận đúng source candidate; không tạo quyền deploy. Legacy `APP_BUILD_VERSION` được giữ để tránh lan scope sang mọi authority seed; các loader edge thay đổi có token mới và explicit cache-lineage scope. Cả static và dynamic Finance import đều trỏ cùng service version. Parent manifests và source pins lịch sử không đổi.

Evidence: `evidence/INVENTORY_STOCK_R1/source-audit.json`, `evidence/INVENTORY_STOCK_R1/final-gates/check-root-public-parity.log`, `tools/v11r2/manifests/V11R6_A9R18_INVENTORY_STOCK_INTEGRITY_AUTHORITY_R1.json`.
