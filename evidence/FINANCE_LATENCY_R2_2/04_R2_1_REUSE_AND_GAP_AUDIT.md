# 04 — R2.1 reuse and gap audit

R2.2 copy/rebase trực tiếp observer-core R2.1 trong `tools/r2-2/observer-core.mjs`. Không cài observer R2.1 đồng thời, không wrap cùng owner nhiều lớp. Reuse nguyên recorder, unit fixtures và actual-source runtime harness; `enabled:false` tắt source instrumentation cũ ở cả OFF và ON. Build script cùng mô hình bundling, chỉ factory R22 cho staging.

| Existing file unchanged | SHA-256 |
|---|---|
| `tools/r2-1/observer-core.mjs` | `b7121cb3b38da85660670261cdec4ed62559517fc37bd13ce8afa7b8987f18aa` |
| `tools/r2-1/build-observer.mjs` | `102677ae51f5f9a3d3a0e788adc79d9c7eedc7042f98b3a17f54afc50b8a4d85` |
| `tools/r2-1/finance-latency-observer.staging.js` | `248b19e1920b6c12a96688c39294b15c6ca2ed5f8addf711811f7167c00e00b8` |
| `tools/r2/trace.mjs` | `9612920207e92cea87d8b57157dadef6c1a4efd9fe3792c69e15d7cb91698ea2` |
| `tools/r2/runtime-harness.mjs` | `356135aa2241d0af19dfea0289748a58efdff605a3a66c3f28c17a9b0b14f9ec` |
| `tools/r2-1/unit-fixtures.mjs` | `dcfa7ee95bd4946d1f7c0238aff8badccc09769095174f6d8f283af906add372` |

Hai RED đã được tái tạo trong tooling gốc, không phải business defect:

1. QuickPay wrapper R2.1 là async/await nên trả Promise khác native Promise gốc. R2.1 cũ chỉ kiểm await-result, chưa kiểm strict Promise identity. R2.2 dùng plain wrapper, native reaction và trả đúng object gốc; synchronous throw cũng giữ nguyên.
2. R2.1 coi service promise resolve là primary ACK. Synthetic fixture chứng minh raw ACK xảy ra trước projection/service return. R2.2 bắt batch do existing canonical service tạo trước first await, quan sát `commit()` gốc trên cùng object; service return có marker khác.

Các gap được giữ công khai: frozen TCB không cho hook return, private settlement function không có public operation marker, UI click không đủ attribution, Debt diagnostics chỉ giữ timestamps nên không đủ count compute/render. Không thay frozen object bằng proxy/facade; marker thiếu giữ null.

Baseline RED và candidate GREEN nằm trong `06_OBSERVER_OFF_ON_INVARIANCE.json` → baselineRed và tests. File R2.1 lịch sử không bị sửa để làm test xanh.
