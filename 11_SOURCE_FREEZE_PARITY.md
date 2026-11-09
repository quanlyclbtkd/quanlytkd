# 11 — Source freeze/parity

08/11/2026 — A9R18-INVENTORY-STOCK-INTEGRITY-R1.1. Acceptance-only; production source frozen.


**261/261 production files unchanged;129 mirrored pairs;0 mismatches.**

```text
Runtime SHA-256:
3e4e56fc385ef13bc74b5d6f2df1182137d38355d65eed4394a807de58f9e3da

Rules SHA-256:
1aa7fd38544142dcb82dbd8809f9ea65d6c77dc6427f60934e3333005062e6b3

firebase.json SHA-256:
5a7aa67432f9601838edfc7e162e06fb7f9a9916b0109e3330b575b8d3b55814
```

verifyRuntimeProfile PASS trên same R1 pin. Production import graph không tham chiếu tools R1.1. Không app/main/cache token change, không thêm schema/Rules/index/listener/writer, không Finance/Debt/Family/Admission/MultiItem business change.

Allowed change audit trước khi thêm báo cáo/evidence: chỉ package.json (hai alias mới) và 5 files mới đúng tools allowlist. Các file mới parse bằng `node --check`:4/4 PASS. Đây là syntax validation của tooling; toàn bộ assertions browser chưa được execute. Diff riêng: `evidence/INVENTORY_R1_1/R1_1_TEST_TOOLING_ONLY.patch`, git apply --check PASS trên baseline.

Tất cả R1 checker/tools giữ nguyên byte; package-lock và dependencies declaration không đổi. Reports/evidence/checksum là output của handoff. Dependencies, node_modules, Emulator JAR và helper tải tệp không được đóng vào source ZIP.

Raw per-file hashes: source-freeze-tooling.json, final/ACCEPTANCE.json freezeBefore/freezeAfter, runtime-profile-final.json. Original R1 SHA256SUMS được giữ tại tools/inventory-stock-r1-1/BASELINE_R1_SHA256SUMS.txt trước khi tạo checksum mới cho handoff.
