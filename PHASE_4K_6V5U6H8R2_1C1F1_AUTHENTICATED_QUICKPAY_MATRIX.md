# C1F1 — AUTHENTICATED QUICKPAY MATRIX

Status: **NOT EXECUTED**.

Reason: this environment has no authenticated Admin/Coach/SuperAdmin test sessions and no usable Firebase CLI to deploy the C1F1 candidate. Creating or mutating live financial data without a controlled authenticated test account is not acceptable.

| ID | Case | Tx before | Tx after | Expected delta | Actual delta | Receipt visibility | Status |
|---|---|---:|---:|---:|---:|---|---|
| AQ01 | Admin normal QuickPay | N/A | N/A | +1 | N/A | N/A | NOT EXECUTED |
| AQ02 | Admin sequential duplicate | N/A | N/A | 0 after original | N/A | N/A | NOT EXECUTED |
| AQ03 | Admin cold-load receipt | N/A | N/A | +1 | N/A | N/A | NOT EXECUTED |
| AQ04 | Explicit retry after injected asset failure | N/A | N/A | 0 | N/A | N/A | NOT EXECUTED |
| AQ05 | Slow fee_audit | N/A | N/A | +1 | N/A | N/A | NOT EXECUTED |
| AQ06 | Failed fee_audit | N/A | N/A | +1 | N/A | N/A | NOT EXECUTED |
| AQ07 | Close/reopen receipt | N/A | N/A | 0 | N/A | N/A | NOT EXECUTED |
| AQ08 | Different student second payment | N/A | N/A | +1 | N/A | N/A | NOT EXECUTED |
| AQ09 | Branch A | N/A | N/A | +1 | N/A | N/A | NOT EXECUTED |
| AQ10 | Branch B | N/A | N/A | +1 | N/A | N/A | NOT EXECUTED |

Required per-case fields `paymentCommitted`, `assetReady`, `canvasRendered`, `previewReady`, `modalVisible`, `previewNaturalWidth`, `previewNaturalHeight` remain N/A until authenticated execution.
