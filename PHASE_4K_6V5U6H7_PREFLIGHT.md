# PHASE 4K-6V5U6H7 — Preflight

Timestamp: `2026-08-29 09:01:44 +0700`

## Source freeze
- H6 input ZIP SHA-256: `d8c305d0a11b5f07f7c2700a7348729188447312e27cf3f15cea8d70f322bdfa`
- Runtime build marker: `4K-6V5U6H6-release-authority-exam-state-purity-firebase-final-verification-20260829`
- H7 runtime source delta from H6: **0 files** (714/714 files identical after canonical `build:public`; no added/removed/changed file)
- `npm run check:release`: **PASS — 36/36, EXIT 0**
- Root/public parity after build: **PASS — 123/123; missing 0; extra 0; mismatch 0**
- Firestore static runtime counts: **getDoc 29 / getDocs 51 / onSnapshot 16**

## Toolchain
- Node: `v22.16.0`
- npm: `10.9.2`
- Java: `OpenJDK 21.0.11`
- Firebase CLI global: **UNAVAILABLE** (`firebase: command not found`)
- Firebase CLI local: **UNAVAILABLE** (`node_modules/.bin/firebase` absent)
- `npm ci`: **BLOCKED**; command timed out while dependency fetches repeatedly failed with DNS `EAI_AGAIN` against npm registry/package gateway. Partial `node_modules` was removed.

## Firebase identity
- Expected source project: `quanly-tst`
- CLI-resolved project: **UNKNOWN** — Firebase CLI unavailable
- Authenticated Firebase user: **UNKNOWN** — `firebase login:list` EXIT 127
- Projects list: **UNKNOWN** — `firebase projects:list` EXIT 127
- Active Firebase project: **UNKNOWN** — `firebase use` EXIT 127
- Current Hosting sites: **UNKNOWN**
- Current remote Functions: **UNKNOWN**
- Rules Emulator: **BLOCKED**

No Firebase mutation/deploy command was executed in H7.
