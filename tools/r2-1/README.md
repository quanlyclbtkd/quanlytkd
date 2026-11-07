# R2.1 — external staging observer

This folder is tooling, outside the production import graph. It changes no
financial source, Firebase config, cache token, Rules, Indexes or package.json.
The current release result is **TOOLING READY / STAGING EVIDENCE BLOCKED**.
Unit checks are not staging acceptance or a latency benchmark.

Run from any directory with Node:

```bash
node /absolute/project/tools/run-finance-write-latency-r2.mjs
node /absolute/project/tools/check-finance-write-latency-r2-1.mjs
```

Both commands use the source tree containing the tool. Optional positional
arguments are source root and output JSON path. The launcher enables Node's VM
module support and propagates the child exit status. It installs nothing and
does not change environment variables, application configuration or scripts.
The original R2 checker is unchanged.

`build-observer.mjs` deterministically bundles the shared recorder and
`observer-core.mjs` into `finance-latency-observer.staging.js`. The generated
classic script has no imports, network calls, timers, Firestore listeners or
persisted telemetry. Do not add it to production HTML or bootstrap files.

Use the full handoff's `R2_1_STAGING_RUNBOOK.md` for source identity, safe staging
fixtures, installation, real Debt-tab scenarios, sample export and restoration.
The script requires explicit STAGING mode, an exact non-production project ID
read from the existing Firestore instance, and an allowed hostname. UNIT_TEST
mode exists solely for synthetic fixture tests.

Key limitations are intentional: initial button/modal dwell and modal submit
release are not automatically timed; a MutationObserver observes island DOM
changes at callback delivery, not physical paint or a particular row's pixels;
missing/unmounted Debt remains missing. Owner counters describe completed
evidence requests; incomplete/rejected requests can have raw SDK samples while
exact total counters remain null. Stack-based SDK scoping can fail on renamed
or minified source, in which case incomplete sampling is declared. Operation
ambiguity, stale scope, unavailable counters and diagnostic failures do not
authorize a financial decision.

The R2 `DebtCollect` internal fixture means **Debt shared QuickPay write-path
fixture**. Neither its label nor these UNIT_TEST samples verify the full Debt
tab, modal, mobile layout, server listener delivery or network latency.
