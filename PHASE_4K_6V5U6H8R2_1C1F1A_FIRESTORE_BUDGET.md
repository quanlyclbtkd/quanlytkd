# PHASE 4K-6V5U6H8R2.1C1F1A — Firestore Static Budget

| Primitive | Before | After | Delta |
|---|---:|---:|---:|
| getDoc | 29 | 29 | 0 |
| getDocs | 51 | 51 | 0 |
| onSnapshot | 16 | 16 | 0 |

F1A adds no Firestore read, no listener, no idempotency collection and no new payment writer authority.

The existing tuition-delete reconciliation read remains unchanged; it is not a new F1A read.
