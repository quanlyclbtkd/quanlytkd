# 05 — Observer design

Một observer ngoài runtime, giới hạn vào QuickPay, existing Finance evidence/service, existing SDK getDocs/writeBatch references, success toast, receipt invocation và Debt island MutationObserver. Không gọi getDocs/getDoc, không tạo query/listener/writer, không tạo Firebase app, không polling/timer/refresh/telemetry.

Mọi wrapper gọi original đúng một lần bằng Reflect.apply, giữ receiver/args/return/Promise/error identity. Native Promise reactions được gắn để quan sát và không thay Promise trả về. Non-native thenable getters không được đọc/assimilate. Diagnostic exception bị bắt, trace gắn DIAGNOSTIC_FAILURE và không được dùng attribution. Observer vẫn có CPU/microtask overhead; synthetic equivalence chưa chứng minh overhead staging không đáng kể.

Canonical service tạo writeBatch trước first await: token ownership chỉ tồn tại trong synchronous call frame. Observer lấy đúng batch gốc, chỉ wrap commit của batch đó. Không capture global token qua await, không gọi commit thêm. Raw ACK là fulfillment reaction của native batch Promise, không phải đồng hồ nội bộ server. Restore giữ property descriptor và không ghi đè owner mới.

Query sample chỉ được chấp nhận nếu call stack thuộc existing `_readCompleteQuerySource` và một evidence owner attributable. Read-only adapter nhận known SDK 10.7.1 Query fields hoặc synthetic shape; source không nhận diện được giữ null, sampling incomplete. Unit adapter test không thay thế real Browser SDK staging validation.

Privacy: raw name/profile/club/auth/filter/toast chỉ dùng trong closure để correlate. Export là fingerprints/ordinals/enums/timings; operation IDs thay bằng ordinal ổn định trong lần install. Không export month raw. Request ring metrics được chiếu sang source/page/doc counters đã loại identity.

| Marker / metric | Clock / scope |
|---|---|
| QuickPay, evidence calls, getDocs, raw ACK, service return, success, receipt | performance.now + paired Date.now stamp |
| Profile pending/fresh, Debt compute, HTML retrieval | existing Date.now diagnostic timestamps |
| ACK → profile/HTML, profile → compute, compute duration | Date.now với Date.now; không dùng post-service ACK thay raw ACK |
| ACK → actual Debt DOM callback | performance.now với performance.now |
| DOM callback | MutationObserver delivery, không phải physical paint hoặc row correctness |
| TCB return | null — NOT OBSERVABLE; object frozen |
| UI click → QuickPay | null — UI_START_UNATTRIBUTED |
| Debt per-command counts | null — diagnostics không có invocation counters |

Không bridge hai clock domain. Delta có thứ tự bất hợp lệ giữ null ở các metric có guard; raw diagnostics vẫn để phân tích. Residual chỉ tính từ các interval cùng performance clock, đủ accounting, không overlap/reset/UNKNOWN/stale. Không clamp residual âm.

`VALID_PRE_ACK_ATTRIBUTION` chỉ xác nhận coverage của phần pre-ACK. Debt state được sample tại hook/snapshot, không phải observer state machine mới. Full trace và kiểm tra dữ liệu cuối cần evidence/UI riêng. Receipt chỉ đo invocation/return; không đo QR internals trong phase này.

`FIRESTORE_BILLING_NOT_MEASURED`.
