# R2.2 external observer

R2.1 core is reused in one revised observer, with its recorder and actual-source fake-SDK harness unchanged. No production import, new SDK instance, query/read/listener/write invocation, timer, financial decision or business retry is introduced.

Run from source: `node tools/check-finance-sync-write-latency-r2-2.mjs`.

Build, only after intentional tooling changes: `node tools/r2-2/build-observer.mjs`.

The generated browser factory accepts STAGING only; its module exposes UNIT_TEST for the synthetic checker. Existing R2.1/R2.2 active guards prevent layered installation. Read `R2_2_STAGING_RUNBOOK.md` before use.

Known gaps remain null: initial UI click, frozen TuitionCommandBoundary return, private settlement operation boundary, Debt per-command invocation counters, row-level correctness and physical paint. Native batch ACK and FinanceService resolution are separate markers.

Current status is R2_2_BLOCKED_STAGING_IDENTITY, not measurement accepted. Synthetic timings are not latency benchmarks. FIRESTORE_BILLING_NOT_MEASURED.
