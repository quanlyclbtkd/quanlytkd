# Family QR Human-Readable Memo R1.1

Read 10_FINAL_DECISION.md. The image fixture now uses:

GD NGAN KHANH HAI DANG HP T11 2026

34 ASCII characters; same memo in URL/intent/UI/provider/preview. Finance and Family autofill unchanged. Full source TEST_CANDIDATE, not deployed.

Run from source root:

```bash
node tools/check-family-combo-qr-r1.mjs
node tools/check-family-combo-autofill-r1.mjs
node tools/check-finance-write-writer-matrix-r1-1.mjs
sha256sum -c SHA256SUMS.txt
```

Current raw evidence: FAMILY_QR_MEMO_R1_1_EVIDENCE. Parent handoff: handoff/PARENT_FAMILY_COMBO_R1. Current patch: FAMILY_QR_MEMO_R1_1.patch. 40 is a local safety invariant. No live-provider/mobile acceptance claimed.
