# PHASE 4K-6V5U6H8R2.1C1E1 — BROWSER RUNTIME ERRORS

## Authenticated error budget

**NOT MEASURED.**

No authenticated deployed C1E1 candidate could be opened in this environment, so the following values are intentionally not reported as zero:

- unexpected `console.error`: NOT MEASURED
- uncaught exception: NOT MEASURED
- `unhandledrejection`: NOT MEASURED
- permission-denied outside expected blocked case: NOT MEASURED
- duplicate event/listener symptom: NOT MEASURED

## Browser harness environment evidence

Headless Chromium exists, but navigation to both local file and localhost targets returned:

```text
net::ERR_BLOCKED_BY_ADMINISTRATOR
```

Therefore local geometry smoke was not counted as authenticated/browser runtime acceptance.
