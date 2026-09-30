# D1B — Browser Runtime Errors

Authenticated exact-candidate browser runtime was not executed, so production browser counters are **NOT MEASURED**, not zero.

| Runtime signal | Result |
|---|---|
| unexpected `console.error` | NOT MEASURED |
| uncaught exception | NOT MEASURED |
| unhandled rejection | NOT MEASURED |
| duplicate payment | NOT MEASURED authenticated |
| paidUntil regression | 0 in behavioral same-runtime harness; NOT MEASURED authenticated |
| lane deadlock | 0 in behavioral harness; NOT MEASURED authenticated |
| invalid delete | 0 in behavioral owner tests; NOT MEASURED authenticated |
| receipt invisible/blank/covered/auto-close | NOT MEASURED authenticated |

Expected mock primary failures in FORM05/COMBO08 are classified test injections and are not unexpected runtime errors.
