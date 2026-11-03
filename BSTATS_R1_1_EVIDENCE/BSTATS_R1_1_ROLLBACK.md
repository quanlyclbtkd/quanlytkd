# R1.1 Rollback

This phase performs no migration and no Firestore topology/rules/index change. Rollback is source-only.

1. Stop before deployment/staging promotion if any post-package hash differs from the manifest.
2. Restore the exact R1.2 baseline runtime for the changed business/cache-lineage files, or apply the phase patches in reverse order: cache-lineage → pending presentation → dashboard composition → Debt authority adapter → Students ownership.
3. Remove the R1.1 QA/source-identity additions only after the runtime is restored to the exact R1.2 runtime SHA-256.
4. Re-run `npm run check` and `npm run check:all`; the restored runtime must resolve to the pinned R1.2 identity.
5. No database rollback is required: R1.1 adds no writer, migration, persisted authority, rule, index, or canonical transaction mutation.

The explicit `disableCanonicalTransactionRead()` emergency rollback remains independent and was QA-tested; R1.1 does not invoke it automatically.
