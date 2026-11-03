# Finance canonical authority model

- **A — new transaction canonical fields:** `canonicalizeCreate/canonicalizePatch` continue producing `accountingMonths`, `primaryAccountingMonth`, and `accountingSchemaVersion`. This is not migration.
- **B — persisted canonical read authority:** `getReadMode()` is derived only from `clubConfig.canonicalTransactionReadMonths`, which originates from settings. Existing authorized months remain canonical.
- **C — transient read-only query mode:** no separate transient canonical authority was found. Overlap/parity metrics are diagnostic only and do not alter `getReadMode`.
- **D — historical backfill:** baseline automatic path mutated old transaction documents and then persisted settings authority. R1.2 blocks D in production.

Core rule: `PARITY GREEN != PERMISSION TO WRITE OLD DATA`.
