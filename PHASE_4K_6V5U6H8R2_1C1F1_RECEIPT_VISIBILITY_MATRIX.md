# C1F1 — RECEIPT VISIBILITY MATRIX

## New success contract
`exportReceipt()` is no longer allowed to report success merely because html2canvas returned a canvas. Before `{ok:true}` it now requires:

1. html2canvas ready;
2. canvas render completed;
3. preview image loaded/decoded and `naturalWidth > 0`, `naturalHeight > 0`;
4. `#receiptModal` computed state is visible (`display`, `visibility`, `opacity`, positive rect, viewport intersection);
5. receipt modal z-index is not below visible fixed mobile shell elements.

Success result includes `rendered:true`, `previewReady:true`, `modalVisible:true`, preview dimensions and visibility metadata. Failure reasons include `asset-timeout`, `asset-load-failed`, `render-failed`, `image-failed`, `preview-failed`, `modal-not-visible`, `modal-closed-before-display`.

C1F receipt serialization (`_receiptRenderQueue`) remains intact.

## RV01–RV20
Authenticated browser visibility is required for the final status. This environment does not contain an authenticated deployed candidate session, therefore no case is promoted to browser PASS.

| ID | Scenario | Static/synthetic evidence | Authenticated visible result |
|---|---|---|---|
| RV01 | Normal QuickPay | visibility contract present | NOT EXECUTED |
| RV02 | html2canvas cold load | AR02 PASS | NOT EXECUTED |
| RV03 | asset already loaded | AR01 PASS | NOT EXECUTED |
| RV04 | slow asset | shared loader/timeout contract present | NOT EXECUTED |
| RV05 | first asset load fails | AR03 PASS; payment/receipt separation preserved | NOT EXECUTED |
| RV06 | explicit reprint after RV05 | AR04 PASS | NOT EXECUTED |
| RV07 | slow fee_audit | C1F dynamic PASS | NOT EXECUTED |
| RV08 | failed fee_audit | C1F dynamic PASS | NOT EXECUTED |
| RV09 | render failure | structured `render-failed` path present | NOT EXECUTED |
| RV10 | retry after render failure | completed replay prevents immediate second payment | NOT EXECUTED |
| RV11 | double tap Thu | concurrent single-flight PASS | NOT EXECUTED |
| RV12 | sequential same QuickPay | completed replay PASS within 30s | NOT EXECUTED |
| RV13 | two different students quickly | legitimate distinct fingerprint PASS | NOT EXECUTED |
| RV14 | Debt rerender while rendering | receipt queue preserved | NOT EXECUTED |
| RV15 | close then reprint existing transaction | transaction-list reprint remains receipt-only | NOT EXECUTED |
| RV16 | mobile 320 | contract present | NOT EXECUTED |
| RV17 | mobile 360 | contract present | NOT EXECUTED |
| RV18 | mobile 390 | contract present | NOT EXECUTED |
| RV19 | mobile 430 | contract present | NOT EXECUTED |
| RV20 | desktop 1024 | contract present | NOT EXECUTED |

## RECEIPT_NOT_SHOWN_CLOSURE
**NOT VERIFIED** — source/static defects were closed, but the required authenticated browser matrix has not been executed. Therefore C1F1 does not claim that the production symptom is closed.
