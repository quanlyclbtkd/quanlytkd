# D1B — Rules R1–R11 Result

Status: **BLOCKED BY ENVIRONMENT**.

Environment:
- Node `v22.16.0`
- npm `10.9.2`
- Java `openjdk 21.0.11`
- global `firebase`: unavailable (`command not found`, exit 127)
- local `node_modules/.bin/firebase`: unavailable
- `timeout 20s npx --no-install firebase --version`: exit **124**
- `npm run check:rules:emulator`: exit **127**, `firebase: not found`

Existing command attempted:
`firebase emulators:exec --only firestore --project demo-taekwondo-6v4b "node tools/firestore-rules-6v4b.test.mjs"`

R1–R11 counts: **PASS 0 / FAIL 0 / NOT EXECUTED 11**.

No Firestore Rules were modified or weakened.
