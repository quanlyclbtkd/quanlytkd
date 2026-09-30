# F1D — RULES R1–R11

Status: **BLOCKED BY ENVIRONMENT / NOT EXECUTED**.

Evidence:
- Node: v22.16.0
- npm: 10.9.2
- Java: OpenJDK 21.0.11
- global `firebase`: missing
- local `node_modules/.bin/firebase`: missing
- `timeout 20s npx --no-install firebase --version` -> exit 124
- `npm run -s check:rules:emulator` -> exit 127, `firebase: not found`
- bounded `npm install --ignore-scripts` did not complete in the execution window; partial `node_modules` was removed and `package-lock.json` remained unchanged.

No Firestore Rules change was made.
