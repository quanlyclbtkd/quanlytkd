# D1C — Rules R1–R11

Status: **BLOCKED BY ENVIRONMENT**.

Environment:
- Node v22.16.0
- npm 10.9.2
- Java OpenJDK 21.0.11
- global Firebase CLI: unavailable
- local `node_modules/.bin/firebase`: unavailable

Commands:
- `timeout 20s npx --no-install firebase --version` → exit 124.
- `npm run check:rules:emulator` → exit 127; `sh: 1: firebase: not found`.

R1–R11:
- PASS: 0
- FAIL: 0
- NOT EXECUTED/BLOCKED: 11

No Firestore Rules change was made.
