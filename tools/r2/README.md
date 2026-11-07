# Finance Write Latency R2 — diagnostic tooling only

The production runtime and package.json are byte-identical to the R1 baseline.
These tools are not imported by index.html, main.js or any production module.
No optimization, deployment, canonical cutover or live Firebase transaction is performed.

Run with the verified Node v24.22.1 environment:

```bash
node --experimental-vm-modules tools/check-finance-write-latency-r2.mjs . /absolute/path/results.json
node tools/run-finance-write-latency-r2.mjs
node tools/check-finance-write-latency-r2-1.mjs
node tools/r2/audit-source.mjs .
npm run check
```

`runtime-harness.mjs` evaluates real application source in isolated VM contexts.
The SDK and DOM are fixtures. `source-hooks.mjs` inserts observation calls only
into the in-memory QuickPay, TuitionCommandBoundary and FinanceService text.
It also defines form/family taps, but the dedicated harness exercises QuickPay
and the shared Debt QuickPay path. Existing protected tests cover form/family correctness.

The transform flag OFF returns the original text byte for byte. The RAM recorder
also defaults OFF. Recorder callbacks are guarded against exceptions, export no
raw identities, use a monotonic clock and have bounded retention. Concurrent
measurement ambiguity is explicit and cannot produce a complete attribution.
No timers, polling, network telemetry, persisted evidence or new SDK owner is used.

R2's in-memory source overlays are NOT a staging deployment. R2.1 supplies a
separate external observer in `tools/r2-1/`; see its README and the handoff's
staging runbook. A verified staging source/config,
authenticated operator session and browser are still required. The current raw
samples have `UNIT_TEST` level only. Do not use their milliseconds as Firebase,
mobile or production benchmarks. Do not change that label to obtain acceptance.

Missing server-fresh/compute/DOM markers stay null. Existing Debt `debtRenderAt`
means cached HTML retrieval; it must not be relabeled as DOM commit or paint.
Future staging integration must observe the existing profile callback and the
actual Debt island DOM application, preserve context/operation correlation,
and retain a missing marker when the operation was stale or the island hidden.

R2.1 also separates recorder pre-ACK, post-ACK and synchronization completion.
The old `completeForAttribution` alias means full attribution only. Pending sync
after command return does not create a financial overlap with the next command.
`DebtCollect` in this harness means **Debt shared QuickPay write-path fixture**,
not full Debt-tab UI verification. The R2 checker itself is unchanged.

No test expectation or source-integrity guard was weakened. Use the supplied
baseline-equivalent failure matrix to distinguish missing browser/Emulator /
release evidence and stale historical harnesses from application regressions.
