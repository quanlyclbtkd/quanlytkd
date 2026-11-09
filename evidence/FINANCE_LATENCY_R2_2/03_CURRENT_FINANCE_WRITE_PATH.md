# 03 — Current Finance write path

Đây là source ownership map, không phải bằng chứng bottleneck.

| Ranh giới | Owner và source location | Phân loại |
|---|---|---|
| Invocation và intent checks | `js/modules/finance.js:305`, `window.quickPay` | PRE_ACK |
| Command guard, replay và profile lane | `js/core/tuitionCommandBoundary.js:427`, `collectTuition` | PRE_ACK |
| Settlement decision | `js/core/tuitionCommandBoundary.js:160`, `_resolveTuitionSettlementForWrite`; actual caller tại 465 | PRE_ACK |
| Strict current evidence | `js/services/finance.service.js:312`, `getCurrentMonthEvidenceForWrite` | PRE_ACK |
| Complete month evidence / single-flight | `js/services/finance.service.js:320`, `getCompleteMonthEvidence` | PRE_ACK |
| Semantic sources + pagination | `js/services/finance.service.js:124`, `_readCompleteQuerySource`; 140, `_readServerCompleteMonth` | PRE_ACK |
| Canonical atomic writer | `js/services/finance.service.js:578`, `commitAtomicWritePlan` | PRIMARY_ACK |
| Raw primary ACK boundary | `js/services/finance.service.js:627`, `await batch.commit()` | PRIMARY_ACK |
| Local transaction projection | `js/services/finance.service.js:628`, `_projectCommitted` | POST_ACK |
| Profile merge/invalidation | `js/core/tuitionCommandBoundary.js:518`, post-service checks and `_commitProfilePayment` | POST_ACK |
| Success feedback | `js/modules/finance.js:320`, existing showToast | POST_ACK |
| Detached receipt invocation | `js/modules/finance.js:321`, `_queueTuitionReceipt` | NON_AUTHORITATIVE_TAIL |
| Pending / server-fresh profile evidence | `js/listeners/profiles.listeners.js:912` / 992 | POST_ACK |
| Debt compute start/end | `js/ui/render/computation/studentsRenderer.js:529` / 973 | POST_ACK |
| Cached HTML retrieval | `js/ui/render/computation/studentsRenderer.js:1032` | POST_ACK; chưa phải DOM |
| Debt DOM mutation callback | R2.2 MutationObserver trên Debt island hiện có | POST_ACK observation; chưa phải paint |

Legacy byTxMonth → byDate → byPackageMonth và unresolved month loop đang tuần tự trong source. Canonical dùng accountingMonths. Không thay semantic source, query order, single-flight, settlement policy hoặc writer. Không kết luận sự tuần tự đó gây delay khi chưa có trace staging.

Raw batch fulfillment và post-service diagnostic ACK không đồng nhất: service có projection trước khi resolve. R2.2 đo hai mốc riêng; không di chuyển financial authority.
