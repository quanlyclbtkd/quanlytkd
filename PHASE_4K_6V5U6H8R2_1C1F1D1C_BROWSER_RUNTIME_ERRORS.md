# D1C — Browser Runtime Error Budget

Authenticated deployed browser runtime was not executed.

Therefore the following are **NOT MEASURED**, not zero:
- unexpected console.error
- uncaught exception
- unhandledrejection
- duplicate financial writes
- invalid financial writes
- guard bypass
- receipt mismatch
- lane deadlock/leak in deployed browser
- unexpected receipt auto-close

Actual-handler VM behavioral tests passed, including blocked invalid writes and no deadlock in prior D1B race coverage.
