# F1B Rules Emulator Result

Status: **BLOCKED BY ENVIRONMENT / NOT EXECUTED R1–R11**.

Evidence:
- Java: OpenJDK 21.0.11 available.
- `firebase --version` → `firebase: command not found`.
- `timeout 15s npx --no-install firebase --version` → exit 124 (timeout).
- `npm run check:rules:emulator` invokes the existing command but returns `sh: 1: firebase: not found`, exit 127.

No Firestore Rules were changed for F1B. R1–R11 are not reported as PASS.
