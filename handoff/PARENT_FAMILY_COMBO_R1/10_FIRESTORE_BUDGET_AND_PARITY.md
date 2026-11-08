# Firestore budget / parity / protected authority

| Static production call-site | Baseline measured | Candidate measured | Delta |
| --- | --- | --- | --- |
| getDoc | 26 | 26 | 0 |
| getDocs | 43 | 43 | 0 |
| onSnapshot | 16 | 16 | 0 |

Measured by unchanged `tools/check-production-security-trust-boundary.mjs`, cả baseline/candidate RC0. Đây là static call-sites, không phải billing reads mỗi transaction. Family autofill dùng RAM + existing canonical helper; Family report có zero business SDK writes, chỉ existing QR fetch. Không thêm getDoc/getDocs/onSnapshot/runTransaction/listener owner.

Canonical root/public pairs: **129/129**, **0 mismatch**. Source identity/cache graph: verified new pin `V11R6_A9R18_FAMILY_COMBO_CORRECTNESS_QR_R1`, runtime `245bb80f1c4a77fe5013f4f5ad3873c61a83fe25873ee7046e00baf8d98f348f`. Mirrored app/finance/index/main đều identical. SHA256SUMS.txt phủ toàn bộ ZIP entries trừ chính nó.

Protected functions unchanged: canonical getChargeableTuitionMonths, generic payment/tuition memo, EMV decoder, pixel verifier, generateVietQR. Protected pay branch identical. FinanceService, TuitionCommandBoundary, Debt canonical/read boundary, profile listener, transactionCanonicalBoundary, Rules/Indexes unchanged. Exact hashes and function evidence in protected-boundaries-and-parity.json.

No production transactions, no new persistent references, no schema/mapping/migration, no Cloud Functions/Blaze. Observer assets not modified. No financial authority derives from Family memo or missing RAM evidence.
