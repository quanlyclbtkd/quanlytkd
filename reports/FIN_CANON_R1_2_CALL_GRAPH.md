# FIN_CANON R1.2 — Production call graph

## PRODUCTION_NORMAL
`index.html` loads `transactionCanonicalBoundary.js` before `app.js`. Finance legacy snapshot convergence in `app.js` calls `window.recordTransactionQueryOverlap(month, ...)`. Baseline path was:

`app.js legacy snapshots → recordTransactionOverlap → safeForBackfill → scheduleAutomaticCutover → setTimeout(2200) → runAutomaticCutover → executeCanonicalCutover(dryRun:false) → detach Finance → writeBatch historical patches → parity getDocs → persistReadMode → setDoc(settings/main_config) → local clubConfig canonical month → Finance reattach`.

## PRODUCTION_DEBUG / runtime bridges
The production bundle exposes `executeCanonicalTransactionCutover`, `scheduleAutomaticCanonicalTransactionOptimization`, and `runAutomaticCanonicalTransactionOptimization`. Baseline allowed those bridges to reach migration side effects. R1.2 blocks all mutation-capable entry points before side effects while preserving dry-run/diagnostics. `disableCanonicalTransactionRead` remains an explicit rollback bridge; it does not backfill historical transactions or promote a new canonical month.

## TEST_ONLY / TOOL_ONLY
`tools/check-canonical-transaction-safe-cutover.mjs` and related verification tools execute the boundary in VM fixtures. They are not production imports. The old gate asserted automatic migration; R1.2 replaces that obsolete contract with a no-migration production-policy gate.

## UNREACHABLE_COMPATIBILITY
The old automatic implementation body remains after an unconditional policy return for rollback archaeology; it is not execution-reachable from production entry points.
