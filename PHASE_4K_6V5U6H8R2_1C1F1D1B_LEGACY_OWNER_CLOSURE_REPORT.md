# D1B — Legacy Financial Owner Closure

## Before
`app.js` still contained full legacy business implementations for Transaction Form and Family Combo before canonical `js/modules/finance.js` mounted. That left a production-reachable fallback writer authority during bootstrap.

## After
- `app.js transactionForm.onsubmit` is a fail-closed, zero-write bootstrap stub.
- `app.js window.processCombo` is a fail-closed, zero-write bootstrap stub.
- Before canonical Finance owner is ready: invocation performs zero financial mutation and asks the user to retry after initialization.
- After `FinanceModule.initFinance()`: canonical `js/modules/finance.js` replaces the handler/global and owns the business action.
- No `window.saveTx` writer implementation is mounted.

Actual bootstrap ownership tests verify pre-canonical zero-write and post-bootstrap one canonical handler.

`processMultiItem` remains a deliberately protected production runtime owner; it is not misclassified as obsolete.

Status: **duplicate active Transaction Form/Combo financial writer flows = 0 in audited runtime ownership model**.
