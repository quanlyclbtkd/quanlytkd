# F1D — PRIMARY WRITE / DELETE COUNT

| Case | Tx write | Tx delete | Profile write | Inventory write | Payment/reprint delta | Result |
|---|---:|---:|---:|---:|---:|---|
| MB01 pure tuition classification | 0 | canonical pure-delete path only | canonical reconcile only | 0 | 0 | routed to Tuition owner |
| MB02 pure inventory classification | 0 | existing owner only | 0 | existing Inventory owner only | 0 | non-tuition |
| MB03/MB04 mixed bundle | 0 | 0 | 0 | 0 | 0 | fail-closed |
| MB05 bundle+inventory | 0 | 0 | 0 | 0 | 0 | fail-closed |
| MB06 requiresInventoryRollback | 0 | 0 | 0 | 0 | 0 | cannot pure-delete |
| MB08 unsafe mixed delete | 0 | 0 | 0 | 0 | 0 | dynamically verified zero destructive writes |
| TM01 generic mutation pending -> collect | +1 collect after lane release | test-harness mutation owner | canonical collect update | 0 | +1 legitimate | collect waited |
| TM02 collect pending -> generic mutation | +1 collect total | generic begins only after collect | serialized | 0 | +1 legitimate | delete/mutation waited |
| TM03 different profiles | independent | independent | independent | independent | independent | parallel allowed |
| TM04 first lane task rejects | next legitimate mutation allowed | n/a | n/a | n/a | n/a | lane not poisoned |
| Duplicate QuickPay baseline | total +1 | 0 | canonical | 0 | 0 additional | prior gates preserved |
| Receipt reprint | 0 | 0 | 0 | 0 | 0 | prior receipt contract preserved |
