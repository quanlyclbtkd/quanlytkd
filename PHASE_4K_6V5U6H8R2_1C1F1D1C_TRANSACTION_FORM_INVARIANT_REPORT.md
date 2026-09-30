# D1C — Transaction Form Invariant Report

Canonical handler: `js/modules/finance.js :: transactionForm.onsubmit`.

Before any Tuition lane/write the handler now requires:
- student identity present;
- amount finite and > 0;
- strict real calendar date `YYYY-MM-DD`;
- derived month valid `YYYY-MM`;
- package count present in the actual `#tx_package` option whitelist (current UI values include 1/3/6/12);
- FinancialActionAuditGuard allows `tuition.transactionForm`.

Invalid amount/date/package/role/club returns before lane acquisition and produces 0 primary transaction writes, 0 profile writes, 0 local Tuition commits, 0 receipt writes.

D1B freshness remains: latest profile + settlement + final plan inside the same Tuition lane; local canonical commit occurs after primary success and before lane release.

`fee_audit` is detached after the lane result; it no longer blocks handler completion. Existing Transaction Form UX does not introduce a new receipt owner in D1C.
