# PHASE 4K-6V5U6H8 — Preflight Environment Matrix

| Item | Result |
|---|---|
| H7 source package SHA-256 | `86bbce69d16baa840d59896ef2240039a2c268e17e5e25d3e0f2572e804e845a` |
| H7 package identity | MATCHED |
| Node | `v22.16.0` |
| npm | `10.9.2` |
| Java | OpenJDK `21.0.11` |
| npm ignore-scripts | `false` |
| Global Firebase CLI | BLOCKED — command not found |
| Local Firebase CLI | BLOCKED — `node_modules/.bin/firebase` absent |
| `npm run check:release` | PASS — 36/36, EXIT 0 |
| Expected Firebase project | `quanly-tst` |
| CLI-resolved Firebase project | UNKNOWN |
| Firebase authenticated accounts | UNKNOWN |
| Hosting site | UNKNOWN remotely; local hosting public=`public` |
| Rules Emulator availability | BLOCKED — Firebase CLI unavailable |
| Remote Functions access | BLOCKED / UNKNOWN |
| Root↔public current parity | PASS — 123/123 exact |
| Static Firestore budget | getDoc=29, getDocs=51, onSnapshot=16 |
| Runtime source delta from H7 before evidence | 0 files |

## Stop condition
`npm ci` could not complete. An explicit registry probe returned `EAI_AGAIN registry.npmjs.org`. H8 therefore stops Firebase rollout at toolchain recovery; no Hosting/Rules/Functions mutation is authorized or executed.
