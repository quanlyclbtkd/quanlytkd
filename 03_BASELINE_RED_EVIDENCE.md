# Actual-path baseline RED

Cùng final checker `tools/check-family-combo-qr-r1.mjs` được chạy trên original baseline và candidate. Checker SHA: `d09d96b5e2ac5cabb176c5019c0e3dbeb1c8caa12c1e8c4e56af7fa4fc4afbcb`.

| Side | PASS | FAIL | Source app SHA |
|---|---:|---:|---|
| Baseline | 45 | 21 | 34eabb10a15e7b5261c489df8c3d6a20fa4f592e2268852bd330f8c185c196bf |
| Candidate | 66 | 0 | 0a5aae9518fe265283db47aea2b89fd25f98c50baf85eaaa45c5caadf1e2cc10 |

RED đầu tiên được thu trước production patch. Final unchanged checker sau đó chạy lại trên baseline directory nguyên byte với FAMILY_TEST_SOURCE_ROOT; expected oracle không đổi giữa hai side.

Image fixture: Lê Hoàng Ngân Khánh / Lê Hoàng Hải Đăng; hai month2026-11; thiếu compact IDs; cùng verified receiving account. Baseline receipt ok=true, providerFetches=1, business writes=0, nhưng mọi surface dùng opaque GD M... M... HP T11 2026. Candidate phải đúng name-first memo; baseline fail các assertion mới về readability/policy.

```bash
FAMILY_TEST_SOURCE_ROOT=/absolute/baseline node tools/check-family-combo-qr-r1.mjs
node tools/check-family-combo-qr-r1.mjs
```

Baseline exit1 là RED có chủ đích; candidate exit0. Raw logs: `FAMILY_QR_MEMO_R1_1_EVIDENCE/baseline-readability-final.log`, `final-family-readable.log`; parsed JSON và per-surface capture cùng thư mục. Không mock away memo builder/generator/EMV verification.

Evidence level: actual production source trong Node VM, DOM/canvas boundary doubles, synthetic provider PNG; independent jsQR pixel decode và actual EMV parser. Không có live VietQR HTTP, real staging transaction hoặc mobile/browser paint acceptance trong phase này.
