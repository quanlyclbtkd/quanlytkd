# PHASE 4K-6V5U6H8R2.1C1E1 — RULES EMULATOR RESULT

## Status

**BLOCKED BY ENVIRONMENT — R1–R11 NOT EXECUTED.**

No Firestore Rules source was modified.

## Toolchain evidence

- Node: v22.16.0.
- npm: 10.9.2.
- Java: OpenJDK 21.0.11 — available.
- `firebase.json` contains Firestore emulator config on `127.0.0.1:8180`, UI disabled.
- Repository declares `firebase-tools ^15.22.2` and package lock contains it.
- Global `firebase`: absent.
- `node_modules/.bin/firebase`: absent.
- `npx --no-install firebase --version`: did not resolve a usable local CLI and hit the bounded environment timeout (exit 124).
- A bounded `npm install --ignore-scripts --no-audit --no-fund` probe did not complete in this environment; it was terminated and left no Firebase executable. `package-lock.json` SHA-256 remained identical to the C1E input.
- Canonical command was executed directly through npm and failed exactly as:

```text
firebase emulators:exec --only firestore --project demo-taekwondo-6v4b "node tools/firestore-rules-6v4b.test.mjs"
sh: 1: firebase: not found
EXIT 127
```

## R1–R11 matrix

| Case | Intent | Result |
|---|---|---|
| R1 | Admin own-tenant allow | BLOCKED |
| R2 | Admin cross-tenant deny | BLOCKED |
| R3 | Coach assigned-branch Attendance allow | BLOCKED |
| R4 | Coach other-branch deny | BLOCKED |
| R5 | Coach finance/config deny | BLOCKED |
| R6 | Viewer read-only / write deny | BLOCKED |
| R7 | Valid SuperAdmin principal allow | BLOCKED |
| R8 | Admin cannot spoof SuperAdmin | BLOCKED |
| R9 | Unauthenticated private data deny | BLOCKED |
| R10 | Spoofed login-history identity deny | BLOCKED |
| R11 | Cross-tenant profiles/transactions/attendance/inventory/settings deny | BLOCKED |

Static Rules/security checks are not relabeled as Rules Emulator PASS.
