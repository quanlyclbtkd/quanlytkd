# F1B Receipt Visibility Matrix

Authenticated candidate could not be deployed from this environment because Firebase CLI is unavailable. No authenticated Admin session/test credentials are available here.

Therefore RV01–RV20 are **NOT EXECUTED AUTHENTICATED** and are not converted to PASS from static/synthetic evidence.

| Case | Status |
|---|---|
| RV01 normal cold-load QuickPay | NOT EXECUTED |
| RV02 html2canvas already loaded | NOT EXECUTED |
| RV03 slow asset | NOT EXECUTED |
| RV04 first asset failure | NOT EXECUTED |
| RV05 explicit reprint after failure | NOT EXECUTED |
| RV06 slow fee_audit | NOT EXECUTED |
| RV07 failed fee_audit | NOT EXECUTED |
| RV08 double tap | NOT EXECUTED |
| RV09 stale replay >30s | NOT EXECUTED |
| RV10 delete success → recollect | NOT EXECUTED |
| RV11 delete success + reconcile failure | NOT EXECUTED |
| RV12 close receipt → reprint | NOT EXECUTED |
| RV13 two students sequentially | NOT EXECUTED |
| RV14 Debt rerender while receipt opens | NOT EXECUTED |
| RV15 320×568 | NOT EXECUTED |
| RV16 360×800 | NOT EXECUTED |
| RV17 390×844 | NOT EXECUTED |
| RV18 430×932 | NOT EXECUTED |
| RV19 768/1024 transition | NOT EXECUTED |
| RV20 repeated open/close/reprint | NOT EXECUTED |

The existing C1F/C1F1 source contracts for asset recovery, render queue, preview dimensions, modal computed visibility, viewport and z-index remain PASS in static/dynamic source gates, but they do not substitute for authenticated visibility evidence.
