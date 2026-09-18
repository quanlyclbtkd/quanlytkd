# PHASE 4K-6V5U6H8R2.1C1E — RULES EMULATOR RESULT

## Status

**BLOCKED BY ENVIRONMENT — R1–R11 NOT EXECUTED.**

No Rules file was modified.

## Toolchain evidence

- Java: available — OpenJDK **21.0.11**.
- Repository declares `firebase-tools` (`^15.22.2`) and has a package lock resolving Firebase CLI.
- Firebase emulator config exists in `firebase.json` (`firestore` on 127.0.0.1:8180; UI disabled).
- Application Firebase project identity in source: `quanly-tst`.
- Existing Rules test command uses `firebase emulators:exec --only firestore ...` and existing R1–R11 matrix.
- Global Firebase CLI: `firebase: command not found`.
- Local binary after install attempt: `node_modules/.bin/firebase` does not exist; `node_modules/firebase-tools` is incomplete.

## Dependency installation attempt

`npm ci --ignore-scripts` was attempted. The environment could not complete package retrieval because DNS/network resolution repeatedly failed, including:

- `getaddrinfo EAI_AGAIN registry.npmjs.org`
- `EAI_AGAIN` against the configured package gateway for package tarballs.

Because the Firebase CLI install was incomplete, invoking R1–R11 would not constitute a valid emulator run.

## R1–R11

| Case | Existing intent | Result |
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

## Decision

Rules runtime evidence remains an environment gap. It is **not** marked PASS from static analysis.
