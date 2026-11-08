# A9R18 Family Combo Correctness + QR R1

Đọc **11_FINAL_DECISION.md** trước. Đây là full source test candidate, chưa deploy. Sửa đúng ba lỗi Family: canonical month autofill, dependent row invalidation, compact Family-only QR memo. Mandatory Family/Finance/Debt/QR acceptance đạt; historical latency freeze identity assertions chưa được rebaseline và không được gọi PASS.

```bash
node tools/check-family-combo-autofill-r1.mjs
node tools/check-family-combo-qr-r1.mjs
node tools/check-finance-write-writer-matrix-r1-1.mjs
```

Full evidence: FAMILY_COMBO_R1_EVIDENCE. Unified patch: FAMILY_COMBO_R1_PATCH.diff. Check integrity with `sha256sum -c SHA256SUMS.txt` từ root sau unzip. Runtime hash `245bb80f1c4a77fe5013f4f5ad3873c61a83fe25873ee7046e00baf8d98f348f`; browser-facing cache token `a9r18-family-combo-correctness-qr-r1-20261107`. 40 chỉ là application safety invariant. Không chạy real money tests trên production.
