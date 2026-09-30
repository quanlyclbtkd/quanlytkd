# D1B — Actual Handler / Race Result

Master gate: `tools/check-h8r2-1c1f1d1b-final-tuition-caller-convergence.mjs`

Final result: **54/54 PASS**.

The gate executes the actual canonical Transaction Form handler installed by `FinanceModule.initFinance()` and actual canonical `window.processCombo`; Firestore/service I/O is mocked, but business handlers are not reimplemented.

Key race outcomes:
- Form Sep queued behind newer same-profile mutation -> latest state is re-resolved; stale Sep plan cannot regress `paidUntil`.
- Form Sep queued behind Sep settlement -> zero additional primary write.
- Form successful commit -> local canonical state blocks immediate same-month QuickPay before snapshot.
- Combo waits overlapping participant lane -> re-evaluates all participants only after all lanes acquired.
- Stale Combo participant -> zero partial primary write and reconfirm message.
- Reverse profile order -> deterministic lane acquisition; zero deadlock.
- Injected primary Form/Combo failures -> lanes cleanly released; no false local commit.
- Different profiles remain independently concurrent.

The console errors shown during FORM05/COMBO08 are deliberate injected primary failures and are expected test evidence, not unexpected runtime errors.
