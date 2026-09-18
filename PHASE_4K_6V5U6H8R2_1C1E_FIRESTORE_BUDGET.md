# PHASE 4K-6V5U6H8R2.1C1E — FIRESTORE STATIC BUDGET

Canonical scanner semantics are the same as C1D and exclude approved diagnostic/migration wrapper false positives.

| Metric | C1D baseline | C1E after | Delta | Acceptance |
|---|---:|---:|---:|---|
| `getDoc` | 29 | 29 | 0 | PASS |
| `getDocs` | 51 | 51 | 0 | PASS |
| `onSnapshot` | 16 | 16 | 0 | PASS |

Result: **29 / 51 / 16 — PASS**.

No threshold was increased. No Firestore reader/listener was added to satisfy the UI patch.
