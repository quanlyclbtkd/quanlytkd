# PHASE 4K-6V5U6H5 — Firestore Static Budget

| Call-site | H4 baseline | H5 final | Delta | Acceptance |
|---|---:|---:|---:|---|
| `getDoc` | 29 | 29 | 0 | PASS |
| `getDocs` | 51 | 51 | 0 | PASS |
| `onSnapshot` | 16 | 16 | 0 | PASS |

`npm run check:startup-read-budget-freeze` → **8/8 PASS**.

H5 adds no Firestore reader, no Firestore listener, no writer authority, no polling loop, and no profile read for Exam export.
